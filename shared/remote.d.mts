type KeyEvent={key:string;ctrlKey?:boolean;altKey?:boolean;metaKey?:boolean};
export type MediaAction='toggle'|'play'|'pause'|'rewind'|'forward';
export function mediaRemoteAction(event:KeyEvent):MediaAction|null;
export function stageRemoteAction(event:KeyEvent):MediaAction|'controls'|null;
export type PlayerAction='toggle'|'info'|'channels'|'left'|'right'|'next'|'prev';
export function playerRemoteAction(event:KeyEvent):PlayerAction|null;
