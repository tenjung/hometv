// IPTV 소스(M3U 주소·붙여넣기·Xtream) 관리와 XMLTV 편성표 캐시.
// 재생 목록·편성표는 대부분 CORS를 열지 않아 서버가 대신 읽는다. 영상은 프록시하지 않고 기기가 원본에서 직접 받는다.
import {parseM3U,parseXmltv,xtreamUrls,isStreamUrl,iptvChannelId} from '../shared/iptv.mjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const SAMSUNG_REGIONS=['kr','us','gb','ca','de','fr','it','es','at','ch','in'];
const SAMSUNG_DATA='https://i.mjh.nz/SamsungTVPlus/.channels.json.gz';
const MAX_SOURCES=12,MAX_CHANNELS=5000,EPG_PAST=2*3600e3,EPG_AHEAD=26*3600e3,EPG_STALE=6*3600e3;
const upsert="INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
const get=async(db,key)=>{const row=await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();if(!row)return null;try{return JSON.parse(row.value);}catch{return null;}};
const put=(db,key,value)=>db.prepare(upsert).bind(key,JSON.stringify(value));

// 관리자가 넣은 주소만 서버가 읽는다. 내부망·로컬 주소는 막는다(같은 PC·공유기 장비 접근 방지).
export function assertPublicUrl(value){
  let u;try{u=new URL(String(value).trim());}catch{fail('주소 형식을 확인해 주세요.');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('http 또는 https 주소만 사용할 수 있어요.');
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  const v4=host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const privateV4=v4&&(+v4[1]===10||+v4[1]===127||+v4[1]===0||(+v4[1]===169&&+v4[2]===254)||(+v4[1]===172&&+v4[2]>=16&&+v4[2]<=31)||(+v4[1]===192&&+v4[2]===168)||(+v4[1]===100&&+v4[2]>=64&&+v4[2]<=127));
  const privateV6=host.includes(':')&&(host==='::1'||host==='::'||/^f[cd]/.test(host)||host.startsWith('fe80')||host.startsWith('::ffff:'));
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||privateV4||privateV6||/^\d+$/.test(host))fail('내부망 주소는 가져올 수 없어요.');
  return u;
}

async function fetchText(url,{maxBytes=40e6,timeout=25000}={}){
  let target=assertPublicUrl(url),response;
  for(let hop=0;;hop++){
    try{response=await fetch(target.href,{redirect:'manual',signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'HomeTV/1.0 (+IPTV playlist reader)','Accept':'*/*'}});}
    catch(e){fail(e?.name==='TimeoutError'?'응답이 너무 늦어요. 주소를 확인하거나 잠시 후 다시 시도해 주세요.':'주소에 연결하지 못했어요.',502);}
    if(response.status>=300&&response.status<400&&response.headers.get('location')){if(hop>=4)fail('주소가 너무 여러 번 넘겨져요.',502);target=assertPublicUrl(new URL(response.headers.get('location'),target).href);continue;}
    break;
  }
  if(!response.ok)fail(`가져오지 못했어요 (응답 ${response.status}). 주소·계정을 확인해 주세요.`,502);
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();fail('파일이 너무 커요.',413);}chunks.push(value);}
  let bytes=new Uint8Array(size),at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    if(bytes.length>maxBytes*4)fail('편성표 파일이 너무 커요.',413);
  }
  return new TextDecoder().decode(bytes);
}

const str=(v,name,max,required=true)=>{if(v==null)v='';if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(`${name}을(를) 확인해 주세요.`);return v.trim();};

// 입력 검증 → 저장할 소스 정의(비밀번호 포함, 관리자에게만 돌려준다)
function validateSource(input){
  if(!input||typeof input!=='object')fail('입력 내용을 확인해 주세요.');
  const type=input.type;if(!['m3u','text','xtream','samsung'].includes(type))fail('가져올 방식을 선택해 주세요.');
  const source={name:str(input.name,'이름',60),type,epgUrl:str(input.epgUrl,'편성표 주소',2048,false)};
  if(source.epgUrl&&!isStreamUrl(source.epgUrl))fail('편성표 주소를 확인해 주세요.');
  if(type==='m3u'){source.url=str(input.url,'재생 목록 주소',2048);if(!isStreamUrl(source.url))fail('재생 목록 주소를 확인해 주세요.');}
  if(type==='text')source.text=str(input.text,'재생 목록 내용',1_500_000);
  if(type==='xtream'){source.server=str(input.server,'서버 주소',500);source.username=str(input.username,'아이디',120);source.password=str(input.password,'비밀번호',120);xtreamUrls(source);}
  if(type==='samsung'){source.region=str(input.region||'kr','국가',4);if(!SAMSUNG_REGIONS.includes(source.region))fail('국가를 선택해 주세요.');}
  return source;
}

async function loadChannels(sourceId,source){
  let text,epg=source.epgUrl;
  if(source.type==='samsung')return samsungChannels(sourceId,source);
  if(source.type==='text')text=source.text;
  else if(source.type==='m3u')text=await fetchText(source.url,{maxBytes:30e6});
  else{const urls=xtreamUrls(source);text=await fetchText(urls.m3u,{maxBytes:30e6});epg=epg||urls.epg;}
  const parsed=parseM3U(text,{limit:MAX_CHANNELS});
  if(!parsed.channels.length)fail('재생 목록에서 채널을 찾지 못했어요. 형식을 확인해 주세요.',422);
  const seen=new Map();
  const channels=parsed.channels.map(c=>{let id=iptvChannelId(sourceId,c);const n=(seen.get(id)||0)+1;seen.set(id,n);if(n>1)id+='-'+n;return {id,name:c.name,url:c.url,logo:c.logo,group:c.group,tvgId:c.tvgId};});
  return {channels,epgUrl:epg||parsed.epgUrl||''};
}

// 삼성 TV 플러스: 공개 채널 정보(i.mjh.nz)로 목록을 만든다. 재생 주소는 jmp2.uk 중계 주소(재생 직전 최종 주소 확인).
async function samsungChannels(sourceId,source){
  let data;try{data=JSON.parse(await fetchText(SAMSUNG_DATA,{maxBytes:20e6}));}catch(e){if(e.status)throw e;fail('삼성 TV 플러스 채널 정보를 읽지 못했어요.',502);}
  const region=data?.regions?.[source.region];if(!region?.channels)fail('선택한 국가의 채널이 없어요.',422);
  const slug=String(data.slug||'stvp-{id}');
  const channels=Object.entries(region.channels).filter(([,c])=>!c.license_url).sort((a,b)=>(a[1].chno||9999)-(b[1].chno||9999)).slice(0,MAX_CHANNELS)
    .map(([id,c])=>({id:iptvChannelId(sourceId,{tvgId:id,name:c.name,group:''}),name:String(c.name||id).slice(0,200),url:`https://jmp2.uk/${slug.replace('{id}',encodeURIComponent(id))}`,logo:isStreamUrl(c.logo)?c.logo:'',group:String(c.group||'').slice(0,80),tvgId:id,chno:c.chno||0}));
  return {channels,epgUrl:source.epgUrl||`https://i.mjh.nz/SamsungTVPlus/${source.region}.xml.gz`};
}

async function refreshEpg(db,sourceId,meta,channels){
  if(!meta.epgSource)return null;
  const xml=await fetchText(meta.epgSource,{maxBytes:60e6,timeout:40000});
  const now=Date.now();
  const {programs,names}=parseXmltv(xml,{from:now-EPG_PAST,to:now+EPG_AHEAD});
  const kept={};
  // tvg-id 로 먼저 잇고, 없으면 채널 이름(display-name)으로 잇는다.
  for(const c of channels){const key=c.tvgId&&programs[c.tvgId]?c.tvgId:names[(c.tvgId||c.name).toLowerCase()];if(key&&programs[key])kept[c.id]=programs[key].map(p=>({...p,d:p.d.slice(0,240)}));}
  const epg={at:now,programs:kept};
  await put(db,`iptv_epg_${sourceId}`,epg).run();
  return epg;
}

const publicMeta=({id,name,type,channelCount,fetchedAt,error,epgAt,epgError,hasEpg,hiddenGroups=[],groups=[],heldCount=0,checkedAt})=>({id,name,type,channelCount,fetchedAt,error,epgAt,epgError,hasEpg,hiddenGroups,groups,heldCount,checkedAt});

// 재생 확인과 '보류'. 확인에 실패한 채널은 보류로 옮겨 가족 화면에서 빼 두고, 관리자가 다시 확인하거나 직접 풀 수 있다.
// 확인은 재생 목록(m3u8) 첫 부분이나 영상 응답 형식만 본다. 영상 데이터를 중계하거나 저장하지 않는다.
const CHECK_BATCH=40,CHECK_PARALLEL=10,CHECK_TIMEOUT=7000;
const holdKey=id=>`iptv_hold_${id}`;
async function holds(db,id){return (await get(db,holdKey(id)))||{held:{},keep:[]};}
const MEDIA_TYPE=/mpegurl|video\/|audio\/|application\/(octet-stream|dash\+xml|vnd\.apple)|binary\/octet/i;
export async function probeStream(url,{fetcher=fetch,timeout=CHECK_TIMEOUT}={}){
  let target;try{target=assertPublicUrl(url);}catch(e){return {ok:false,reason:e.message};}
  for(let hop=0;hop<5;hop++){
    let response;
    try{response=await fetcher(target.href,{redirect:'manual',signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'Mozilla/5.0 (HomeTV stream check)','Accept':'*/*'}});}
    catch(e){return {ok:false,reason:e?.name==='TimeoutError'?'응답 없음(시간 초과)':'연결 실패'};}
    const location=response.headers.get('location');
    if(response.status>=300&&response.status<400&&location){try{await response.body?.cancel();}catch{}try{target=assertPublicUrl(new URL(location,target).href);}catch(e){return {ok:false,reason:e.message};}continue;}
    if(!response.ok){try{await response.body?.cancel();}catch{}return {ok:false,reason:`응답 ${response.status}`};}
    const type=response.headers.get('content-type')||'';
    let head='';
    try{const reader=response.body?.getReader();if(reader){const {value}=await reader.read();head=value?new TextDecoder().decode(value.slice(0,4096)):'';await reader.cancel().catch(()=>{});}}catch{}
    if(/^\s*#EXTM3U/.test(head)||/<MPD\b/.test(head))return {ok:true};
    if(MEDIA_TYPE.test(type)&&!/^\s*</.test(head))return {ok:true};
    return {ok:false,reason:/text\/html/i.test(type)||/^\s*</.test(head)?'영상이 아닌 웹페이지 응답':'재생 목록 형식 아님'};
  }
  return {ok:false,reason:'리디렉션이 너무 많음'};
}
async function checkBatch(db,meta,offset,fetcher){
  const channels=(await get(db,`iptv_list_${meta.id}`))||[];
  const state=await holds(db,meta.id);const keep=new Set(state.keep||[]);
  const batch=channels.slice(offset,offset+CHECK_BATCH);let i=0;
  const work=async()=>{for(;;){const c=batch[i++];if(!c)return;if(keep.has(c.id))continue;const r=await probeStream(c.url,{fetcher});if(r.ok)delete state.held[c.id];else state.held[c.id]={reason:r.reason,at:Date.now()};}};
  await Promise.all(Array.from({length:CHECK_PARALLEL},work));
  const next=offset+batch.length<channels.length?offset+batch.length:null;
  const ids=new Set(channels.map(c=>c.id));for(const id of Object.keys(state.held))if(!ids.has(id))delete state.held[id];
  await put(db,holdKey(meta.id),state).run();
  meta.heldCount=Object.keys(state.held).length;if(next===null)meta.checkedAt=Date.now();
  return {next,total:channels.length,heldCount:meta.heldCount};
}

async function sources(db){return (await get(db,'iptv_sources'))||[];}
async function saveSources(db,list){await put(db,'iptv_sources',list).run();}

async function sync(db,meta,{epg=true}={}){
  const {channels,epgUrl}=await loadChannels(meta.id,meta.source);
  const counts=new Map();for(const c of channels){const g=c.group||'기타';counts.set(g,(counts.get(g)||0)+1);}meta.groups=[...counts.entries()].map(([name,count])=>({name,count}));
  meta.channelCount=channels.length;meta.fetchedAt=Date.now();meta.error='';meta.epgSource=epgUrl;meta.hasEpg=!!epgUrl;
  await put(db,`iptv_list_${meta.id}`,channels).run();
  if(epg&&epgUrl){try{await refreshEpg(db,meta.id,meta,channels);meta.epgAt=Date.now();meta.epgError='';}catch(e){meta.epgError=e.message||'편성표를 가져오지 못했어요.';}}
  return channels;
}

// 기본 IPTV 소스: 버전마다 한 번씩 넣는다. 성공한 뒤에는 다시 넣지 않아서 관리자가 지우면 그대로 지워진다.
// v1 삼성 TV 플러스(대한민국), v2 iptv-org 대한민국 공개 목록(github.com/iptv-org/iptv).
export const IPTV_ORG_KR='https://iptv-org.github.io/iptv/countries/kr.m3u';
const DEFAULT_IPTV=[
  {version:1,match:m=>m.type==='samsung'&&m.source?.region==='kr',source:{name:'삼성 TV 플러스',type:'samsung',region:'kr',epgUrl:''}},
  {version:2,match:m=>m.type==='m3u'&&m.source?.url===IPTV_ORG_KR,source:{name:'iptv-org 대한민국',type:'m3u',url:IPTV_ORG_KR,epgUrl:''}}
];
const DEFAULT_IPTV_VERSION=DEFAULT_IPTV.at(-1).version;
async function seedDefaults(db){
  const done=Number((await get(db,'iptv_defaults'))||0);
  if(done>=DEFAULT_IPTV_VERSION)return;
  const list=await sources(db);let reached=done;
  for(const d of DEFAULT_IPTV){
    if(d.version<=done)continue;
    if(!list.some(d.match)){
      if(list.length>=MAX_SOURCES){reached=d.version;continue;}
      const meta={id:crypto.randomUUID().slice(0,8),source:{...d.source},name:d.source.name,type:d.source.type};
      try{await sync(db,meta);}catch{break;} // 실패하면 다음 접속 때 다시 시도
      list.push(meta);await saveSources(db,list);
    }
    reached=d.version;
  }
  if(reached>done)await put(db,'iptv_defaults',reached).run();
}

// 가족: 모든 소스의 채널 목록
export async function familyIptv(db,{defaults=true}={}){
  if(defaults)await seedDefaults(db);
  const list=await sources(db),out=[];
  for(const meta of list){const hidden=new Set(meta.hiddenGroups||[]);const held=(await holds(db,meta.id)).held;const channels=((await get(db,`iptv_list_${meta.id}`))||[]).filter(c=>!hidden.has(c.group||'기타')&&!held[c.id]);out.push({...publicMeta(meta),channelCount:channels.length,channels});}
  return {sources:out};
}

// 가족: 편성표 (요청한 채널만). 오래됐으면 한 번 새로 받는다.
export async function familyEpg(db,sourceId,ids){
  const list=await sources(db),meta=list.find(m=>m.id===sourceId);if(!meta)fail('IPTV 소스를 찾을 수 없어요.',404);
  let epg=await get(db,`iptv_epg_${sourceId}`);
  if(meta.epgSource&&(!epg||Date.now()-epg.at>EPG_STALE)){
    try{const channels=(await get(db,`iptv_list_${sourceId}`))||[];epg=await refreshEpg(db,sourceId,meta,channels);meta.epgAt=Date.now();meta.epgError='';}
    catch(e){meta.epgError=e.message;}
    await saveSources(db,list);
  }
  const programs={};const now=Date.now();
  for(const id of ids.slice(0,400)){const p=epg?.programs?.[id];if(p)programs[id]=p.filter(x=>x.e>now-EPG_PAST);}
  return {at:epg?.at||0,programs};
}

export async function handleIptvAdmin(db,path,method,input,{fetcher=fetch}={}){
  const list=await sources(db);
  if(path==='/api/admin/iptv'&&method==='GET')return {sources:list.map(m=>({...publicMeta(m),config:{...m.source,text:m.source.text?`${m.source.text.split(/\r?\n/).length}줄`:undefined,password:m.source.password?'••••••':undefined}}))};
  if(path==='/api/admin/iptv'&&method==='POST'){
    if(list.length>=MAX_SOURCES)fail(`IPTV 소스는 ${MAX_SOURCES}개까지 등록할 수 있어요.`);
    const meta={id:crypto.randomUUID().slice(0,8),source:validateSource(input),name:''};meta.name=meta.source.name;meta.type=meta.source.type;
    await sync(db,meta);list.push(meta);await saveSources(db,list);
    return {source:publicMeta(meta)};
  }
  const m=path.match(/^\/api\/admin\/iptv\/([a-z0-9-]+)(\/refresh|\/check|\/hold)?$/);
  const meta=m&&list.find(x=>x.id===m[1]);
  if(m&&!meta)fail('IPTV 소스를 찾을 수 없어요.',404);
  if(m&&m[2]==='/check'&&method==='POST'){
    const offset=Number.isInteger(input?.offset)&&input.offset>=0?input.offset:0;
    const r=await checkBatch(db,meta,offset,fetcher);await saveSources(db,list);return r;
  }
  if(m&&m[2]==='/hold'&&method==='GET'){
    const channels=(await get(db,`iptv_list_${meta.id}`))||[];const state=await holds(db,meta.id);
    return {held:channels.filter(c=>state.held[c.id]).map(c=>({id:c.id,name:c.name,group:c.group,url:c.url,...state.held[c.id]}))};
  }
  if(m&&m[2]==='/hold'&&method==='PUT'){
    const id=typeof input?.channelId==='string'?input.channelId:'';const channels=(await get(db,`iptv_list_${meta.id}`))||[];
    if(!channels.some(c=>c.id===id))fail('채널을 찾을 수 없어요.',404);
    const state=await holds(db,meta.id);const keep=new Set(state.keep||[]);
    if(input.held){state.held[id]={reason:'직접 보류',at:Date.now()};keep.delete(id);}else{delete state.held[id];keep.add(id);}
    state.keep=[...keep];await put(db,holdKey(meta.id),state).run();
    meta.heldCount=Object.keys(state.held).length;await saveSources(db,list);return {source:publicMeta(meta)};
  }
  if(m&&m[2]==='/refresh'&&method==='POST'){
    try{await sync(db,meta);}catch(e){meta.error=e.message;await saveSources(db,list);throw e;}
    await saveSources(db,list);return {source:publicMeta(meta)};
  }
  if(m&&!m[2]&&method==='PUT'){
    if(!Array.isArray(input?.hiddenGroups)||input.hiddenGroups.length>500||input.hiddenGroups.some(g=>typeof g!=='string'||g.length>80))fail('숨길 분류를 확인해 주세요.');
    meta.hiddenGroups=[...new Set(input.hiddenGroups)];if(typeof input.name==='string'&&input.name.trim())meta.name=input.name.trim().slice(0,60);
    await saveSources(db,list);return {source:publicMeta(meta)};
  }
  if(m&&!m[2]&&method==='DELETE'){
    await db.batch([db.prepare('DELETE FROM settings WHERE key = ?').bind(`iptv_list_${meta.id}`),db.prepare('DELETE FROM settings WHERE key = ?').bind(`iptv_epg_${meta.id}`),db.prepare('DELETE FROM settings WHERE key = ?').bind(holdKey(meta.id))]);
    await saveSources(db,list.filter(x=>x.id!==meta.id));return {ok:true};
  }
  return null;
}

// 재생 직전 중계(리디렉션) 주소의 최종 주소만 알려준다. 영상 데이터는 서버를 거치지 않는다.
// 저장된 재생 목록에 있는 채널만 확인해서 임의 주소 확인용으로 쓰이지 않게 한다.
export async function resolveStream(db,sourceId,channelId){
  const channels=(await get(db,`iptv_list_${sourceId}`))||[];const channel=channels.find(c=>c.id===channelId);
  if(!channel)fail('채널을 찾을 수 없어요.',404);
  let target=assertPublicUrl(channel.url);
  for(let hop=0;hop<5;hop++){
    let response;try{response=await fetch(target.href,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Mozilla/5.0 (HomeTV)'}});}catch{return {url:channel.url};}
    try{await response.body?.cancel();}catch{}
    const location=response.headers.get('location');
    if(response.status>=300&&response.status<400&&location){const next=new URL(location,target);if(!['http:','https:'].includes(next.protocol))break;target=next;continue;}
    break;
  }
  return {url:target.href};
}
