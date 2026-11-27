import {useEffect,useRef,useState} from 'react';
import {getOfficialChannel} from '../shared/playback.mjs';
import {createPortal} from 'react-dom';

export async function api<T=Record<string,unknown>>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();
  if(!response.ok){if(response.status===401&&path!=='/login')window.dispatchEvent(new Event('session-expired'));throw new Error(data.error||'요청을 처리하지 못했습니다.');}
  return data;
}
export function useStored<T>(key:string,fallback:T){
  const [value,setValue]=useState<T>(()=>{try{const raw=localStorage.getItem(key);if(!raw)return fallback;const parsed=JSON.parse(raw);if(Array.isArray(fallback))return Array.isArray(parsed)&&parsed.every(x=>typeof x==='string')?parsed as T:fallback;return typeof parsed===typeof fallback?parsed:fallback;}catch{return fallback;}});
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Browsers may disable local storage. */}},[key,value]);
  return [value,setValue] as const;
}
export function Dialog({title,onClose,children,wide=false,full=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean;full?:boolean}){
  const ref=useRef<HTMLDialogElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{const previous=document.activeElement as HTMLElement;const dialog=ref.current!;dialog.showModal();return()=>{dialog.close();if(previous?.isConnected)previous.focus();};},[]);
  return createPortal(<dialog ref={ref} className={'dialog'+(wide?' wide':'')+(full?' full':'')} aria-label={title} onCancel={e=>{e.preventDefault();closeRef.current();}} onClick={e=>{if(e.target===ref.current){const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeRef.current();}}}>{children}</dialog>,document.body);
}
export function useRemoteNavigation(){
  useEffect(()=>{function handle(e:KeyboardEvent){
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||e.altKey||e.metaKey||e.ctrlKey)return;
    const active=document.activeElement as HTMLElement;
    if(active?.matches('textarea,select,[contenteditable=true],video,input[type=range],input[type=number]'))return;
    if(active?.matches('input')&&['ArrowLeft','ArrowRight'].includes(e.key))return;
    const scope=document.querySelector('dialog[open]')||document;
    const elements=Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length>0&&!el.closest('[hidden]'));
    if(!elements.length)return;e.preventDefault();
    if(!active||!elements.includes(active)){elements[0].focus();return;}
    const rect=active.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    const horizontal=e.key==='ArrowLeft'||e.key==='ArrowRight',positive=e.key==='ArrowRight'||e.key==='ArrowDown';
    let target:HTMLElement|null=null,best=Infinity;
    for(const el of elements){if(el===active)continue;const r=el.getBoundingClientRect();const dx=r.left+r.width/2-x,dy=r.top+r.height/2-y;const primary=horizontal?dx:dy,cross=Math.abs(horizontal?dy:dx);if((positive?primary:-primary)<4)continue;const aligned=horizontal?Math.min(rect.bottom,r.bottom)-Math.max(rect.top,r.top)>0:Math.min(rect.right,r.right)-Math.max(rect.left,r.left)>0;const score=Math.abs(primary)+(aligned?cross*.3:cross*3+500);if(score<best){best=score;target=el;}}
    target?.focus({preventScroll:true});
    // 위쪽 메뉴로 올라가면 페이지 맨 위(홈 배너)까지 보여 준다.
    if(target?.closest('.gtv-top'))window.scrollTo({top:0,behavior:'smooth'});else target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  }document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle);},[]);
}
export function validHttps(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
export const external=(url:string)=>{if(validHttps(url))window.location.assign(url);};

// 카드·목록에 붙는 재생 상태 표시. 앱 안에서 바로 나오는 실시간 채널은 모두 LIVE로 표시한다.
export function playBadge(c:{category:string;kind:string;url:string;badge:string}):{text:string;tone:'live'|'preview'|'ext'|'plain'}|null{
  const official=getOfficialChannel(c);
  if(c.category==='live'&&c.kind!=='external'){
    if(official?.mode==='preview')return {text:`미리보기 ${official.previewSeconds}초`,tone:'preview'};
    return {text:'LIVE',tone:'live'};
  }
  if(c.kind==='external')return {text:'외부 연결',tone:'ext'};
  return c.badge?{text:c.badge,tone:'plain'}:null;
}
export const isDirectLive=(c:{category:string;kind:string;url:string;badge:string})=>playBadge(c)?.tone==='live';
