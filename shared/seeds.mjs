// Initial catalog is seeded by the server, separately from schema migrations.
import {sbsSeeds} from './sbs-seeds.mjs';
import {kbsSeeds} from './kbs-seeds.mjs';
import {externalSeeds} from './external-seeds.mjs';
// since: 이 항목이 추가된 초기 목록 버전(worker/api.mjs 의 CATALOG_VERSION).
export const seeds = [
 {id:'solo',title:'나는 SOLO 라이브',subtitle:'수요일 밤의 설렘, SBS Plus',category:'live',kind:'sbs-live',url:'https://solo-channel-live.pages.dev/',originalUrl:'https://solo-channel-live.pages.dev/',art:'solo',badge:'LIVE',verified:false,visible:true,order:1,description:'집TV 안에서 SBS Plus 실시간 방송을 바로 재생합니다. 연결할 때마다 원본 페이지와 같은 공개 API에서 새 재생 주소를 받아옵니다. 현재 방송 편성에 따라 나는 SOLO 이외의 프로그램이 나올 수 있습니다.',alternatives:[{title:'SBS 공식 온에어',url:'https://www.sbs.co.kr/live/S03'}]},
 ...sbsSeeds,
 ...kbsSeeds.map(c=>({...c,since:2})),
 ...externalSeeds.map(c=>({...c,since:3})),
 // 춘천MBC 자체 공개 스트림(방송사 운영). MBC 본사 편성을 대부분 동시 송출하고 지역 뉴스 시간만 다르다.
 {id:'chmbc-live',title:'춘천 MBC',subtitle:'MBC 공중파 · 강원 지역 방송',category:'live',kind:'hls',url:'https://stream.chmbc.co.kr/TV/myStream/playlist.m3u8',originalUrl:'https://www.chmbc.co.kr/',art:'mbc',badge:'LIVE',verified:false,visible:true,order:2,since:4,description:'춘천MBC가 직접 공개한 실시간 스트림입니다. MBC 본사 드라마·예능·뉴스를 대부분 그대로 방송하고, 지역 뉴스 시간에는 강원 지역 방송이 나옵니다.',alternatives:[]},
 {id:'kbs',title:'KBS 온에어',subtitle:'뉴스부터 드라마, 예능까지',category:'live',kind:'external',url:'https://onair.kbs.co.kr/',originalUrl:'https://onair.kbs.co.kr/',art:'kbs',badge:'공식',verified:false,visible:true,order:3,description:'KBS 공식 온에어 페이지로 연결합니다. 원본 사이트의 제공 조건과 지역 제한이 적용됩니다.',alternatives:[]},
 {id:'ebs',title:'EBS 온에어',subtitle:'온 가족이 함께 보는 시간',category:'live',kind:'external',url:'https://www.ebs.co.kr/onair',originalUrl:'https://www.ebs.co.kr/onair',art:'ebs',badge:'공식',verified:false,visible:true,order:4,description:'EBS 공식 온에어 페이지입니다. 교육·교양·어린이 프로그램을 원본 사이트에서 찾아보세요.',alternatives:[]},
 {id:'kbs-vod',title:'KBS 다시보기',subtitle:'보고 싶던 방송을 찾아서',category:'vod',kind:'external',url:'https://vod.kbs.co.kr/',originalUrl:'https://vod.kbs.co.kr/',art:'drama',badge:'공식',verified:false,visible:true,order:5,description:'KBS 공식 다시보기 페이지입니다. 무료 제공 범위와 로그인 여부는 원본 사이트에서 확인하세요.',alternatives:[]},
 {id:'drama-links',title:'무료드라마 링크 모음',subtitle:'주소월드 · 직접 골라보는 시청 링크',category:'vod',kind:'external',url:'https://wdwd16.com/bbs/ContentsList.php?idx=5',originalUrl:'https://wdwd16.com/bbs/ContentsList.php?idx=5',art:'custom',badge:'링크 모음',verified:false,visible:true,order:6,description:'사용자가 참고한 주소월드의 무료드라마 분류입니다. 각 외부 사이트의 이용 조건과 제공 권한을 확인해 주세요. 마음에 드는 사이트는 관리 화면에서 별도 링크로 추가할 수 있습니다.',alternatives:[]},
 {id:'player-demo',title:'플레이어 둘러보기',subtitle:'꽃이 피는 순간 · 공개 샘플 영상',category:'vod',kind:'mp4',url:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',originalUrl:'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video',art:'sample',badge:'샘플',verified:false,visible:true,order:7,description:'내부 재생과 리모컨 조작을 확인하기 위한 MDN의 CC0 공개 꽃 영상입니다. 실제 TV 방송이 아닙니다.',alternatives:[]}
];
