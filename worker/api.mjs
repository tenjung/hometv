import { seeds } from '../shared/seeds.mjs';
import { SOLO_PAGE, getSbsChannel, getKbsChannel } from '../shared/playback.mjs';
import { familyIptv, familyEpg, handleIptvAdmin, resolveStream } from './iptv.mjs';

const encoder = new TextEncoder();
const COOKIE = 'hometv_session';
export const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const unb64 = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0));
async function digest(value) { return b64(await crypto.subtle.digest('SHA-256',encoder.encode(value))); }
async function key(secret) { return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
async function hashPin(pin, salt=crypto.randomUUID()) {
  const material=await crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveBits']);
  return {salt,hash:b64(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},material,256))};
}
const setting = async (db,name) => (await db.prepare('SELECT value FROM settings WHERE key = ?').bind(name).first())?.value;
async function checkPin(db,env,role,pin) {
  const saved=await setting(db,`${role}_pin`);
  if(saved) {const p=JSON.parse(saved);return (await hashPin(pin,p.salt)).hash===p.hash;}
  const configured=role==='admin'?env.ADMIN_PIN:env.FAMILY_PIN;
  return !!configured && await digest(pin)===await digest(configured);
}
async function revision(db,role) {return (await setting(db,`${role}_rev`)) || '0';}
async function session(request,env) {
  try {
    const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!token || !env.SESSION_SECRET) return null;
    const [body,signature]=token.split('.');
    if(!body||!signature||!await crypto.subtle.verify('HMAC',await key(env.SESSION_SECRET),unb64(signature),encoder.encode(body)))return null;
    const data=JSON.parse(new TextDecoder().decode(unb64(body)));
    if(data.exp<Date.now()||!['family','admin'].includes(data.role)||data.rev!==await revision(env.DB,data.role))return null;
    return data;
  } catch {return null;}
}
async function cookie(request,env,role) {
  const age=role==='admin'?8*3600:30*86400;
  const data={role,exp:Date.now()+age*1000,nonce:crypto.randomUUID(),rev:await revision(env.DB,role)};
  const body=b64(encoder.encode(JSON.stringify(data)));
  const signature=b64(await crypto.subtle.sign('HMAC',await key(env.SESSION_SECRET),encoder.encode(body)));
  return `${COOKIE}=${body}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
async function body(request,limit=16384) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON 형식으로 요청해 주세요.',415);
  const reader=request.body?.getReader(); if(!reader)fail('요청 내용이 없습니다.');
  let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('입력 내용이 너무 큽니다.',413);}chunks.push(value);}
  try {const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(all));}catch{fail('입력 형식을 확인해 주세요.');}
}
function text(value,name,max,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`${name}을 확인해 주세요.`);return value.trim();}
export function safeUrl(value) {
  const input=text(value,'주소',2048);
  try {const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password)fail('https 주소만 등록할 수 있습니다.');return u.href;}catch{fail('올바른 https 주소를 입력해 주세요.');}
}
export function validateChannel(input) {
  if(!input||typeof input!=='object')fail('등록할 내용을 확인해 주세요.');
  if(!['live','vod'].includes(input.category)||!['external','hls','mp4','sbs-live','kbs-live'].includes(input.kind))fail('분류와 재생 방식을 선택해 주세요.');
  if(input.kind==='sbs-live'&&((input.url!==SOLO_PAGE&&!getSbsChannel(input))||input.category!=='live'))fail('SBS 바로 재생은 공식 목록의 실시간 채널 주소를 사용해 주세요.');
  if(input.kind==='kbs-live'&&(!getKbsChannel(input)||input.category!=='live'))fail('KBS 바로 재생은 공식 목록의 실시간 채널 주소를 사용해 주세요.');
  if(input.kind!=='external'&&input.permission!==true)fail('내부 재생이 허용된 영상인지 확인해 주세요.');
  const alternatives=input.alternatives??[];
  if(!Array.isArray(alternatives)||alternatives.length>3)fail('대체 경로는 3개까지 등록할 수 있습니다.');
  return {title:text(input.title,'제목',100),subtitle:text(input.subtitle||'','짧은 설명',150,false),description:text(input.description||'','설명',1200,false),category:input.category,kind:input.kind,url:safeUrl(input.url),originalUrl:safeUrl(input.originalUrl||input.url),art:['solo','sbs','kbs','ebs','drama','sample','custom'].includes(input.art)?input.art:'custom',badge:text(input.badge||'','표시 문구',20,false),verified:input.verified===true,visible:input.visible!==false,order:Number.isFinite(input.order)?Math.max(0,Math.min(9999,Math.trunc(input.order))):100,permission:input.permission===true,group:text(input.group||'','외부 TV 분류',30,false),alternatives:alternatives.map(a=>({title:text(a.title,'대체 경로 이름',50),url:safeUrl(a.url)}))};
}
// 초기 목록은 버전별로 한 번씩만 추가한다. 이미 추가된 뒤 관리자가 삭제한 항목은 다시 만들지 않는다.
const CATALOG_VERSION=3;
async function seed(db) {
  const stored=Number(await setting(db,'catalog_version'))||(await setting(db,'catalog_initialized')?1:0);
  if(stored>=CATALOG_VERSION)return;
  const upsert="INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  await db.batch([...seeds.filter(c=>(c.since||1)>stored).map(({since,...c})=>db.prepare('INSERT INTO channels (id,payload,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT DO NOTHING').bind(c.id,JSON.stringify({...c,permission:c.kind!=='external'}),Date.now())),db.prepare(upsert).bind('catalog_initialized','1'),db.prepare(upsert).bind('catalog_version',String(CATALOG_VERSION))]);
}
async function list(db,admin) {
  await seed(db);
  const {results}=await db.prepare('SELECT id,payload,revision FROM channels').all();
  return results.map(r=>({...JSON.parse(r.payload),id:r.id,revision:r.revision})).filter(c=>admin||c.visible).sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title,'ko'));
}
export async function handleApi(request,env) {
 try {
  if(!env.DB||!env.SESSION_SECRET||!env.ADMIN_PIN)return json({error:'서버의 인증·저장소 설정이 필요합니다.'},503);
  const url=new URL(request.url), path=url.pathname, method=request.method;
  if(!['GET','POST','PUT','DELETE'].includes(method))return json({error:'지원하지 않는 요청입니다.'},405);
  if(method!=='GET'&&request.headers.get('Origin')!==url.origin)fail('다른 사이트에서 보낸 요청입니다. 새로고침 후 다시 시도해 주세요.',403);
  if(path==='/api/session'&&method==='GET') {const s=await session(request,env);return json({authenticated:true,admin:s?.role==='admin'});}
  if(path==='/api/login'&&method==='POST') {
    const input=await body(request),role=input.role==='admin'?'admin':'family';
    const pin=text(input.pin,'PIN',32);
    const id=await digest(`${request.headers.get('CF-Connecting-IP')||request.headers.get('X-Local-Client')||'unknown'}:${role}`);
    const row=await env.DB.prepare('SELECT failures,window_at FROM attempts WHERE id = ?').bind(id).first();
    const now=Date.now(), active=row&&now-row.window_at<600000;
    if(active&&row.failures>=8)return json({error:'입력이 여러 번 틀렸습니다. 10분 후 다시 시도해 주세요.'},429,{'Retry-After':String(Math.ceil((600000-(now-row.window_at))/1000))});
    if(!await checkPin(env.DB,env,role,pin)){
      await env.DB.prepare('INSERT INTO attempts (id,failures,window_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET failures = ?, window_at = ?').bind(id,now,active?row.failures+1:1,active?row.window_at:now).run();
      return json({error:'PIN이 맞지 않습니다.'},401);
    }
    await env.DB.batch([env.DB.prepare('DELETE FROM attempts WHERE id = ?').bind(id),env.DB.prepare('DELETE FROM attempts WHERE window_at < ?').bind(now-86400000)]);
    return json({authenticated:true,admin:role==='admin'},200,{'Set-Cookie':await cookie(request,env,role)});
  }
  if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${url.protocol==='https:'?'; Secure':''}`});
  // 가족 화면은 PIN 없이 연다(2026-11-27). 관리 기능만 관리자 PIN 세션이 필요하다.
  const s=(await session(request,env))||{role:'family',nonce:'guest-'+await digest(request.headers.get('CF-Connecting-IP')||request.headers.get('X-Local-Client')||'unknown')};
  if(path==='/api/channels'&&method==='GET')return json({channels:await list(env.DB,s.role==='admin')});
  if(path==='/api/iptv'&&method==='GET')return json(await familyIptv(env.DB,{defaults:env.IPTV_DEFAULTS!=='off'}));
  if(path==='/api/iptv/resolve'&&method==='GET')return json(await resolveStream(env.DB,text(url.searchParams.get('source')||'','소스',40),text(url.searchParams.get('id')||'','채널',80)));
  if(path==='/api/iptv/epg'&&method==='GET'){const source=text(url.searchParams.get('source')||'','소스',40);const ids=(url.searchParams.get('ids')||'').split(',').filter(Boolean);return json(await familyEpg(env.DB,source,ids));}
  if(path==='/api/reports'&&method==='POST') {
    const input=await body(request);const id=text(input.channelId,'항목',100);
    const channel=await env.DB.prepare('SELECT payload FROM channels WHERE id = ?').bind(id).first();
    if(!channel||(!JSON.parse(channel.payload).visible&&s.role!=='admin'))fail('항목을 찾을 수 없습니다.',404);
    if(!['bot','playback','link'].includes(input.reason))fail('문제 유형을 선택해 주세요.');
    const reportId=await digest(`${id}:${s.nonce}:${Math.floor(Date.now()/86400000)}`);
    await env.DB.prepare('INSERT INTO reports (id,channel_id,reason,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET reason = ?, created_at = ?').bind(reportId,id,input.reason,Date.now(),input.reason,Date.now()).run();
    return json({ok:true});
  }
  if(s.role!=='admin')fail('관리자 PIN이 필요합니다.',403);
  if(path==='/api/admin/channels'&&method==='POST'){
    const data=validateChannel(await body(request));const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO channels (id,payload,revision,updated_at) VALUES (?,?,1,?)').bind(id,JSON.stringify(data),Date.now()).run();
    return json({channel:{...data,id,revision:1}},201);
  }
  const match=path.match(/^\/api\/admin\/channels\/([a-zA-Z0-9-]+)$/);
  if(match&&(method==='PUT'||method==='DELETE')) {
    const input=await body(request);if(!Number.isSafeInteger(input.revision)||input.revision<1)fail('항목을 새로 불러와 주세요.',409);
    if(method==='PUT') {
      const data=validateChannel(input);
      const result=await env.DB.prepare('UPDATE channels SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?').bind(JSON.stringify(data),Date.now(),match[1],input.revision).run();
      if(!result.meta.changes)fail('다른 기기에서 변경한 항목입니다. 목록을 새로 불러와 주세요.',409);
      return json({channel:{...data,id:match[1],revision:input.revision+1}});
    }
    const result=await env.DB.prepare('DELETE FROM channels WHERE id = ? AND revision = ?').bind(match[1],input.revision).run();
    if(!result.meta.changes)fail('다른 기기에서 변경한 항목입니다. 목록을 새로 불러와 주세요.',409);
    await env.DB.prepare('DELETE FROM reports WHERE channel_id = ?').bind(match[1]).run();
    return json({ok:true});
  }
  if(path.startsWith('/api/admin/iptv')){const input=(method==='POST'&&!path.endsWith('/refresh'))||method==='PUT'?await body(request,2_000_000):undefined;const result=await handleIptvAdmin(env.DB,path,method,input);if(result)return json(result,method==='POST'&&!path.endsWith('/refresh')?201:200);}
  if(path==='/api/admin/reports'&&method==='GET') {
    const {results}=await env.DB.prepare('SELECT id,channel_id AS "channelId",reason,created_at AS "createdAt" FROM reports ORDER BY created_at DESC LIMIT 100').all();
    return json({reports:results});
  }
  if(path==='/api/admin/reports'&&method==='DELETE') {
    const input=await body(request);await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(text(input.id,'신고',100)).run();return json({ok:true});
  }
  if(path==='/api/admin/pin'&&method==='PUT') {
    const input=await body(request);if(!['family','admin'].includes(input.role)||!/^\d{6,12}$/.test(input.pin))fail('PIN은 숫자 6~12자리로 입력해 주세요.');
    if(!await checkPin(env.DB,env,'admin',text(input.currentPin,'현재 관리자 PIN',32)))fail('현재 관리자 PIN이 맞지 않습니다.',403);
    const hashed=JSON.stringify(await hashPin(input.pin));
    await env.DB.batch([env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(`${input.role}_pin`,hashed),env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(`${input.role}_rev`,crypto.randomUUID())]);
    return json({ok:true},200,input.role==='admin'?{'Set-Cookie':await cookie(request,env,'admin')}:{});
  }
  return json({error:'요청한 기능을 찾을 수 없습니다.'},404);
 } catch(error) {if(!error.status)console.error('HomeTV API failure:',error.message);return json({error:error.status?error.message:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},error.status||500);}
}
