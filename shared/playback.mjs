export const SOLO_PAGE = 'https://solo-channel-live.pages.dev/';
export const SBS_STREAM_API = 'https://apis.sbs.co.kr/play-api/1.0/livestream/sbspluspc/sbsplus1?v_type=2&platform=pcweb&protocol=hls&ssl=Y&rscuse=&jwt-token=&sbsmain=';

export function validateSbsStream(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('SBS Plus의 재생 주소를 확인하지 못했어요. 다시 연결해 주세요.'); }
  if(url.origin!=='https://tvlive.sbs.co.kr'||url.pathname!=='/sbspluspc/sbsplus1.stream/playlist.m3u8'||!url.searchParams.get('token')||url.username||url.password||url.hash) {
    throw new Error('SBS Plus의 재생 주소를 확인하지 못했어요. 다시 연결해 주세요.');
  }
  return url.href;
}

export async function resolvePlaybackSource(channel,{fetcher=fetch,signal}={}) {
  if(channel.kind!=='sbs-live')return channel.url;
  if(channel.url!==SOLO_PAGE)throw new Error('SBS Plus 연결 주소를 확인해 주세요.');
  const response=await fetcher(SBS_STREAM_API,{cache:'no-store',credentials:'omit',signal});
  if(!response.ok)throw new Error('SBS Plus에서 재생 주소를 받아오지 못했어요. 다시 연결해 주세요.');
  return validateSbsStream(await response.text());
}
