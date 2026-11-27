export function mediaRemoteAction(event) {
  if(event.ctrlKey||event.altKey||event.metaKey)return null;
  return {MediaPlayPause:'toggle',MediaPlay:'play',MediaPause:'pause',MediaRewind:'rewind',MediaFastForward:'forward',MediaStop:'pause'}[event.key]||null;
}
export function stageRemoteAction(event) {
  if(event.ctrlKey||event.altKey||event.metaKey)return null;
  return {Enter:'toggle',' ':'toggle',Spacebar:'toggle',ArrowLeft:'rewind',ArrowRight:'forward',ArrowUp:'controls',ArrowDown:'controls'}[event.key]||null;
}
