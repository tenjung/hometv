import {useEffect,useState} from 'react';
import {CirclePause,CirclePlay,Eye,EyeOff,LoaderCircle,Plus,RefreshCw,Save,ShieldCheck,Trash2} from 'lucide-react';
import {api} from './lib';

type Group={name:string;count:number};
type Source={id:string;name:string;type:'m3u'|'text'|'xtream'|'samsung';channelCount:number;fetchedAt?:number;error?:string;hasEpg?:boolean;epgAt?:number;epgError?:string;hiddenGroups:string[];groups:Group[];heldCount?:number;checkedAt?:number;config:Record<string,string|undefined>};
type Held={id:string;name:string;group:string;url:string;reason:string;at:number};
type Form={type:Source['type'];name:string;url:string;text:string;server:string;username:string;password:string;epgUrl:string;region:string};
const empty:Form={type:'m3u',name:'',url:'',text:'',server:'',username:'',password:'',epgUrl:'',region:'kr'};
const TYPES:{id:Source['type'];label:string;hint:string}[]=[
 {id:'m3u',label:'M3U 주소',hint:'m3u / m3u8 재생 목록 주소. 목록 안의 편성표(x-tvg-url)도 자동으로 읽어요.'},
 {id:'text',label:'직접 입력',hint:'M3U 내용을 붙여넣거나, 한 줄에 하나씩 "이름,스트림주소" 또는 스트림 주소만 적어 주세요.'},
 {id:'xtream',label:'Xtream 서버',hint:'IPTV 제공처에서 받은 서버 주소·아이디·비밀번호. 재생 목록과 편성표 주소를 자동으로 만들어요.'},
 {id:'samsung',label:'삼성 TV 플러스',hint:'삼성 TV 플러스 무료 채널(광고 포함)을 국가별로 가져와요. 편성표도 함께 받아요.'}
];
const REGIONS:[string,string][]=[['kr','대한민국'],['us','미국'],['gb','영국'],['ca','캐나다'],['de','독일'],['fr','프랑스'],['it','이탈리아'],['es','스페인'],['at','오스트리아'],['ch','스위스'],['in','인도']];
const when=(t?:number)=>t?new Date(t).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'-';

export function IptvManage({onChange,onToast,onError}:{onChange:()=>Promise<void>;onToast:(s:string)=>void;onError:(s:string)=>void}){
 const [sources,setSources]=useState<Source[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[form,setForm]=useState<Form|null>(null),[groupsOf,setGroupsOf]=useState<string|null>(null),[hidden,setHidden]=useState<string[]>([]),[heldOf,setHeldOf]=useState<string|null>(null),[held,setHeld]=useState<Held[]>([]),[progress,setProgress]=useState('');
 async function load(){setLoading(true);try{setSources((await api<{sources:Source[]}>('/admin/iptv')).sources);}catch(e){onError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function run(id:string,task:()=>Promise<unknown>,done:string){setBusy(id);onError('');try{await task();await load();await onChange();onToast(done);}catch(e){onError((e as Error).message);await load();}finally{setBusy('');}}
 function submit(e:React.FormEvent){e.preventDefault();if(!form)return;const f=form;
  const payload={type:f.type,name:f.name||(f.type==='samsung'?'삼성 TV 플러스':''),epgUrl:f.epgUrl,...(f.type==='m3u'?{url:f.url}:f.type==='text'?{text:f.text}:f.type==='xtream'?{server:f.server,username:f.username,password:f.password}:{region:f.region})};
  void run('new',async()=>{const r=await api<{source:Source}>('/admin/iptv',{method:'POST',body:JSON.stringify(payload)});setForm(null);if(f.type==='samsung'&&f.region==='kr'){setGroupsOf(r.source.id);setHidden(r.source.hiddenGroups||[]);}},'재생 목록을 가져왔어요.');}
 async function loadHeld(id:string){setHeld((await api<{held:Held[]}>(`/admin/iptv/${id}/hold`)).held);}
 function openHeld(s:Source){if(heldOf===s.id){setHeldOf(null);return;}setHeldOf(s.id);setHeld([]);void loadHeld(s.id).catch(e=>onError((e as Error).message));}
 // 채널을 40개씩 나눠 확인한다(서버 요청 시간 제한). 실패한 채널은 보류로 옮겨진다.
 function check(s:Source){void run(s.id,async()=>{let offset:number|null=0;while(offset!==null){setProgress(`${offset}/${s.channelCount}`);const r:{next:number|null;heldCount:number}=await api(`/admin/iptv/${s.id}/check`,{method:'POST',body:JSON.stringify({offset})});offset=r.next;}setProgress('');if(heldOf===s.id)await loadHeld(s.id);},'재생 확인을 마쳤어요. 안 되는 채널은 보류로 옮겼어요.').finally(()=>setProgress(''));}
 function setHold(s:Source,channelId:string,value:boolean){void run(s.id,async()=>{await api(`/admin/iptv/${s.id}/hold`,{method:'PUT',body:JSON.stringify({channelId,held:value})});await loadHeld(s.id);},value?'보류로 옮겼어요.':'보류를 풀었어요. 다음 확인에서도 그대로 둬요.');}
 function openGroups(s:Source){setGroupsOf(groupsOf===s.id?null:s.id);setHidden(s.hiddenGroups||[]);}
 const type=TYPES.find(t=>t.id===form?.type);
 return <div className="iptv-manage">
  <div className="manage-toolbar"><div><h3>IPTV 재생 목록 <span>{sources.length}</span></h3><p>M3U·Xtream·삼성 TV 플러스 채널을 가져와 홈과 IPTV 탭에 보여줘요. 영상은 각 기기가 제공처에서 직접 받아요.</p></div><div>{!form&&<button className="primary" onClick={()=>setForm({...empty})}><Plus size={17}/>재생 목록 추가</button>}</div></div>
  {form&&<form className="editor iptv-form" onSubmit={submit}>
   <div className="iptv-types" role="group" aria-label="가져올 방식">{TYPES.map(t=><button type="button" key={t.id} className={form.type===t.id?'selected':''} aria-pressed={form.type===t.id} onClick={()=>setForm({...form,type:t.id})}>{t.label}</button>)}</div>
   <p className="muted small">{type?.hint}</p>
   <div className="form-grid">
    <label>이름<input maxLength={60} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder={form.type==='samsung'?'삼성 TV 플러스':'예: 우리집 IPTV'} required={form.type!=='samsung'}/></label>
    {form.type==='samsung'&&<label>국가<select value={form.region} onChange={e=>setForm({...form,region:e.target.value})}>{REGIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>}
    {form.type==='m3u'&&<label className="span-2">재생 목록 주소<input type="url" required value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://example.com/playlist.m3u8"/></label>}
    {form.type==='text'&&<label className="span-2">재생 목록 내용 · 스트림 주소<textarea required rows={8} value={form.text} onChange={e=>setForm({...form,text:e.target.value})} placeholder={'#EXTM3U\n#EXTINF:-1 tvg-id="ch1" group-title="뉴스",채널 이름\nhttps://example.com/live.m3u8\n\n또는\n우리 채널,https://example.com/live.m3u8'}/></label>}
    {form.type==='xtream'&&<><label className="span-2">서버 주소<input required value={form.server} onChange={e=>setForm({...form,server:e.target.value})} placeholder="http://서버주소:포트"/></label><label>아이디<input required autoComplete="off" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label><label>비밀번호<input required type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label></>}
    <label className="span-2">편성표(EPG) 주소 <small>선택 · XMLTV(.xml / .xml.gz). 비워 두면 재생 목록에 적힌 주소를 써요.</small><input type="url" value={form.epgUrl} onChange={e=>setForm({...form,epgUrl:e.target.value})} placeholder="https://example.com/guide.xml.gz"/></label>
   </div>
   <div className="editor-footer"><button type="button" className="secondary" onClick={()=>setForm(null)}>취소</button><button className="primary" disabled={busy==='new'}>{busy==='new'?<LoaderCircle className="spin" size={17}/>:<Save size={17}/>}가져오기</button></div>
  </form>}
  {loading?<p className="muted"><LoaderCircle className="spin" size={16}/> 불러오는 중</p>:!sources.length&&!form?<p className="muted">아직 가져온 재생 목록이 없어요.</p>:null}
  <div className="admin-list">{sources.map(s=><div key={s.id} className="iptv-source">
   <div className="admin-row"><span className="admin-logo art-custom">{s.type==='samsung'?'TV+':s.type==='xtream'?'XC':'M3U'}</span>
    <div className="admin-row-copy"><strong>{s.name}</strong><span>{TYPES.find(t=>t.id===s.type)?.label} · 채널 {s.channelCount}개{s.hiddenGroups?.length?` · 숨긴 분류 ${s.hiddenGroups.length}`:''}{s.heldCount?` · 보류 ${s.heldCount}`:''}{s.checkedAt?` · 확인 ${when(s.checkedAt)}`:''} · 갱신 {when(s.fetchedAt)}</span><span className={s.epgError?'warn':''}>{s.hasEpg?(s.epgError?`편성표 오류: ${s.epgError}`:`편성표 ${when(s.epgAt)}`):'편성표 없음'}</span>{s.error&&<span className="warn">{s.error}</span>}</div>
    <div className="row-actions"><button className="icon-button" title="재생 확인(안 되는 채널은 보류)" aria-label="재생 확인" disabled={!!busy} onClick={()=>check(s)}>{busy===s.id&&progress?<><LoaderCircle className="spin" size={18}/><small>{progress}</small></>:<ShieldCheck size={18}/>}</button><button className="icon-button" title="보류 채널" aria-label="보류 채널" onClick={()=>openHeld(s)}><CirclePause size={18}/></button><button className="icon-button" title="분류 보이기·숨기기" aria-label="분류 관리" onClick={()=>openGroups(s)}><Eye size={18}/></button><button className="icon-button" title="새로 가져오기" aria-label="새로 가져오기" disabled={!!busy} onClick={()=>run(s.id,()=>api(`/admin/iptv/${s.id}/refresh`,{method:'POST',body:'{}'}),'채널과 편성표를 새로 가져왔어요.')}>{busy===s.id?<LoaderCircle className="spin" size={18}/>:<RefreshCw size={18}/>}</button><button className="icon-button" title="삭제" aria-label="삭제" disabled={!!busy} onClick={()=>{if(confirm(`'${s.name}' 재생 목록을 삭제할까요?`))void run(s.id,()=>api(`/admin/iptv/${s.id}`,{method:'DELETE',body:'{}'}),'재생 목록을 삭제했어요.');}}><Trash2 size={18}/></button></div>
   </div>
   {heldOf===s.id&&<div className="iptv-groups-editor"><p className="muted small">보류 채널은 가족 화면에 보이지 않아요. 확인 버튼으로 다시 확인하면 살아난 채널은 자동으로 돌아와요. 직접 풀면 다음 확인에서도 그대로 둬요.</p>
    {!held.length?<p className="muted small">보류된 채널이 없어요.</p>:<div className="admin-list">{held.map(h=><div key={h.id} className="admin-row"><div className="admin-row-copy"><strong>{h.name}</strong><span>{h.group||'기타'} · {h.reason} · {when(h.at)}</span><span className="muted small">{h.url}</span></div><div className="row-actions"><button className="icon-button" title="보류 풀기" aria-label="보류 풀기" disabled={!!busy} onClick={()=>setHold(s,h.id,false)}><CirclePlay size={18}/></button></div></div>)}</div>}
   </div>}
   {groupsOf===s.id&&<div className="iptv-groups-editor"><p className="muted small">가족 화면에 보일 분류를 고르세요. 꺼 둔 분류는 홈·IPTV 탭에서 숨겨져요.</p>
    <div className="group-toggles">{(s.groups||[]).map(g=>{const off=hidden.includes(g.name);return <button type="button" key={g.name} className={off?'':'selected'} aria-pressed={!off} onClick={()=>setHidden(h=>off?h.filter(x=>x!==g.name):[...h,g.name])}>{off?<EyeOff size={14}/>:<Eye size={14}/>}{g.name} <small>{g.count}</small></button>;})}</div>
    <div className="editor-footer"><button type="button" className="secondary" onClick={()=>setHidden([])}>모두 보이기</button><button type="button" className="secondary" onClick={()=>setHidden((s.groups||[]).map(g=>g.name))}>모두 숨기기</button><button type="button" className="primary" disabled={!!busy} onClick={()=>run(s.id,async()=>{await api(`/admin/iptv/${s.id}`,{method:'PUT',body:JSON.stringify({hiddenGroups:hidden})});setGroupsOf(null);},'보일 분류를 저장했어요.')}><Save size={17}/>저장</button></div>
   </div>}
  </div>)}</div>
 </div>;
}
