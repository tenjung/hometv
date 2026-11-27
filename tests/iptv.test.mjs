import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseM3U,parseXmltv,xtreamUrls,xmltvTime,nowNext,iptvChannelId} from '../shared/iptv.mjs';
import {assertPublicUrl} from '../worker/iptv.mjs';
import {handleApi} from '../worker/api.mjs';
import {localDB} from '../scripts/local-db.mjs';

const playlist=`#EXTM3U x-tvg-url="https://epg.example/guide.xml.gz"
#EXTINF:-1 tvg-id="news.kr" tvg-logo="https://logo.example/n.png" group-title="뉴스, 시사",뉴스 채널, HD
#EXTVLCOPT:http-user-agent=Test
http://iptv.example/live/1.m3u8
#EXTINF:-1 tvg-name="Movie One" group-title="영화",
https://iptv.example/live/2.m3u8
#EXTINF:-1,잘못된 줄
javascript:alert(1)
#EXTINF:-1,그룹 태그
#EXTGRP:스포츠
https://iptv.example/live/3.m3u8`;

test('M3U playlists keep names, groups, logos, tvg ids and the guide address',()=>{const r=parseM3U(playlist);assert.equal(r.epgUrl,'https://epg.example/guide.xml.gz');assert.equal(r.channels.length,3);assert.deepEqual(r.channels[0],{name:'뉴스 채널, HD',logo:'https://logo.example/n.png',group:'뉴스, 시사',tvgId:'news.kr',url:'http://iptv.example/live/1.m3u8'});assert.equal(r.channels[1].name,'Movie One');assert.equal(r.channels[2].group,'스포츠');assert.ok(r.channels.every(c=>!c.url.startsWith('javascript')));});
test('plain lists of stream addresses become channels',()=>{const r=parseM3U('https://a.example/live.m3u8\n우리 채널|https://b.example/x.m3u8\n# comment\nnot a url');assert.deepEqual(r.channels.map(c=>c.name),['live','우리 채널']);});
test('Xtream servers produce HLS playlist and XMLTV guide addresses with encoded credentials',()=>{const u=xtreamUrls({server:'http://tv.example:8080/player_api.php',username:'a b',password:'p&w'});assert.equal(u.m3u,'http://tv.example:8080/get.php?username=a%20b&password=p%26w&type=m3u_plus&output=m3u8');assert.equal(u.epg,'http://tv.example:8080/xmltv.php?username=a%20b&password=p%26w');assert.throws(()=>xtreamUrls({server:'ftp://x',username:'a',password:'b'}));assert.throws(()=>xtreamUrls({server:'http://x',username:'',password:'b'}));});
test('XMLTV times honour offsets and programs are filtered by channel and window',()=>{assert.equal(xmltvTime('20261127180000 +0900'),Date.UTC(2026,10,27,9));const xml=`<tv><channel id="news.kr"><display-name>뉴스 채널</display-name></channel><programme start="20261127180000 +0900" stop="20261127190000 +0900" channel="news.kr"><title>저녁 뉴스 &amp; 날씨</title><desc><![CDATA[오늘 소식]]></desc></programme><programme start="20261127190000 +0900" stop="20261127200000 +0900" channel="news.kr"><title>다음</title></programme><programme start="20261127180000 +0900" stop="20261127190000 +0900" channel="other"><title>x</title></programme></tv>`;const {programs,names}=parseXmltv(xml,{ids:['news.kr']});assert.deepEqual(Object.keys(programs),['news.kr']);assert.equal(programs['news.kr'][0].t,'저녁 뉴스 & 날씨');assert.equal(programs['news.kr'][0].d,'오늘 소식');assert.equal(names['뉴스 채널'],'news.kr');const n=nowNext(programs['news.kr'],Date.UTC(2026,10,27,9,30));assert.equal(n.now.t,'저녁 뉴스 & 날씨');assert.equal(n.next.t,'다음');assert.equal(n.progress,.5);assert.equal(nowNext([],0).now,null);});
test('IPTV channel ids stay stable for the same channel',()=>{const c={name:'A',tvgId:'a.kr',group:'g',url:'http://x/1'};assert.equal(iptvChannelId('s1',c),iptvChannelId('s1',{...c,url:'http://x/2'}));assert.notEqual(iptvChannelId('s1',c),iptvChannelId('s2',c));});
test('the server never reads local or private network addresses',()=>{for(const url of ['http://localhost/x','http://127.0.0.1/x','http://10.0.0.5/x','http://192.168.0.1/x','http://172.20.1.1/x','http://169.254.169.254/latest','http://[::1]/x','http://router.local/x','http://2130706433/x','file:///etc/passwd','http://u:p@example.com/x'])assert.throws(()=>assertPublicUrl(url),url);assert.equal(assertPublicUrl('http://iptv.example:8080/get.php').hostname,'iptv.example');});

function fixture(t){const DB=localDB(':memory:');t.after(()=>DB.close());const env={DB,FAMILY_PIN:'482619',ADMIN_PIN:'73825194',SESSION_SECRET:'test-secret-is-at-least-thirty-two-characters'};
 const call=async(path,method='GET',payload,cookie='')=>{const r=await handleApi(new Request('https://home.test/api'+path,{method,headers:{'Content-Type':'application/json',...(method!=='GET'?{Origin:'https://home.test'}:{}),Cookie:cookie,'CF-Connecting-IP':'192.0.2.9'},...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);return{status:r.status,body:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};};
 const login=async role=>(await call('/login','POST',{role,pin:role==='admin'?env.ADMIN_PIN:env.FAMILY_PIN})).cookie;return {call,login};}

test('admins import a pasted playlist, families read channels, passwords are never returned',async t=>{const {call,login}=fixture(t);const admin=await login('admin'),family=await login('family');
 assert.equal((await call('/admin/iptv','POST',{name:'우리 목록',type:'text',text:playlist},family)).status,403);
 const created=await call('/admin/iptv','POST',{name:'우리 목록',type:'text',text:playlist},admin);assert.equal(created.status,201);assert.equal(created.body.source.channelCount,3);
 const list=(await call('/iptv','GET',undefined,family)).body.sources;assert.equal(list.length,1);assert.equal(list[0].channels.length,3);assert.equal(list[0].channels[0].group,'뉴스, 시사');
 assert.equal((await call('/admin/iptv','POST',{name:'x',type:'xtream',server:'http://127.0.0.1:8080',username:'u',password:'secret-pass'},admin)).status,400);
 const adminList=(await call('/admin/iptv','GET',undefined,admin)).body.sources;assert.ok(!JSON.stringify(adminList).includes('secret-pass'));
 assert.equal((await call('/iptv/epg?source='+created.body.source.id+'&ids=a','GET',undefined,family)).status,200);
 assert.equal((await call('/admin/iptv/'+created.body.source.id,'DELETE',{},admin)).status,200);assert.equal((await call('/iptv','GET',undefined,family)).body.sources.length,0);});
test('an empty or unreadable playlist is rejected with a clear message',async t=>{const {call,login}=fixture(t);const admin=await login('admin');const r=await call('/admin/iptv','POST',{name:'빈 목록',type:'text',text:'hello'},admin);assert.equal(r.status,422);assert.match(r.body.error,/채널을 찾지 못했어요/);});
