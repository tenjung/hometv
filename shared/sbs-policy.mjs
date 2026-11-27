// Follow the official player's channel/session policy, separately from quality upsell flags.
export function inspectOfficialPlayback(onair,expectedId) {
  const info=onair?.info,source=onair?.source;
  if(info?.channelid!==expectedId||info.onair_yn!=='Y'||info.overseas_yn==='N')throw new Error('지금은 방송사에서 이 채널의 재생을 제공하지 않아요. 원본 사이트에서 확인해 주세요.');
  if(info.required_login==='Y'||onair.login_info?.required_login==='Y')throw new Error('SBS 로그인이 필요한 방송입니다. 원본 사이트에서 시청해 주세요.');
  const candidates=[source?.mediasource,...(source?.mediasourcelist||[])].filter(m=>m?.mediaurl);
  const free=candidates.find(m=>m.required_login==='N'&&m.required_payment==='N');
  const selected=source?.mediasource?.mediaurl?source.mediasource:candidates.find(m=>m.default==='Y');
  if(info.onair_preview_yn==='Y') {
    const seconds=Number(source?.duration);
    if(!selected||!Number.isFinite(seconds)||seconds<=0)throw new Error('미리보기 정보를 확인하지 못했어요. 원본 사이트에서 확인해 주세요.');
    return {media:selected,mode:'preview',previewSeconds:Math.min(60,seconds)};
  }
  if(free)return {media:free,mode:'full',previewSeconds:0};
  if(info.onair_preview_yn==='N'&&(info.pc_free_channel==='Y'||(source?.duration===-1&&onair.login_info?.required_login==='N'))&&selected)return {media:selected,mode:'full',previewSeconds:0};
  throw new Error('이 방송은 SBS 로그인 또는 이용 조건 확인이 필요해요. 원본 사이트에서 시청해 주세요.');
}
