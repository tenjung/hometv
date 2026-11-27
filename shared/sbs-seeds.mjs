import {sbsCatalog} from './sbs-catalog.mjs';
export const sbsSeeds=sbsCatalog.map((entry,index)=>({
  id:entry.id==='S01'?'sbs':'sbs-'+entry.id.toLowerCase(),title:entry.name,
  subtitle:entry.group==='24tv'?'SBS 24시간 TV':entry.group==='radio'?'SBS 라이브 라디오':'SBS 실시간 TV',
  category:'live',kind:entry.direct?'sbs-live':'external',url:entry.url,originalUrl:entry.url,
  art:entry.group==='24tv'?'drama':entry.group==='radio'?'kbs':'sbs',badge:entry.group==='24tv'?'24시간':entry.group==='radio'?'RADIO':'공식',
  verified:false,visible:true,permission:entry.direct,order:20+index,
  description:entry.direct?`${entry.name} 공식 공개 방송을 집TV 안에서 재생합니다. 연결할 때마다 방송사에서 최신 주소를 받아오며, 제공 조건이 바뀌면 공식 페이지에서 확인할 수 있습니다.`:`SBS 공식 라이브 목록의 ${entry.name} 채널입니다. 현재 ${entry.reason} 항목으로 공식 시청 페이지에 연결합니다. 프로그램·지역·로그인·이용권 조건은 SBS에서 확인해 주세요.`,
  alternatives:[]
}));
