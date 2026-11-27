// '외부 TV' 메뉴의 기본 링크. 방송사 공식 사이트·공식 유튜브 채널·정식 OTT만 넣는다.
// 무단 재전송(불법 스트리밍) 사이트는 넣지 않는다. 2026-11-27 접속 확인.
const link=(id,title,subtitle,url,group,category='live',badge='공식')=>({
  id,title,subtitle,category,kind:'external',url,originalUrl:url,art:'custom',badge,verified:false,visible:true,group,
  description:`${title} 공식 페이지로 연결합니다. 제공 범위·로그인·광고는 원본 사이트의 조건을 따릅니다.`,alternatives:[]
});
export const externalSeeds=[
  link('ext-mbc','MBC 온에어','MBC TV·라디오 실시간','https://onair.imbc.com/','지상파 온에어'),
  link('ext-jtbc','JTBC 온에어','JTBC 실시간 방송','https://onair.jtbc.co.kr/','종편 · 뉴스 온에어'),
  link('ext-tvchosun','TV조선 온에어','TV CHOSUN 실시간 방송','https://broadcast.tvchosun.com/onair/on.cstv','종편 · 뉴스 온에어'),
  link('ext-mbn','MBN 온에어','MBN 실시간 방송','https://www.mbn.co.kr/vod/onair','종편 · 뉴스 온에어'),
  link('ext-yonhap','연합뉴스TV 온에어','24시간 뉴스','https://www.yonhapnewstv.co.kr/live','종편 · 뉴스 온에어'),
  link('yt-ytn','YTN 라이브','YTN 공식 유튜브 실시간','https://www.youtube.com/@ytnnews24/live','유튜브 뉴스 라이브','live','YouTube'),
  link('yt-kbs','KBS 뉴스 라이브','KBS News 공식 유튜브','https://www.youtube.com/@newskbs/live','유튜브 뉴스 라이브','live','YouTube'),
  link('yt-mbc','MBC 뉴스 라이브','MBCNEWS 공식 유튜브','https://www.youtube.com/@MBCNEWS11/live','유튜브 뉴스 라이브','live','YouTube'),
  link('yt-sbs','SBS 뉴스 라이브','SBS 뉴스 공식 유튜브','https://www.youtube.com/@sbsnews8/live','유튜브 뉴스 라이브','live','YouTube'),
  link('yt-jtbc','JTBC 뉴스 라이브','JTBC News 공식 유튜브','https://www.youtube.com/@jtbc_news/live','유튜브 뉴스 라이브','live','YouTube'),
  link('vod-mbc','MBC 다시보기','iMBC 프로그램','https://www.imbc.com/','방송사 다시보기','vod'),
  link('vod-sbs','SBS 다시보기','SBS 프로그램','https://programs.sbs.co.kr/','방송사 다시보기','vod'),
  link('vod-ebs','EBS 다시보기','EBS 프로그램','https://www.ebs.co.kr/tv/show','방송사 다시보기','vod'),
  link('ott-wavve','웨이브 라이브','로그인·이용권 필요','https://www.wavve.com/live','OTT (로그인 필요)','live','OTT'),
  link('ott-tving','티빙 라이브','로그인·이용권 필요','https://www.tving.com/live','OTT (로그인 필요)','live','OTT')
].map((c,i)=>({...c,order:200+i}));
