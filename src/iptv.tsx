import {useEffect,useMemo,useState} from 'react';
import {api} from './lib';
import type {Channel} from './types';
import {nowNext} from '../shared/iptv.mjs';

export type IptvSource={id:string;name:string;type:string;channelCount:number;fetchedAt?:number;error?:string;hasEpg?:boolean;epgAt?:number;epgError?:string;channels:{id:string;name:string;url:string;logo:string;group:string;tvgId:string}[]};
export type Program={s:number;e:number;t:string;d:string};

// 재생 목록 채널을 집TV 채널 형태로 바꾼다(관리 화면의 채널 목록과는 별도로 보관).
export function iptvChannels(sources:IptvSource[]):Channel[]{
 return sources.flatMap(source=>source.channels.map((c,i)=>({
  id:c.id,title:c.name,subtitle:c.group||source.name,category:'live' as const,kind:'iptv' as const,url:c.url,originalUrl:c.url,
  art:'custom',badge:'IPTV',verified:false,visible:true,order:10000+i,
  description:`${source.name} 재생 목록의 채널입니다.${c.group?` 분류: ${c.group}.`:''} 영상은 재생 목록 제공처에서 이 기기로 바로 받아옵니다.`,
  alternatives:[],revision:0,logo:c.logo,iptv:{sourceId:source.id,sourceName:source.name,group:c.group,tvgId:c.tvgId}
 })));
}

// 편성표: 소스별로 필요한 채널만 받아 5분 동안 기억한다.
const cache=new Map<string,{at:number;programs:Record<string,Program[]>}>();
export function useEpg(sourceId:string|undefined,ids:string[]){
 const key=sourceId?sourceId+':'+ids.slice(0,400).join(','):'';
 const [programs,setPrograms]=useState<Record<string,Program[]>>(()=>cache.get(key)?.programs||{});
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t);},[]);
 useEffect(()=>{
  if(!sourceId||!ids.length){setPrograms({});return;}
  const hit=cache.get(key);if(hit){setPrograms(hit.programs);if(Date.now()-hit.at<300000)return;}
  let alive=true;
  api<{programs:Record<string,Program[]>}>(`/iptv/epg?source=${encodeURIComponent(sourceId)}&ids=${encodeURIComponent(ids.slice(0,400).join(','))}`)
   .then(d=>{cache.set(key,{at:Date.now(),programs:d.programs});if(alive)setPrograms(d.programs);}).catch(()=>{});
  return()=>{alive=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,Math.floor(now/300000)]);
 return {programs,now};
}

export const hhmm=(t:number)=>new Date(t).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});

// 카드·목록용 한 줄 편성: "지금 프로그램" + 진행 막대
export function ProgramLine({list,now,compact=false}:{list?:Program[];now:number;compact?:boolean}){
 const n=nowNext(list,now);
 if(!n.now)return null;
 const left=Math.max(0,Math.round((n.now.e-now)/60000));
 return <span className={'program-line'+(compact?' compact':'')}><span className="program-title">{n.now.t}</span>{!compact&&<span className="program-time">{left}분 남음</span>}<span className="program-bar"><span style={{width:`${Math.round(n.progress*100)}%`}}/></span></span>;
}

// IPTV 탭: 소스·분류 고르기 + 채널 격자(지금 방송 표시)
export function IptvPage({sources,render}:{sources:IptvSource[];render:(c:Channel,program:React.ReactNode)=>React.ReactNode}){
 const [sourceId,setSourceId]=useState(sources[0]?.id||''),[group,setGroup]=useState(''),[limit,setLimit]=useState(120);
 const source=sources.find(s=>s.id===sourceId)||sources[0];
 const all=useMemo(()=>source?iptvChannels([source]):[],[source]);
 const groups=useMemo(()=>{const m=new Map<string,number>();for(const c of all){const g=c.iptv?.group||'기타';m.set(g,(m.get(g)||0)+1);}return [...m.entries()];},[all]);
 const shown=useMemo(()=>all.filter(c=>!group||(c.iptv?.group||'기타')===group),[all,group]);
 const visible=shown.slice(0,limit);
 const {programs,now}=useEpg(source?.hasEpg?source.id:undefined,visible.map(c=>c.id));
 useEffect(()=>{setLimit(120);},[sourceId,group]);
 if(!source)return null;
 return <>
  {sources.length>1&&<div className="live-filters" role="group" aria-label="IPTV 재생 목록">{sources.map(s=><button key={s.id} className={s.id===source.id?'selected':''} aria-pressed={s.id===source.id} onClick={()=>{setSourceId(s.id);setGroup('');}}>{s.name}</button>)}</div>}
  <div className="live-filters iptv-groups" role="group" aria-label="IPTV 분류"><button className={!group?'selected':''} aria-pressed={!group} onClick={()=>setGroup('')}>전체 {all.length}</button>{groups.map(([g,n])=><button key={g} className={group===g?'selected':''} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g} {n}</button>)}</div>
  <div className="gtv-grid">{visible.map(c=>render(c,<ProgramLine list={programs[c.id]} now={now} compact/>))}</div>
  {shown.length>limit&&<div className="more-row"><button className="secondary" onClick={()=>setLimit(l=>l+120)}>채널 더 보기 ({shown.length-limit}개 남음)</button></div>}
 </>;
}
