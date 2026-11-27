import {kbsCatalog} from './kbs-catalog.mjs';
export const kbsSeeds=kbsCatalog.map((entry,index)=>({
  id:'kbs-'+entry.code.toLowerCase(),title:entry.name,
  subtitle:entry.group==='radio'?'KBS 라이브 라디오':'KBS 실시간 TV',
  category:'live',kind:'kbs-live',url:entry.url,originalUrl:entry.url,
  art:'kbs',badge:entry.group==='radio'?'RADIO':'공식',
  verified:false,visible:true,permission:true,order:60+index,
  description:`${entry.name} 공식 온에어 방송을 집TV 안에서 재생합니다. 연결할 때마다 KBS 공개 API에서 새 재생 주소를 받아옵니다. 저작권 등의 이유로 일부 프로그램은 방송사 사정에 따라 나오지 않을 수 있어요.`,
  alternatives:[]
}));
