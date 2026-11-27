export function mediaRemoteAction(event) {
  if(event.ctrlKey||event.altKey||event.metaKey)return null;
  return {MediaPlayPause:'toggle',MediaPlay:'play',MediaPause:'pause',MediaRewind:'rewind',MediaFastForward:'forward',MediaStop:'pause'}[event.key]||null;
}
export function stageRemoteAction(event) {
  if(event.ctrlKey||event.altKey||event.metaKey)return null;
  return {Enter:'toggle',' ':'toggle',Spacebar:'toggle',ArrowLeft:'rewind',ArrowRight:'forward',ArrowUp:'controls',ArrowDown:'controls'}[event.key]||null;
}
// 전체화면 플레이어(아무 패널도 없을 때)의 리모컨 동작. 위=정보, 아래=채널 목록, 채널 키=채널 이동.
export function playerRemoteAction(event) {
  if(event.ctrlKey||event.altKey||event.metaKey)return null;
  return {Enter:'toggle',' ':'toggle',Spacebar:'toggle',ArrowUp:'info',ArrowDown:'channels',ArrowLeft:'left',ArrowRight:'right',ChannelUp:'next',PageUp:'next',ChannelDown:'prev',PageDown:'prev'}[event.key]||null;
}
