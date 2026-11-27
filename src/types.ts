export type Channel = {id:string;title:string;subtitle:string;category:'live'|'vod';kind:'external'|'hls'|'mp4'|'sbs-live'|'kbs-live'|'iptv';url:string;originalUrl:string;art:string;badge:string;verified:boolean;visible:boolean;order:number;description:string;alternatives:{title:string;url:string}[];revision:number;group?:string;logo?:string;iptv?:{sourceId:string;sourceName:string;group:string;tvgId:string}};
export type Session = {authenticated:boolean;admin:boolean};
export type View = 'home'|'live'|'iptv'|'external'|'vod'|'favorites'|'recent';
