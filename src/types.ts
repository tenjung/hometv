export type Channel = {id:string;title:string;subtitle:string;category:'live'|'vod';kind:'external'|'hls'|'mp4'|'sbs-live';url:string;originalUrl:string;art:string;badge:string;verified:boolean;visible:boolean;order:number;description:string;alternatives:{title:string;url:string}[];revision:number};
export type Session = {authenticated:boolean;admin:boolean};
export type View = 'home'|'live'|'vod'|'favorites'|'recent';
