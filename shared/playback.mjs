import {sbsCatalog} from './sbs-catalog.mjs';
import {inspectOfficialPlayback} from './sbs-policy.mjs';
export const SOLO_PAGE = 'https://solo-channel-live.pages.dev/';
export const SBS_STREAM_API = 'https://apis.sbs.co.kr/play-api/1.0/livestream/sbspluspc/sbsplus1?v_type=2&platform=pcweb&protocol=hls&ssl=Y&rscuse=&jwt-token=&sbsmain=';

export const getSbsChannel=channel=>sbsCatalog.find(entry=>entry.url===channel.url);

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

export async function resolvePlayback(channel,{fetcher=fetch,signal}={}) {
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
