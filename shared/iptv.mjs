// IPTV 재생 목록(M3U) · Xtream 서버 · XMLTV 편성표 처리. 서버(목록 가져오기)와 브라우저(편성 표시)가 함께 쓴다.

const ATTR=/([\w-]+)="([^"]*)"/g;
const clean=(value,max=200)=>String(value??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);

export function isStreamUrl(value){
  try{const u=new URL(String(value).trim());return (u.protocol==='http:'||u.protocol==='https:')&&!u.username&&!u.password;}catch{return false;}
}

// M3U/M3U8 재생 목록. #EXTM3U 가 없으면 한 줄에 하나씩 "주소" 또는 "이름,주소" / "이름|주소" 로 읽는다.
export function parseM3U(text,{limit=5000}={}){
  const lines=String(text??'').replace(/^﻿/,'').split(/\r?\n/).map(l=>l.trim());
  const channels=[];let epgUrl='',pending=null,group='';
  if(!lines.some(l=>l.startsWith('#EXTM3U')||l.startsWith('#EXTINF'))){
    for(const line of lines){
      if(!line||line.startsWith('#'))continue;
      const m=line.match(/^(.*?)[,|]\s*(https?:\/\/\S+)$/)||[null,'',line];
      if(!isStreamUrl(m[2]))continue;
      channels.push({name:clean(m[1])||nameFromUrl(m[2]),url:m[2].trim(),logo:'',group:'',tvgId:''});
      if(channels.length>=limit)break;
    }
    return {epgUrl,channels};
  }
  for(const line of lines){
    if(!line)continue;
    if(line.startsWith('#EXTM3U')){const attrs=readAttrs(line);epgUrl=(attrs['x-tvg-url']||attrs['url-tvg']||attrs['tvg-url']||'').split(',')[0].trim();continue;}
    if(line.startsWith('#EXTINF')){
      const comma=findNameComma(line);const attrs=readAttrs(line.slice(0,comma<0?line.length:comma));
      pending={name:clean(comma<0?'':line.slice(comma+1))||clean(attrs['tvg-name']),logo:isStreamUrl(attrs['tvg-logo'])?attrs['tvg-logo'].trim():'',group:clean(attrs['group-title'],80),tvgId:clean(attrs['tvg-id'],120)};
      continue;
    }
    if(line.startsWith('#EXTGRP:')){group=clean(line.slice(8),80);continue;}
    if(line.startsWith('#'))continue;
    if(!isStreamUrl(line)){pending=null;continue;}
    const item=pending||{name:'',logo:'',group:'',tvgId:''};
    channels.push({...item,name:item.name||nameFromUrl(line),group:item.group||group,url:line});
    pending=null;group='';
    if(channels.length>=limit)break;
  }
  return {epgUrl:isStreamUrl(epgUrl)?epgUrl:'',channels};
}
function readAttrs(text){const out={};for(const m of text.matchAll(ATTR))out[m[1].toLowerCase()]=m[2];return out;}
// 속성 값 안의 쉼표는 건너뛰고, 채널 이름 앞의 쉼표를 찾는다.
function findNameComma(line){let quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"')quoted=!quoted;else if(ch===','&&!quoted)return i;}return -1;}
function nameFromUrl(url){try{const u=new URL(url);return clean(decodeURIComponent(u.pathname.split('/').filter(Boolean).pop()||u.hostname).replace(/\.(m3u8?|ts|mp4)$/i,''),80)||u.hostname;}catch{return '채널';}}

// Xtream Codes 호환 서버: 재생 목록(HLS 주소)과 편성표 주소를 만든다.
export function xtreamUrls({server,username,password}){
  let base;try{base=new URL(String(server).trim());}catch{throw new Error('Xtream 서버 주소를 확인해 주세요.');}
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw new Error('Xtream 서버 주소를 확인해 주세요.');
  if(!username||!password)throw new Error('Xtream 아이디와 비밀번호를 입력해 주세요.');
  const root=base.origin+base.pathname.replace(/\/(get|player_api|xmltv)\.php$/,'').replace(/\/+$/,'');
  const q=`username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  return {m3u:`${root}/get.php?${q}&type=m3u_plus&output=m3u8`,epg:`${root}/xmltv.php?${q}`};
}

// XMLTV 시간 "20261127183000 +0900" → epoch ms
export function xmltvTime(value){
  const m=String(value??'').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if(!m)return NaN;
  const utc=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  if(!m[7])return utc;
  const sign=m[7][0]==='-'?-1:1,offset=(+m[7].slice(1,3)*60+ +m[7].slice(3,5))*sign;
  return utc-offset*60000;
}
const decode=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&');
const tag=(body,name)=>{const m=body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));return m?clean(decode(m[1]),400):'';};

// XMLTV 편성표에서 원하는 채널, 원하는 시간 범위만 뽑는다. 결과: {채널ID: [{s,e,t,d}]}
export function parseXmltv(xml,{ids,from=-Infinity,to=Infinity}={}){
  const wanted=ids?new Set(ids):null,out={};
  const names={};
  for(const m of String(xml).matchAll(/<channel\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g)){const name=tag(m[2],'display-name');if(name)names[name.toLowerCase()]=decode(m[1]);}
  for(const m of String(xml).matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g)){
    const attrs=readAttrs(m[1]);const id=decode(attrs.channel||'');
    if(!id||(wanted&&!wanted.has(id)))continue;
    const s=xmltvTime(attrs.start),e=xmltvTime(attrs.stop);
    if(!Number.isFinite(s)||!Number.isFinite(e)||e<=from||s>=to)continue;
    (out[id]||(out[id]=[])).push({s,e,t:tag(m[2],'title')||'제목 없음',d:tag(m[2],'desc')});
  }
  for(const list of Object.values(out))list.sort((a,b)=>a.s-b.s);
  return {programs:out,names};
}

// 현재·다음 프로그램과 진행률
export function nowNext(list,now=Date.now()){
  if(!list?.length)return {now:null,next:null,progress:0};
  const i=list.findIndex(p=>p.s<=now&&now<p.e);
  const current=i>=0?list[i]:null;
  const next=i>=0?list[i+1]||null:list.find(p=>p.s>now)||null;
  return {now:current,next,progress:current?Math.min(1,Math.max(0,(now-current.s)/(current.e-current.s))):0};
}

// 같은 재생 목록 안에서 바뀌지 않는 채널 ID (즐겨찾기·최근 이용 유지용)
export function iptvChannelId(sourceId,channel){
  const key=channel.tvgId||channel.name||channel.url;let h=0;
  for(const ch of key+'|'+(channel.group||''))h=(h*31+ch.charCodeAt(0))|0;
  return `iptv-${sourceId}-${(h>>>0).toString(36)}`;
}
