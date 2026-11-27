import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ChevronDown,ChevronUp,ExternalLink,Flag,Heart,LoaderCircle,Maximize,Pause,Play,Radio,RotateCcw,SkipBack,SkipForward,Volume2,VolumeX,X} from 'lucide-react';
import QRCode from 'qrcode';
import {api,external,playBadge,validHttps} from './lib';
import type {Channel} from './types';
import {resolvePlayback,getOfficialChannel} from '../shared/playback.mjs';
import {mediaRemoteAction,playerRemoteAction} from '../shared/remote.mjs';
import {nowNext} from '../shared/iptv.mjs';
import {useEpg,ProgramLine,hhmm} from './iptv';

type Panel='info'|'channels'|null;
const PANEL_HASH='#watch-panel';

// 넷플릭스·티빙식 전체화면 플레이어. 썸네일을 고르면 바로 화면 가득 재생하고,
// 리모컨 위 = 방송 정보, 아래 = 채널 목록, 좌우(실시간) · 채널 키 = 이전/다음 채널.
export function Watch({channel:c,related=[],listTitle='',onSwitch,favorite,onFavorite,onClose,onVisit,onToast}:{channel:Channel;related?:Channel[];listTitle?:string;onSwitch?:(id:string)=>void;favorite:boolean;onFavorite:()=>void;onClose:()=>void;onVisit:()=>void;onToast:(s:string)=>void}){
 const video=useRef<HTMLVideoElement>(null),player=useRef<HTMLDivElement>(null),hlsRef=useRef<import('hls.js').default|null>(null),visitRef=useRef(onVisit);visitRef.current=onVisit;
 const [playing,setPlaying]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[muted,setMuted]=useState(false),[qr,setQr]=useState(''),[reporting,setReporting]=useState(false),[retry,setRetry]=useState(0);
 const [panel,setPanel]=useState<Panel>(null),[hud,setHud]=useState(true),[pick,setPick]=useState(0);
 const official=getOfficialChannel(c),isIptv=c.kind==='iptv',broadcast=c.kind==='sbs-live'||c.kind==='kbs-live'||isIptv,isExternal=c.kind==='external';
 const isLive=(c.kind==='hls'||broadcast)&&c.category==='live';
 const isRadio=official?.group==='radio';
 const [previewRemaining,setPreviewRemaining]=useState<number|null>(null);
 const index=related.findIndex(x=>x.id===c.id),hasList=related.length>1&&!!onSwitch;
 const number=index>=0?index+1:null;
 const {programs,now}=useEpg(c.iptv?.sourceId,related.length?related.map(x=>x.id):[c.id]);
 const show=nowNext(programs[c.id],now);
 const hudTimer=useRef<ReturnType<typeof setTimeout>>(undefined),panelTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const pendingSwitch=useRef<string|null>(null),panelPushed=useRef(false),stripRef=useRef<HTMLDivElement>(null);

 // 화면 위 안내(HUD): 조작이 있으면 잠깐 보였다가 재생 중이면 사라진다.
 function poke(){setHud(true);clearTimeout(hudTimer.current);hudTimer.current=setTimeout(()=>setHud(false),4000);}
 useEffect(()=>{poke();return()=>clearTimeout(hudTimer.current);},[]);
 useEffect(()=>{if(!playing){clearTimeout(hudTimer.current);setHud(true);}else poke();},[playing]);

 // 패널은 히스토리 한 칸을 차지해서, TV 리모컨의 뒤로 버튼이 패널부터 닫도록 한다.
 function openPanel(next:Exclude<Panel,null>){
  if(next==='channels'&&!hasList){poke();return;}
  if(next==='channels')setPick(Math.max(0,index));
  if(!panelPushed.current){history.pushState({hometv:true,panel:true},'',PANEL_HASH);panelPushed.current=true;}
  setPanel(next);setHud(false);armPanel();
 }
 // 목록으로: 패널이 히스토리를 한 칸 더 쓰고 있으면 두 칸 돌아간다.
 function leave(){clearTimeout(panelTimer.current);if(panelPushed.current){panelPushed.current=false;history.go(-2);}else onClose();}
 function closePanel(){if(panelPushed.current)history.back();else setPanel(null);}
 function armPanel(){clearTimeout(panelTimer.current);panelTimer.current=setTimeout(closePanel,12000);}
 function select(id:string){if(id===c.id){closePanel();return;}if(panelPushed.current){pendingSwitch.current=id;history.back();}else onSwitch?.(id);}
 useEffect(()=>{const pop=()=>{if(location.hash===PANEL_HASH)return;panelPushed.current=false;setPanel(null);clearTimeout(panelTimer.current);const id=pendingSwitch.current;pendingSwitch.current=null;if(id)onSwitch?.(id);};window.addEventListener('popstate',pop);return()=>{window.removeEventListener('popstate',pop);clearTimeout(panelTimer.current);};},[onSwitch]);
 // 채널 목록이 열리면 현재 채널에 초점을 둔다.
 useEffect(()=>{if(panel!=='channels')return;const el=stripRef.current?.querySelectorAll<HTMLButtonElement>('.strip-card')[pick];el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});},[panel,pick]);
 useEffect(()=>{if(panel==='info')player.current?.querySelector<HTMLButtonElement>('.info-actions button')?.focus();else if(!panel)(player.current?.querySelector<HTMLButtonElement>('.player-external .primary')||player.current)?.focus({preventScroll:true});},[panel]);

 useEffect(()=>{let alive=true;QRCode.toDataURL(c.originalUrl,{width:240,margin:2,color:{dark:'#15171c',light:'#ffffff'},errorCorrectionLevel:'M'}).then(data=>{if(alive)setQr(data);}).catch(()=>{});return()=>{alive=false;};},[c.originalUrl]);

 // 재생: 공식 채널은 연결할 때마다 새 주소를 받는다. 썸네일을 고른 동작이 곧 재생 요청이므로 바로 자동 재생한다.
 useEffect(()=>{
  if(isExternal)return;const v=video.current!;let disposed=false,visited=false,sourceAttached=false,autoplayRequested=true;
  const controller=new AbortController();let previewLimit=0,previewKey='',previewDeadline=0,previewTimer:ReturnType<typeof setInterval>|undefined;
  const previewEnded=()=>{v.pause();hlsRef.current?.stopLoad();setBusy(false);setPlaying(false);setPreviewRemaining(0);setError('공식 미리보기가 끝났어요. SBS 원본 사이트에서 로그인 후 계속 시청해 주세요.');};
  const previewTick=()=>{const left=Math.max(0,Math.ceil((previewDeadline-Date.now())/1000));setPreviewRemaining(left);if(left===0){clearInterval(previewTimer);previewEnded();}};
  setReady(false);setError('');setPlaying(false);setTime(0);setDuration(0);setBusy(true);setPreviewRemaining(null);
  const loaded=()=>{setReady(true);setBusy(false);if(!isLive&&Number.isFinite(v.duration)){setDuration(v.duration);try{const saved=JSON.parse(localStorage.getItem('hometv-progress-'+c.id)||'null');if(saved?.url===c.url&&saved.time>3&&saved.time<v.duration-5)v.currentTime=saved.time;}catch{}}};
  const failed=()=>{if(disposed)return;setBusy(false);setError(broadcast?'방송 연결이 끊겼어요. 다시 불러오면 새 재생 주소로 연결합니다.':'영상을 불러오지 못했어요. 원본 사이트나 다른 경로를 이용해 주세요.');};
  const pause=()=>{setPlaying(false);setBusy(false);};
  const tryAutoplay=async()=>{if(disposed||!autoplayRequested||!sourceAttached)return;autoplayRequested=false;try{await v.play();}catch(e){if(disposed)return;setBusy(false);if((e as Error).name!=='NotAllowedError')failed();}};
  const canPlay=()=>{setBusy(false);void tryAutoplay();};
  const onPlaying=()=>{clearTimeout(timeout);if(previewLimit){if(!previewDeadline){previewDeadline=Date.now()+previewLimit*1000;try{sessionStorage.setItem(previewKey,String(previewDeadline));}catch{}}if(previewDeadline<=Date.now()){previewEnded();return;}previewTick();if(!previewTimer)previewTimer=setInterval(previewTick,500);}setPlaying(true);setBusy(false);setError('');if(!visited){visitRef.current();visited=true;}};
  let lastSave=0;
  const update=()=>{setTime(v.currentTime);if(!isLive&&Date.now()-lastSave>3000){try{localStorage.setItem('hometv-progress-'+c.id,JSON.stringify({url:c.url,time:v.currentTime}));}catch{}lastSave=Date.now();}};
  const waiting=()=>{if(!v.paused)setBusy(true);};
  v.addEventListener('loadedmetadata',loaded);v.addEventListener('canplay',canPlay);v.addEventListener('error',failed);v.addEventListener('pause',pause);v.addEventListener('playing',onPlaying);v.addEventListener('timeupdate',update);v.addEventListener('waiting',waiting);
  const timeout=setTimeout(()=>{if(!v.readyState){controller.abort();setError('응답이 지연되고 있어요. 다시 시도하거나 원본 사이트에서 확인해 주세요.');setBusy(false);}},20000);
  // KBS 스트림(AES-128)은 Chrome·WebView의 기본 HLS 재생에서 실패하므로 hls.js를 우선 사용한다.
  const nativeHls=!!v.canPlayType('application/vnd.apple.mpegurl'),needsHls=(c.kind==='hls'||broadcast)&&(!nativeHls||c.kind==='kbs-live'||isIptv);
  // IPTV: 중계(리디렉션) 주소는 서버가 최종 주소만 확인해 준다. 실패하면 원래 주소로 재생한다.
  const resolving=isIptv&&c.iptv?api<{url:string}>(`/iptv/resolve?source=${encodeURIComponent(c.iptv.sourceId)}&id=${encodeURIComponent(c.id)}`).then(d=>({url:d.url,previewSeconds:0,previewKey:''})).catch(()=>({url:c.url,previewSeconds:0,previewKey:''})):resolvePlayback(c,{signal:controller.signal});
  Promise.all([resolving,needsHls?import('hls.js'):Promise.resolve(null)]).then(([resolved,loadedModule])=>{
    if(disposed)return;
    const source=resolved.url;previewLimit=resolved.previewSeconds;
    // IPTV: https 주소는 hls.js(CORS 필요), 그 밖(http·CORS 없음)은 기기 기본 재생기로. hls.js가 실패하면 기본 재생기로 다시 시도한다.
    const plainFile=/\.(mp4|webm|mp3|aac)(\?|$)/i.test(new URL(source).pathname);
    const module=isIptv&&(plainFile||(!source.startsWith('https:')&&nativeHls))?null:loadedModule;
    if(isIptv&&!module&&!plainFile&&!nativeHls&&!source.startsWith('https:')){setBusy(false);setError('이 브라우저는 http 방송 주소를 재생하지 못해요. 집TV 안드로이드 앱이나 TV에서 열어 주세요.');return;}
    if(previewLimit){previewKey='hometv-sbs-preview:'+resolved.previewKey;try{const saved=Number(sessionStorage.getItem(previewKey));if(Number.isFinite(saved)&&saved>0)previewDeadline=Math.min(saved,Date.now()+previewLimit*1000);}catch{}if(previewDeadline&&previewDeadline<=Date.now()){clearTimeout(timeout);previewEnded();return;}setPreviewRemaining(previewDeadline?Math.ceil((previewDeadline-Date.now())/1000):previewLimit);}
    const Hls=module?.default;if(Hls&&!Hls.isSupported()&&nativeHls){sourceAttached=true;v.src=source;v.load();}else if(Hls){if(!Hls.isSupported()){setBusy(false);setError('이 브라우저는 해당 재생 방식을 지원하지 않아요. 원본 사이트로 이동해 주세요.');return;}const hls=new Hls({enableWorker:true,manifestLoadingMaxRetry:1,levelLoadingMaxRetry:1,fragLoadingMaxRetry:1});hlsRef.current=hls;hls.on(Hls.Events.MANIFEST_PARSED,()=>{sourceAttached=true;setReady(true);void tryAutoplay();});let fellBack=false;hls.on(Hls.Events.ERROR,(_e,data)=>{if(!data.fatal)return;if(isIptv&&nativeHls&&!fellBack&&!sourceAttached){fellBack=true;hls.destroy();hlsRef.current=null;sourceAttached=true;v.src=source;v.load();return;}failed();});hls.loadSource(source);hls.attachMedia(v);
    }else {sourceAttached=true;v.src=source;v.load();}
  }).catch(e=>{if(disposed||controller.signal.aborted)return;setBusy(false);setError((e as Error).message||'방송에 연결하지 못했어요. 원본 사이트에서 확인해 주세요.');});
  return()=>{disposed=true;controller.abort();clearTimeout(timeout);clearInterval(previewTimer);v.removeEventListener('loadedmetadata',loaded);v.removeEventListener('canplay',canPlay);v.removeEventListener('error',failed);v.removeEventListener('pause',pause);v.removeEventListener('playing',onPlaying);v.removeEventListener('timeupdate',update);v.removeEventListener('waiting',waiting);hlsRef.current?.destroy();hlsRef.current=null;v.pause();v.removeAttribute('src');v.load();};
 },[c.id,c.url,c.kind,isLive,retry]);

 async function play(){const v=video.current;if(!v||previewRemaining===0||(!ready&&busy))return;try{if(v.paused){setBusy(true);await v.play();}else v.pause();}catch{setBusy(false);setError('재생을 시작하지 못했어요. 다시 재생하거나 원본 사이트를 열어 주세요.');}}
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(player.current?.requestFullscreen)await player.current.requestFullscreen();else onToast('이 브라우저에서 전체화면을 지원하지 않아요.');}catch{onToast('전체화면을 열지 못했어요. 브라우저 설정을 확인해 주세요.');}}
 function seek(delta:number){const v=video.current;if(v&&Number.isFinite(v.duration))v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+delta));}
 function step(delta:number){if(!hasList)return;const next=related[(index+delta+related.length)%related.length];if(next&&next.id!==c.id)onSwitch!(next.id);}
 function open(url:string){if(validHttps(url)){onVisit();external(url);}}
 async function report(reason:string){setReporting(true);try{await api('/reports',{method:'POST',body:JSON.stringify({channelId:c.id,reason})});onToast('접속 문제를 관리자에게 기록했어요.');}catch(e){onToast((e as Error).message);}finally{setReporting(false);}}

 // 리모컨: 문서 캡처 단계에서 받아 홈 화면의 방향키 이동보다 먼저 처리한다.
 const keyRef=useRef<(e:KeyboardEvent)=>void>(()=>{});
 keyRef.current=e=>{
  const media=mediaRemoteAction(e);
  if(media){e.preventDefault();e.stopPropagation();const v=video.current;if(!v)return;if(media==='pause')v.pause();else if(media==='play'){if(v.paused)void play();}else if(media==='toggle')void play();else if(!isLive)seek(media==='rewind'?-10:10);poke();return;}
  if(e.key==='Escape'&&panel){e.preventDefault();e.stopPropagation();closePanel();return;}
  if(panel==='channels'){
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;
   e.preventDefault();e.stopPropagation();armPanel();
   if(e.key==='ArrowLeft')setPick(p=>Math.max(0,p-1));else if(e.key==='ArrowRight')setPick(p=>Math.min(related.length-1,p+1));
   else if(e.key==='ArrowUp')closePanel();else if(e.key==='Enter'||e.key===' '){const target=related[pick];if(target)select(target.id);}
   return;
  }
  if(panel==='info'){
   armPanel();
   if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();closePanel();return;}
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();const buttons=Array.from(player.current?.querySelectorAll<HTMLButtonElement>('.info-actions button:not(:disabled)')||[]);const at=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=buttons[Math.max(0,Math.min(buttons.length-1,at+(e.key==='ArrowRight'?1:-1)))];next?.focus();}
   else if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();}
   return;
  }
  // 패널이 없을 때: 화면의 버튼(마우스 조작용)에 초점이 있어도 리모컨 동작을 우선한다.
  const action=playerRemoteAction(e);if(!action)return;
  // 외부 사이트 항목: 확인 키는 초점 위치와 상관없이 원본 사이트를 연다.
  if(action==='toggle'&&isExternal){e.preventDefault();e.stopPropagation();open(c.url);return;}
  if(action==='toggle'&&document.activeElement instanceof HTMLButtonElement&&document.activeElement.closest('.player-controls'))return;
  e.preventDefault();e.stopPropagation();
  if(action==='toggle'){void play();poke();}
  else if(action==='info')openPanel('info');
  else if(action==='channels')openPanel('channels');
  else if(action==='next'||action==='prev')step(action==='next'?1:-1);
  else if(isLive||isExternal)step(action==='right'?1:-1);
  else{seek(action==='right'?10:-10);poke();}
 };
 useEffect(()=>{const handler=(e:KeyboardEvent)=>keyRef.current(e);document.addEventListener('keydown',handler,true);return()=>document.removeEventListener('keydown',handler,true);},[]);

 const fmt=(n:number)=>Number.isFinite(n)?`${Math.floor(n/60)}:${Math.floor(n%60).toString().padStart(2,'0')}`:'0:00';
 const badge=playBadge(c);
 const showHud=hud&&!panel;
 return <div className={'player'+(showHud?' hud-on':'')+(panel?' panel-on':'')} ref={player} tabIndex={-1} onMouseMove={()=>{if(!panel)poke();}} aria-label={`${c.title} 재생 화면. 위 버튼 방송 정보, 아래 버튼 채널 목록${isLive&&hasList?', 좌우 버튼 채널 이동':''}`}>
  {isExternal?<div className={'player-external art-'+c.art}><div className="external-orb"/><span className="eyebrow">{official?.broadcaster||'ON AIR'}</span><h2>{c.title}</h2><p>{c.subtitle}</p><button className="primary" autoFocus onClick={()=>open(c.url)}><ExternalLink size={20}/>사이트에서 시청하기</button><span className="external-hint">원본 사이트로 이동합니다 · 뒤로 버튼으로 돌아올 수 있어요</span></div>
  :<>
   <video ref={video} playsInline preload="auto" aria-label={c.title} onClick={()=>{if(panel)closePanel();else{void play();poke();}}} onDoubleClick={fullscreen}/>
   {isRadio&&<div className="radio-visual"><Radio size={56}/><span className="eyebrow">{official?.broadcaster||''} LIVE RADIO</span><h2>{c.title}</h2><p>{playing?'지금, 함께 듣고 있어요':'방송을 연결하고 있어요'}</p></div>}
   {previewRemaining!==null&&previewRemaining>0&&<div className="preview-banner"><span>공식 미리보기 · {previewRemaining}초 남음</span><button onClick={()=>open(c.originalUrl)}>SBS에서 계속 보기 <ExternalLink size={14}/></button></div>}
   {!playing&&!busy&&!error&&previewRemaining!==0&&<button className="big-play" onClick={play} aria-label="영상 재생"><Play size={42} fill="currentColor"/></button>}
   {busy&&<div className="video-loading" role="status"><LoaderCircle className="spin" size={44}/><span>{broadcast?'방송에 연결하고 있어요':'영상을 준비하고 있어요'}</span></div>}
   {error&&<div className="video-error" role="alert"><AlertCircle size={34}/><p>{error}</p><div>{previewRemaining!==0&&<button className="secondary" autoFocus onClick={()=>{setBusy(true);setRetry(r=>r+1);}}><RotateCcw size={16}/>다시 불러오기</button>}<button className="secondary" onClick={()=>open(c.originalUrl)}><ExternalLink size={16}/>원본 사이트 열기</button></div></div>}
  </>}

  {/* 위쪽 OSD: 채널 번호·이름·상태. 넷플릭스·티빙처럼 잠시 보였다 사라진다. */}
  <div className="player-top" aria-hidden={!showHud}>
   <button className="player-back" onClick={leave} aria-label="목록으로" tabIndex={showHud?0:-1}><X size={26}/></button>
   <div className="osd">{number&&hasList&&<span className="osd-no">{String(number).padStart(2,'0')}</span>}<div><span className="osd-group">{listTitle}</span><strong>{c.title}</strong>{show.now&&<span className="osd-program">{show.now.t} · {hhmm(show.now.s)}–{hhmm(show.now.e)}<span className="program-bar"><span style={{width:`${Math.round(show.progress*100)}%`}}/></span></span>}</div>{badge&&badge.tone!=='plain'&&<span className={'gtv-chip '+badge.tone}>{badge.tone==='live'&&<span/>}{badge.text}</span>}</div>
  </div>

  {/* 아래쪽 조작줄과 리모컨 안내 */}
  {!isExternal&&<div className="player-controls" aria-hidden={!showHud}>
   {!isLive&&<input type="range" min={0} max={duration||1} step={1} value={time} aria-label="재생 위치" tabIndex={showHud?0:-1} onChange={e=>{if(video.current)video.current.currentTime=Number(e.target.value);}} disabled={!ready}/>}
   <div className="player-buttons">
    <button className="icon-button" tabIndex={showHud?0:-1} disabled={previewRemaining===0} aria-label={playing?'일시정지':'재생'} onClick={play}>{playing?<Pause/>:<Play/>}</button>
    {!isLive&&<><button className="icon-button" tabIndex={showHud?0:-1} aria-label="10초 뒤로" onClick={()=>seek(-10)}><SkipBack size={19}/></button><button className="icon-button" tabIndex={showHud?0:-1} aria-label="10초 앞으로" onClick={()=>seek(10)}><SkipForward size={19}/></button></>}
    <button className="icon-button" tabIndex={showHud?0:-1} aria-label={muted?'음소거 해제':'음소거'} onClick={()=>{if(video.current){video.current.muted=!muted;setMuted(!muted);}}}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>
    <span className="video-time">{isLive?'실시간':`${fmt(time)} / ${fmt(duration)}`}</span>
    <button className="icon-button" tabIndex={showHud?0:-1} aria-label="전체화면 전환" onClick={fullscreen}><Maximize size={21}/></button>
   </div>
  </div>}
  <div className="player-hints" aria-hidden={!showHud}>
   <button onClick={()=>openPanel('info')} tabIndex={-1}><ChevronUp size={18}/>방송 정보</button>
   {hasList&&<button onClick={()=>openPanel('channels')} tabIndex={-1}><ChevronDown size={18}/>채널 목록</button>}
   {hasList&&(isLive||isExternal)&&<span><kbd>◀ ▶</kbd> 채널 이동</span>}
   {!isLive&&!isExternal&&<span><kbd>◀ ▶</kbd> 10초 이동</span>}
   <span><kbd>확인</kbd> {isExternal?'사이트 열기':'재생 · 일시정지'}</span>
   <span><kbd>뒤로</kbd> {panel?'닫기':'목록으로'}</span>
  </div>

  {/* 위 버튼: 방송 정보 패널 */}
  {panel==='info'&&<section className="player-panel info-panel" aria-label="방송 정보">
   <div className="info-copy"><span className="osd-group">{listTitle}</span><h2>{c.title}</h2>{c.subtitle&&<p className="info-sub">{c.subtitle}</p>}{show.now?<div className="info-epg"><div className="epg-now"><span className="epg-label">지금</span><strong>{show.now.t}</strong><span>{hhmm(show.now.s)}–{hhmm(show.now.e)} · {Math.max(0,Math.round((show.now.e-now)/60000))}분 남음</span><span className="program-bar"><span style={{width:`${Math.round(show.progress*100)}%`}}/></span>{show.now.d&&<p>{show.now.d}</p>}</div>{show.next&&<div className="epg-next"><span className="epg-label">다음</span><strong>{show.next.t}</strong><span>{hhmm(show.next.s)}부터</span></div>}</div>:<p>{c.description}</p>}
    <div className="info-actions">
     <button className={'secondary'+(favorite?' on':'')} onClick={onFavorite} aria-pressed={favorite}><Heart size={17} fill={favorite?'currentColor':'none'}/>{favorite?'즐겨찾기 해제':'즐겨찾기'}</button>
     <button className="secondary" onClick={()=>open(c.originalUrl)}><ExternalLink size={17}/>원본 사이트</button>
     {c.alternatives.map((a,i)=><button key={i} className="secondary" onClick={()=>open(a.url)}><ExternalLink size={17}/>{a.title}</button>)}
     <button className="secondary" disabled={reporting} onClick={()=>report('playback')}><Flag size={17}/>재생 안 됨 신고</button>
     <button className="secondary" onClick={leave}><X size={17}/>목록으로</button>
    </div>
    <span className="panel-hint"><kbd>▼</kbd> 또는 <kbd>뒤로</kbd> 닫기</span>
   </div>
   {qr&&<div className="info-qr"><img src={qr} alt={`${c.title} 원본 사이트 QR 코드`} width="132" height="132"/><small>휴대폰으로 원본 사이트 열기</small></div>}
  </section>}

  {/* 아래 버튼: 채널 목록(가로 띠) */}
  {panel==='channels'&&<section className="player-panel channel-panel" aria-label={listTitle+' 채널 목록'}>
   <div className="channel-panel-head"><h3>{listTitle}<span>{related.length}</span></h3><span className="panel-hint"><kbd>◀ ▶</kbd> 고르기 · <kbd>확인</kbd> 보기 · <kbd>▲</kbd> 닫기</span></div>
   <div className="channel-strip" ref={stripRef}>{related.map((x,n)=>{const b=playBadge(x);return <button key={x.id} className={'strip-card'+(x.id===c.id?' current':'')+(n===pick?' picked':'')} aria-current={x.id===c.id?'true':undefined} onFocus={()=>setPick(n)} onMouseEnter={()=>setPick(n)} onClick={()=>select(x.id)}><span className="strip-no">{String(n+1).padStart(2,'0')}</span><strong>{x.title}</strong>{programs[x.id]?<ProgramLine list={programs[x.id]} now={now} compact/>:<small>{x.id===c.id?'지금 보는 채널':x.subtitle}</small>}{b&&b.tone!=='plain'&&<span className={'watch-list-live '+b.tone}>{b.text}</span>}</button>;})}</div>
  </section>}
 </div>;
}
