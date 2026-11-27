import {writeFile} from 'node:fs/promises';
import {inspectOfficialPlayback} from '../shared/sbs-policy.mjs';
const origin='https://www.sbs.co.kr';
const response=await fetch(origin+'/live',{signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error('SBS list request failed: '+response.status);
const html=await response.text();
const match=html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
if(!match)throw new Error('SBS list format changed. Existing catalog was not changed.');
const props=JSON.parse(match[1]).props.pageProps;
const groups=[['tv','tv'],['virtual','24tv'],['radio','radio']];
const list=groups.flatMap(([key,group])=>{if(!Array.isArray(props[key]))throw new Error('Missing SBS list: '+key);return props[key].map(item=>({id:item.channelid,name:item.channelname==='GorealraM'?'고릴라M':item.channelname,group}));});
if(list.length<10||list.length>100||new Set(list.map(c=>c.id)).size!==list.length||list.some(c=>!/^S\d{2,3}$/.test(c.id)||typeof c.name!=='string'))throw new Error('Unexpected SBS channel catalog. Existing catalog was not changed.');
const records=[];
for(let i=0;i<list.length;i+=4){
  records.push(...await Promise.all(list.slice(i,i+4).map(async channel=>{
    const route=channel.group==='24tv'?'binge-watch/channel':'channel';
    const endpoint=`https://apis.sbs.co.kr/play-api/1.0/onair/${route}/${channel.id}?v_type=2&platform=pcweb&protocol=hls&ssl=Y&rscuse=&jwt-token=&sbsmain=`;
    let direct=false,reason='접속 상태 확인 필요',mode='official',previewSeconds=0;
    try{const r=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});if(r.ok){const {onair}=await r.json();const policy=inspectOfficialPlayback(onair,channel.id);direct=true;mode=policy.mode;previewSeconds=policy.previewSeconds;reason=mode==='preview'?`공식 ${previewSeconds}초 미리보기`:'공개 재생 지원';}}catch(error){reason=error.message?.includes('로그인')?'공식 로그인·이용 조건 확인':'방송사 제공 제한';}
    return {...channel,url:`${origin}/live/${channel.id}`,direct,mode,previewSeconds,reason};
  })));
}
await writeFile('shared/sbs-catalog.mjs','// Extracted from the official SBS channel list. No media URLs or tokens are stored.\nexport const sbsCatalog = '+JSON.stringify(records,null,2)+';\n');
console.log(JSON.stringify({total:records.length,full:records.filter(c=>c.mode==='full').map(c=>c.name),preview:records.filter(c=>c.mode==='preview').map(c=>c.name),official:records.filter(c=>!c.direct).map(c=>c.name)}));
