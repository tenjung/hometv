import {useEffect,useMemo,useState} from 'react';
import {ArrowUpRight,Check,ChevronLeft,ChevronRight,Clock3,ExternalLink,Heart,Home,LayoutGrid,LoaderCircle,LockKeyhole,LogOut,Monitor,Play,Plus,Search,Settings,ShieldCheck,Signal,SlidersHorizontal,Sparkles,Tv,Wifi,X} from 'lucide-react';
import {api,Dialog,external,isDirectLive,playBadge,useRemoteNavigation,useStored} from './lib';
import type {Channel,Session,View} from './types';
import {Watch} from './Watch';
import {Manage} from './Manage';
import {IptvPage,iptvChannels,type IptvSource} from './iptv';
import {getSbsChannel,getOfficialChannel} from '../shared/playback.mjs';

type Layer={type:'watch';id:string}|{type:'help'}|{type:'manage'}|{type:'admin'}|null;
const navs:{id:View;name:string;icon:typeof Home}[]=[{id:'home',name:'홈',icon:Home},{id:'live',name:'실시간 TV',icon:Signal},{id:'iptv',name:'IPTV',icon:Tv},{id:'external',name:'외부 TV',icon:ArrowUpRight},{id:'vod',name:'드라마 · 예능',icon:LayoutGrid},{id:'favorites',name:'즐겨찾기',icon:Heart},{id:'recent',name:'최근 이용',icon:Clock3}];

function Brand(){return <div className="brand"><span className="brand-icon"><Tv size={23} strokeWidth={2.4}/></span><span>집<span className="brand-tv">TV</span></span></div>}

function PinForm({admin=false,onSuccess,onCancel}:{admin?:boolean;onSuccess:(s:Session)=>void;onCancel?:()=>void}){
 const [pin,setPin]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e?:React.FormEvent){e?.preventDefault();if(pin.length<6){setError('PIN을 6자리 이상 입력해 주세요.');return;}setBusy(true);setError('');try{onSuccess(await api<Session>('/login',{method:'POST',body:JSON.stringify({pin,role:admin?'admin':'family'})}));}catch(e){setError((e as Error).message);setPin('');}finally{setBusy(false);}}
 return <form className="pin-form" onSubmit={submit}><div className="eyebrow">{admin?'MANAGE YOUR HOME TV':'WELCOME HOME'}</div><h1>{admin?'우리집 TV 관리':'편안한 시청의 시작'}</h1><p>{admin?'관리자 PIN으로 링크와 시청 환경을 관리하세요.':'가족 PIN을 입력하고 우리집 TV로 들어오세요.'}</p><label className="field-label" htmlFor={admin?'admin-pin':'family-pin'}>{admin?'관리자 PIN':'가족 PIN'}</label><input id={admin?'admin-pin':'family-pin'} className="pin-input" type="password" autoComplete="off" inputMode="numeric" maxLength={12} value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,''));setError('');}} placeholder="••••••" aria-describedby="pin-error"/><div className="numpad" aria-label="리모컨용 숫자 키패드">{['1','2','3','4','5','6','7','8','9','지우기','0','삭제'].map(n=><button key={n} type="button" className={n.length>1?'small-key':''} onClick={()=>{setError('');setPin(p=>n==='지우기'?'':n==='삭제'?p.slice(0,-1):(p+n).slice(0,12));}}>{n}</button>)}</div><p className="form-error" id="pin-error" role="alert">{error}</p><button className="primary full" disabled={busy} type="submit">{busy?<LoaderCircle className="spin" size={20}/>:admin?<LockKeyhole size={18}/>:<Play size={18} fill="currentColor"/>}{admin?'관리 시작':'우리집 TV 들어가기'}</button>{onCancel&&<button className="text-button full" type="button" onClick={onCancel}>돌아가기</button>}<span className="pin-note"><ShieldCheck size={14}/>이 기기에 접속 상태를 기억해요</span></form>
}

// 채널 카드의 로고/문구. 홈 타일과 상단 배너에서 함께 쓴다.
function artMark(channel:Channel){
 const sbs=getOfficialChannel(channel);
 if(channel.logo)return <><img className="channel-logo" src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none';}}/><em>{channel.iptv?.group||'IPTV'}</em></>;
 if(channel.art==='solo')return <><small>나는</small><strong>SOLO</strong><em>그들의 사랑은 계속된다</em></>;
 if(channel.art==='sample')return <><small>TAKE A LITTLE BREAK</small><strong>A little<br/>bloom.</strong><em>플레이어 체험</em></>;
 const word=sbs?sbs.name:channel.art==='sbs'?'SBS':channel.art==='kbs'?'KBS':channel.art==='ebs'?'EBS':channel.art==='drama'?'RE:PLAY':channel.kind==='external'&&channel.art==='custom'?channel.title.split(' ')[0]:<Tv size={46}/>;
 const caption=sbs?(sbs.group==='radio'?'LIVE RADIO':sbs.group==='24tv'?'24 HOURS':'LIVE TV'):channel.art==='drama'?'다시 만나는 이야기':channel.kind==='external'?'ON AIR':'HOME CINEMA';
 return <><span className={'channel-wordmark '+(sbs?'sbs-wordmark':'')}>{word}</span><em>{caption}</em></>;
}

function groupLabel(channel:Channel){
 if(channel.iptv)return channel.iptv.group?`${channel.iptv.sourceName} · ${channel.iptv.group}`:channel.iptv.sourceName;
 const official=getOfficialChannel(channel),group=official?.group;
 if(group==='tv')return official!.broadcaster+' 실시간 TV';
 if(group==='24tv')return 'SBS 24시간 TV';
 if(group==='radio')return official!.broadcaster+' 라디오';
 return channel.category==='live'?'실시간 TV':'드라마 · 예능';
}

function statusText(channel:Channel){
 const sbs=getSbsChannel(channel);
 if(channel.iptv)return 'IPTV 재생 목록';
 if(channel.verified)return 'TV 재생 확인';
 if(sbs?.mode==='preview')return '공식 미리보기 · 로그인 후 계속';
 return channel.kind==='external'?'외부 사이트에서 시청':'집TV에서 바로 재생';
}

function StatusChip({channel}:{channel:Channel}){
 const b=playBadge(channel);
 if(!b)return null;
 return <span className={'gtv-chip '+b.tone}>{b.tone==='live'&&<span/>}{b.text}</span>;
}

type TileSize='app'|'wide';

function Tile({channel,size,onOpen,onFocus,program}:{channel:Channel;size:TileSize;onOpen:()=>void;onFocus:()=>void;program?:React.ReactNode}){
 return <button className={'gtv-tile '+size} onClick={onOpen} onFocus={onFocus} onMouseEnter={onFocus} data-channel-id={channel.id} aria-label={`${channel.title}, ${groupLabel(channel)}`}>
  <span className={'gtv-art art-'+channel.art}>
   <span className="art-noise"/>
   <StatusChip channel={channel}/>
   <span className="art-type">{artMark(channel)}</span>
  </span>
  <span className="gtv-label"><strong>{channel.title}</strong>{size==='wide'&&(program||<small>{channel.subtitle||groupLabel(channel)}</small>)}</span>
 </button>;
}

function Hero({channel}:{channel:Channel}){
 return <section className="gtv-hero" aria-live="polite">
  <div className={'gtv-hero-bg art-'+channel.art} aria-hidden="true"/>
  <div className="gtv-hero-art" aria-hidden="true"><span className="art-type">{artMark(channel)}</span></div>
  <div className="gtv-hero-shade"/>
  <div className="gtv-hero-copy">
   <span className="gtv-kicker">{isDirectLive(channel)&&<span className="gtv-dot"/>}{groupLabel(channel)}</span>
   <h1>{channel.title}</h1>
   <p>{channel.description||channel.subtitle}</p>
   <span className="gtv-meta">{statusText(channel)}</span>
  </div>
 </section>;
}

// 외부 TV 메뉴의 분류. 예전 항목(분류 없음)은 표시 문구·종류로 나눈다.
const EXTERNAL_GROUPS=['지상파 온에어','종편 · 뉴스 온에어','유튜브 뉴스 라이브','방송사 다시보기','OTT (로그인 필요)','기타 링크'];
const externalGroup=(c:Channel)=>c.group||(c.badge==='공식'?(c.category==='vod'?'방송사 다시보기':'지상파 온에어'):'기타 링크');

export default function App(){
 useRemoteNavigation();
 const [liveGroup,setLiveGroup]=useState('all');
 const [session,setSession]=useState<Session|null>(null),[initialError,setInitialError]=useState(''),[channels,setChannels]=useState<Channel[]>([]),[loading,setLoading]=useState(false),[catalogError,setCatalogError]=useState('');
 const [view,setView]=useState<View>('home'),[query,setQuery]=useState(''),[layer,setLayer]=useState<Layer>(null),[toast,setToast]=useState('');
 const [favorites,setFavorites]=useStored<string[]>('hometv-favorites',[]),[recent,setRecent]=useStored<string[]>('hometv-recent',[]),[tv,setTv]=useStored<boolean>('hometv-tv',/Android.*(TV|BRAVIA|AFT|SHIELD)|GoogleTV/i.test(navigator.userAgent));
 const [clock,setClock]=useState(new Date());
 const [iptvSources,setIptvSources]=useState<IptvSource[]>([]);
 async function load(){setLoading(true);setCatalogError('');try{const data=await api<{channels:Channel[]}>('/channels');setChannels(data.channels);api<{sources:IptvSource[]}>('/iptv').then(d=>setIptvSources(d.sources)).catch(()=>{});}catch(e){setCatalogError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{api<Session>('/session').then(setSession).catch(e=>setInitialError(e.message));const timer=setInterval(()=>setClock(new Date()),30000);const expired=()=>{setSession({authenticated:true,admin:false});setLayer(null);};window.addEventListener('session-expired',expired);return()=>{clearInterval(timer);window.removeEventListener('session-expired',expired);};},[]);
 useEffect(()=>{if(session?.authenticated)void load();},[session?.authenticated,session?.admin]);
 useEffect(()=>{const tick=()=>{if(document.visibilityState==='visible'&&session?.authenticated)void load();};window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};},[session?.authenticated]);
 useEffect(()=>{document.documentElement.classList.toggle('tv-mode',tv);},[tv]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{const pop=()=>{if(location.hash==='#watch'||location.hash==='#watch-panel')return;setLayer(null);};window.addEventListener('popstate',pop);const back=(e:KeyboardEvent)=>{if(['BrowserBack','GoBack'].includes(e.key)&&layer){e.preventDefault();if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else history.back();}};window.addEventListener('keydown',back);return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('keydown',back);};},[layer]);
 function open(next:NonNullable<Layer>){history.pushState({hometv:true},'',`#${next.type}`);setLayer(next);}
 function close(){if(history.state?.hometv)history.back();else setLayer(null);}
 function favorite(id:string){setFavorites(list=>list.includes(id)?list.filter(x=>x!==id):[...list,id]);}
 function markRecent(id:string){setRecent(list=>[id,...list.filter(x=>x!==id)].slice(0,24));}
 const visible=channels.filter(c=>c.visible);
 const allIptv=useMemo(()=>iptvChannels(iptvSources),[iptvSources]);
 const everything=useMemo(()=>[...channels.filter(c=>c.visible),...allIptv],[channels,allIptv]);
 const filtered=useMemo(()=>(query||view==='favorites'||view==='recent'?everything:visible).filter(c=>(view==='home'||view==='live'&&c.category==='live'&&!c.group||view==='vod'&&c.category==='vod'&&!c.group||view==='external'&&c.kind==='external'||view==='favorites'&&favorites.includes(c.id)||view==='recent'&&recent.includes(c.id))&&`${c.title} ${c.subtitle}`.toLowerCase().includes(query.toLowerCase())&&(view!=='live'||liveGroup==='all'||(liveGroup==='custom'?!getOfficialChannel(c):liveGroup==='kbs'?getOfficialChannel(c)?.broadcaster==='KBS':getSbsChannel(c)?.group===liveGroup))).sort((a,b)=>view==='recent'?recent.indexOf(a.id)-recent.indexOf(b.id):a.order-b.order),[channels,everything,view,favorites,recent,query,liveGroup]);
 const [featured,setFeatured]=useState(''),[searchOpen,setSearchOpen]=useState(false);
 function navigate(next:View){setView(next);setQuery('');setSearchOpen(false);setLiveGroup('all');window.scrollTo({top:0,behavior:'smooth'});}
 const pick=(ids:string[])=>ids.map(id=>everything.find(c=>c.id===id)).filter((c):c is Channel=>!!c);
 const favoriteRow=pick(favorites),recentRow=pick(recent).slice(0,12);
 const directLiveRow=visible.filter(isDirectLive);
 const myLiveRow=visible.filter(c=>c.category==='live'&&!getOfficialChannel(c)&&!c.group);
 const externalRow=visible.filter(c=>c.kind==='external');
 const sbsRow=(group:'tv'|'24tv'|'radio')=>visible.filter(c=>getSbsChannel(c)?.group===group);
 const kbsRow=(group:'tv'|'radio')=>visible.filter(c=>{const o=getOfficialChannel(c);return o?.broadcaster==='KBS'&&o.group===group;});
 const vodRow=visible.filter(c=>c.category==='vod'&&!c.group);
 const homeDefault=favoriteRow[0]||visible.find(c=>c.id==='solo')||visible[0];
 const featuredChannel=visible.find(c=>c.id===featured)||homeDefault;
 const isHome=view==='home'&&!query;
 function watch(id:string){open({type:'watch',id});}
 function tile(c:Channel,size:TileSize,program?:React.ReactNode){return <Tile key={c.id} channel={c} size={size} program={program} onOpen={()=>watch(c.id)} onFocus={()=>setFeatured(c.id)}/>;}
 function row(title:string,items:Channel[],size:TileSize='wide',more?:()=>void){
  if(!items.length)return null;
  return <section className="gtv-row" key={title}><div className="gtv-row-head"><h2>{title}</h2>{more&&<button className="gtv-more" onClick={more}>전체 보기<ChevronRight size={16}/></button>}</div><div className={'gtv-track '+size}>{items.map(c=>tile(c,size))}</div></section>;
 }
 // 시청 화면 오른쪽 목록: 같은 분류의 채널끼리 묶는다.
 function relatedFor(c:Channel){if(c.iptv){const {sourceId,group}=c.iptv;return allIptv.filter(x=>x.iptv?.sourceId===sourceId&&x.iptv.group===group);}const o=getOfficialChannel(c);return visible.filter(x=>{if(x.category!==c.category)return false;const p=getOfficialChannel(x);return o?p?.broadcaster===o.broadcaster&&p.group===o.group:!p;});}
 function switchChannel(id:string){history.replaceState(history.state,'','#watch');setLayer({type:'watch',id});}
 async function logout(){try{await api('/logout',{method:'POST',body:'{}'});setSession({authenticated:true,admin:false});setToast('관리자 접속을 마쳤어요.');}catch(e){setToast((e as Error).message);}}
 const active=layer?.type==='watch'?(channels.find(c=>c.id===layer.id)||allIptv.find(c=>c.id===layer.id)):null;
 const time=clock.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});
 if(!session)return <div className="boot"><Brand/>{initialError?<><p role="alert">{initialError}</p><button className="secondary" onClick={()=>location.reload()}>다시 불러오기</button></>:<LoaderCircle className="spin" size={28}/>}</div>;
 if(!session.authenticated)return <main className="login-page"><section className="login-story"><Brand/><div className="login-message"><span className="eyebrow">YOUR VERY OWN SCREEN</span><h2>오늘도, 집이<br/>가장 좋은<br/><span>영화관.</span></h2><p>좋아하는 방송과 이야기들을 한곳에.<br/>우리 가족만의 TV가 시작됩니다.</p><div className="login-perks"><span><Tv size={16}/>안드로이드 TV</span><span><Monitor size={16}/>PC</span><span><Heart size={16}/>우리 가족</span></div></div><div className="login-caption">조금 더 편안한 우리집의 저녁 · 집TV</div></section><section className="login-entry"><PinForm onSuccess={setSession}/><button className="login-admin" onClick={()=>open({type:'admin'})}><Settings size={15}/>관리자로 접속</button></section>{layer?.type==='admin'&&<Dialog title="관리자 접속" onClose={close}><PinForm admin onSuccess={s=>{setSession(s);close();}} onCancel={close}/></Dialog>}</main>;
 return <div className="gtv-shell">
 <header className="gtv-top">
  <nav className="gtv-tabs" aria-label="주 메뉴">
   {searchOpen||query
    ?<label className="gtv-search"><Search size={20}/><input autoFocus aria-label="등록한 방송과 사이트 검색" placeholder="보고 싶은 방송 찾기" value={query} onChange={e=>setQuery(e.target.value)} onBlur={()=>{if(!query)setSearchOpen(false);}}/>{query&&<button aria-label="검색 지우기" onClick={()=>{setQuery('');setSearchOpen(false);}}><X size={16}/></button>}</label>
    :<button className="gtv-tab" onClick={()=>setSearchOpen(true)}><Search size={20}/>검색</button>}
   {navs.filter(n=>n.id!=='iptv'||iptvSources.length>0).map(({id,name})=><button key={id} className={'gtv-tab '+(view===id&&!query?'active':'')} onClick={()=>navigate(id)} aria-current={view===id&&!query?'page':undefined}>{name}</button>)}
  </nav>
  <div className="gtv-status">
   <button className={'gtv-icon '+(tv?'on':'')} onClick={()=>{setTv(v=>!v);setToast(tv?'PC 화면으로 전환했어요.':'TV 모드로 전환했어요. 방향키로 이동해 보세요.');}} aria-pressed={tv} aria-label="TV 모드" title="TV 모드"><Tv size={22}/></button>
   <button className="gtv-icon" onClick={()=>open({type:'help'})} aria-label="TV 이용 도움말" title="도움말"><ShieldCheck size={22}/></button>
   <button className="gtv-icon" onClick={()=>open({type:session.admin?'manage':'admin'})} aria-label="링크 및 설정 관리" title="설정"><Settings size={22}/></button>
   {session.admin&&<button className="gtv-icon" onClick={logout} aria-label="관리자 접속 종료" title="관리자 접속 종료"><LogOut size={21}/></button>}
   <span className="gtv-avatar" aria-hidden="true">H</span>
   <time>{time}</time>
  </div>
 </header>
 <main className="gtv-main" id="main-content">
  {catalogError?<div className="empty-state"><Wifi/><h2>목록을 불러오지 못했어요</h2><p role="alert">{catalogError}</p><button className="secondary" onClick={load}>다시 시도</button></div>
  :loading&&channels.length===0?<div className="empty-state"><LoaderCircle className="spin"/><p>우리집 TV를 준비하고 있어요.</p></div>
  :isHome?<>
   {featuredChannel&&<Hero channel={featuredChannel}/>}
   <div className="gtv-rows">
    {row('지금 바로 보는 LIVE',directLiveRow,'wide')}
    {row('즐겨 찾는 채널',favoriteRow,'app',()=>navigate('favorites'))}
    {row('최근 이용',recentRow,'app',()=>navigate('recent'))}
    {row('우리집 채널',myLiveRow)}
    {iptvSources.map(src=>row(src.name,allIptv.filter(c=>c.iptv?.sourceId===src.id).slice(0,20),'wide',()=>navigate('iptv')))}
    {row('외부 TV · 방송사 사이트',externalRow.slice(0,16),'wide',()=>navigate('external'))}
    {row('KBS 실시간 TV',kbsRow('tv'),'wide',()=>{navigate('live');setLiveGroup('kbs');})}
    {row('SBS 실시간 TV',sbsRow('tv'),'wide',()=>{navigate('live');setLiveGroup('tv');})}
    {row('하루 종일, 24시간 TV',sbsRow('24tv'),'wide',()=>{navigate('live');setLiveGroup('24tv');})}
    {row('SBS 라디오',sbsRow('radio'))}
    {row('KBS 라디오',kbsRow('radio'))}
    {row('다시 만나는 이야기',vodRow,'wide',()=>navigate('vod'))}
   </div>
  </>
  :<>
   <div className="gtv-page-head"><h1>{query?'검색 결과':navs.find(n=>n.id===view)?.name}</h1><p>{query?`“${query}” · ${filtered.length}개`:`${view==='iptv'?allIptv.length:filtered.length}개의 채널`}</p></div>
   {view==='live'&&!query&&<div className="live-filters" role="group" aria-label="라이브 채널 분류">{[['all','전체'],['kbs','KBS'],['tv','SBS TV'],['24tv','24시간 TV'],['radio','라디오'],['custom','우리집 채널']].map(([id,label])=><button key={id} className={liveGroup===id?'selected':''} aria-pressed={liveGroup===id} onClick={()=>setLiveGroup(id)}>{label}</button>)}</div>}
   {view==='external'&&!query?<div className="external-page"><p className="external-note">방송사 공식 사이트로 이동해서 봐요. 리모컨 <kbd>뒤로</kbd>로 집TV에 돌아올 수 있어요.</p>{[...EXTERNAL_GROUPS,...new Set(filtered.map(externalGroup))].filter((g,i,a)=>a.indexOf(g)===i).map(g=>{const items=filtered.filter(c=>externalGroup(c)===g);return items.length?<section className="gtv-row" key={g}><div className="gtv-row-head"><h2>{g}</h2></div><div className="gtv-grid">{items.map(c=>tile(c,'wide'))}</div></section>:null;})}</div>
   :view==='iptv'&&!query?<IptvPage sources={iptvSources} render={(c,program)=>tile(c,'wide',program)}/>
   :filtered.length?<div className="gtv-grid">{filtered.map(c=>tile(c,'wide'))}</div>
   :<div className="empty-state">{view==='favorites'?<Heart/>:view==='recent'?<Clock3/>:<Search/>}<h2>{query?'찾는 항목이 없어요':view==='favorites'?'좋아하는 방송을 담아보세요':view==='recent'?'아직 이용한 항목이 없어요':'등록된 항목이 없어요'}</h2><p>{query?'등록한 제목이나 설명으로 다시 검색해 주세요.':view==='favorites'?'시청 화면의 하트를 누르면 이곳에 모아드려요.':'홈에서 방송을 선택하거나 관리 화면에서 링크를 추가해 주세요.'}</p><button className="secondary" onClick={()=>navigate('home')}>홈으로</button></div>}
  </>}
  <footer className="gtv-footer"><span><kbd>↑↓←→</kbd> 이동</span><span><kbd>확인</kbd> 선택</span><span><kbd>뒤로</kbd> 돌아가기</span></footer>
 </main>
 {active&&<Dialog title={active.title} onClose={close} wide full><Watch key={active.id} channel={active} related={relatedFor(active)} listTitle={groupLabel(active)} onSwitch={switchChannel} favorite={favorites.includes(active.id)} onFavorite={()=>favorite(active.id)} onClose={close} onVisit={()=>markRecent(active.id)} onToast={setToast}/></Dialog>}
 {layer?.type==='help'&&<Dialog title="TV 이용 도움말" onClose={close} wide><div className="modal-heading"><div><span className="eyebrow">A LITTLE HELP</span><h2>TV에서도 편안하게</h2></div><button className="icon-button" onClick={close} aria-label="닫기"><X/></button></div><div className="help-content"><div className="help-intro"><ShieldCheck size={30}/><div><h3>인증 화면이 반복되거나 영상이 안 보인다면</h3><p>외부 사이트의 인증과 영상 재생은 별개예요. 아래 순서로 확인해 주세요.</p></div></div><div className="help-steps"><section><span>1</span><div><h3>TV 브라우저를 최신 상태로</h3><p>설치된 브라우저와 Android System WebView의 업데이트를 확인하세요. 기기에 따라 업데이트 항목이 다를 수 있어요.</p></div></section><section><span>2</span><div><h3>쿠키와 JavaScript 허용</h3><p>브라우저 설정에서 쿠키·JavaScript·사이트 저장소를 허용하세요. 인증 관련 콘텐츠가 차단되고 있지 않은지도 확인해 주세요.</p></div></section><section><span>3</span><div><h3>원본 사이트에서 직접 확인</h3><p>방송 상세의 ‘원본 사이트 열기’로 접속해 인증을 완료하세요. 인증이 반복되면 무한 새로고침 대신 다른 지원 브라우저로 시도해 보세요.</p></div></section><section><span>4</span><div><h3>다른 경로 또는 휴대폰으로</h3><p>등록된 대체 경로를 선택하거나 QR 코드를 휴대폰으로 스캔하세요. 휴대폰에서 인증해도 TV의 인증이 풀리지는 않아요.</p></div></section></div><div className="notice"><strong>알아두세요</strong><p>집TV는 외부 사이트의 봇 차단을 해제하거나 인증을 대신하지 않아요. ‘TV 재생 확인’은 관리자가 실제 기기에서 확인한 기록이며, 이후 사이트 상황에 따라 달라질 수 있어요.</p></div><div className="source-reference"><span>링크를 더 찾아보고 싶다면</span><button className="text-button" onClick={()=>external('https://wdwd16.com/bbs/ContentsList.php?idx=5')}>주소월드 무료드라마 목록 열기 <ExternalLink size={14}/></button><small>외부 링크 목록입니다. 각 사이트의 이용 조건을 확인한 뒤 관리 화면에 등록해 주세요.</small></div></div></Dialog>}
 {layer?.type==='admin'&&<Dialog title="관리자 접속" onClose={close}><PinForm admin onSuccess={s=>{setSession(s);setLayer({type:'manage'});}} onCancel={close}/></Dialog>}
 {layer?.type==='manage'&&session.admin&&<Dialog title="링크 및 설정 관리" onClose={close} wide><Manage channels={channels} onChange={load} onClose={close} onToast={setToast}/></Dialog>}
 {toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}
 </div>;
}
