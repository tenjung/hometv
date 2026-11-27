import {writeFile} from 'node:fs/promises';
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
    let direct=false,reason='접속 상태 확인 필요';
    try{const r=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});if(r.ok){const {onair:o}=await r.json();if(o?.info?.channelid===channel.id){const media=[o.source?.mediasource,...(o.source?.mediasourcelist||[])].filter(Boolean);direct=o.info.onair_yn==='Y'&&o.info.required_login!=='Y'&&media.some(m=>m.required_login==='N'&&m.required_payment==='N'&&m.mediaurl?.startsWith('https://'));reason=direct?'공개 재생 지원':o.info.onair_yn!=='Y'?'방송사 제공 제한':'공식 로그인·이용 조건 확인';}}}catch{}
    return {...channel,url:`${origin}/live/${channel.id}`,direct,reason};
  })));
}
await writeFile('shared/sbs-catalog.mjs','// Extracted from the official SBS channel list. No media URLs or tokens are stored.\nexport const sbsCatalog = '+JSON.stringify(records,null,2)+';\n');
console.log(JSON.stringify({total:records.length,tv:records.filter(c=>c.group==='tv').length,continuous:records.filter(c=>c.group==='24tv').length,radio:records.filter(c=>c.group==='radio').length,direct:records.filter(c=>c.direct).map(c=>c.name),official:records.filter(c=>!c.direct).map(c=>c.name)}));
