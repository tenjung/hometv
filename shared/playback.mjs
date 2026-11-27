import {sbsCatalog} from './sbs-catalog.mjs';
import {inspectOfficialPlayback} from './sbs-policy.mjs';
import {kbsCatalog} from './kbs-catalog.mjs';
export const SOLO_PAGE = 'https://solo-channel-live.pages.dev/';
export const SBS_STREAM_API = 'https://apis.sbs.co.kr/play-api/1.0/livestream/sbspluspc/sbsplus1?v_type=2&platform=pcweb&protocol=hls&ssl=Y&rscuse=&jwt-token=&sbsmain=';

export const KBS_LIVE_API='https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/';

export const getSbsChannel=channel=>sbsCatalog.find(entry=>entry.url===channel.url);
export const getKbsChannel=channel=>kbsCatalog.find(entry=>entry.url===channel.url);
// 방송사 공식 채널 공통 정보(카드 줄·분류·라디오 화면에 사용).
export function getOfficialChannel(channel){
  const sbs=getSbsChannel(channel);
  if(sbs)return {broadcaster:'SBS',name:sbs.name,group:sbs.group,mode:sbs.mode,previewSeconds:sbs.previewSeconds};
  const kbs=getKbsChannel(channel);
  if(kbs)return {broadcaster:'KBS',name:kbs.name,group:kbs.group,mode:'full',previewSeconds:0};
  return undefined;
}

export function validateKbsStream(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('KBS의 재생 주소를 확인하지 못했어요. 다시 연결해 주세요.'); }
  if(url.protocol!=='https:'||!/^[a-z0-9-]+\.gscdn\.kbs\.co\.kr$/.test(url.hostname)||url.port||!url.pathname.endsWith('.m3u8')||url.username||url.password||url.hash)
    throw new Error('KBS의 재생 주소를 확인하지 못했어요. 다시 연결해 주세요.');
  return url.href;
}

export function validateSbsStream(value,expected) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('SBS Plus의 재생 주소를 확인하지 못했어요. 다시 연결해 주세요.'); }
  const allowedOrigin=expected?['https://tvlive.sbs.co.kr','https://24tv.sbs.co.kr','https://radiolive.sbs.co.kr'].includes(url.origin):url.origin==='https://tvlive.sbs.co.kr';
  const allowedPath=expected&&/^[\w-]+$/.test(expected.channel)&&/^[\w-]+$/.test(expected.stream)?`/${expected.channel}/${expected.stream}.stream/playlist.m3u8`:'/sbspluspc/sbsplus1.stream/playlist.m3u8';
  if(!allowedOrigin||url.pathname!==allowedPath||!url.searchParams.get('token')||url.username||url.password||url.hash) {
    throw new Error('SBS Plus의 재생 주소를 확인하지 못했어요. 다시 연결해 주세요.');
  }
  return url.href;
}

async function resolveKbs(channel,fetcher,signal){
  const official=getKbsChannel(channel);
  if(!official)throw new Error('KBS 공식 채널 주소를 확인해 주세요.');
  const response=await fetcher(KBS_LIVE_API+official.code,{cache:'no-store',credentials:'omit',signal});
  if(!response.ok)throw new Error('KBS 방송 정보를 불러오지 못했어요. 원본 사이트에서 확인해 주세요.');
  const data=await response.json();
  // 공식 플레이어와 같이 TV는 tv, 라디오는 radio 스트림을 고른다. 미리보기·자막 스트림은 쓰지 않는다.
  const item=(data?.channel_item||[]).find(i=>i?.media_type===(official.group==='radio'?'radio':'tv')&&i.service_url);
  if(data?.ret!==0||!item)throw new Error('지금은 방송사에서 이 채널의 재생을 제공하지 않아요. 원본 사이트에서 확인해 주세요.');
  return {url:validateKbsStream(item.service_url),previewSeconds:0};
}

export async function resolvePlayback(channel,{fetcher=fetch,signal}={}) {
  if(channel.kind==='kbs-live')return resolveKbs(channel,fetcher,signal);
  if(channel.kind!=='sbs-live')return {url:channel.url,previewSeconds:0};
  const official=getSbsChannel(channel);
  if(official){
    const route=official.group==='24tv'?'binge-watch/channel':'channel';
    const endpoint=`https://apis.sbs.co.kr/play-api/1.0/onair/${route}/${official.id}?v_type=2&platform=pcweb&protocol=hls&ssl=Y&rscuse=&jwt-token=&sbsmain=`;
    const response=await fetcher(endpoint,{cache:'no-store',credentials:'omit',signal});
    if(!response.ok)throw new Error('SBS 방송 정보를 불러오지 못했어요. 원본 사이트에서 확인해 주세요.');
    const {onair}=await response.json();
    const policy=inspectOfficialPlayback(onair,official.id);
    const broadcast=[official.id,onair.info.programid||onair.info.title||'',onair.info.starttime||'',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'})].join(':');
    return {url:validateSbsStream(policy.media.mediaurl,onair.source),previewSeconds:policy.previewSeconds,previewKey:broadcast};
  }
  if(channel.url!==SOLO_PAGE)throw new Error('SBS Plus 연결 주소를 확인해 주세요.');
  const response=await fetcher(SBS_STREAM_API,{cache:'no-store',credentials:'omit',signal});
  if(!response.ok)throw new Error('SBS Plus에서 재생 주소를 받아오지 못했어요. 다시 연결해 주세요.');
  return {url:validateSbsStream(await response.text()),previewSeconds:0};
}

export async function resolvePlaybackSource(channel,options={}) {return (await resolvePlayback(channel,options)).url;}
