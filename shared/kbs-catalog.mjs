// KBS 공식 온에어(onair.kbs.co.kr)의 채널 목록. 재생 주소·서명은 저장하지 않는다.
// 재생할 때마다 브라우저가 KBS 공개 API에서 새 주소를 받는다(2026-11-27 CORS 허용 확인).
// KBS Drama(N91)·KBS Joy(N92)는 외부 출처에서 복호화 키 서버가 403으로 거부하므로 넣지 않는다.
const page=(code,type)=>`https://onair.kbs.co.kr/index.html?sname=onair&stype=live&ch_code=${code}&ch_type=${type}`;
const tv=(code,name)=>({code,name,group:'tv',url:page(code,'globalList')});
const radio=(code,name)=>({code,name,group:'radio',url:page(code,'radioList')});
export const kbsCatalog=[
  tv('11','KBS 1TV'),
  tv('12','KBS 2TV'),
  tv('81','KBS NEWS 24'),
  tv('N94','KBS Story'),
  tv('N93','KBS LIFE'),
  tv('N96','KBS KIDS'),
  tv('14','KBS WORLD'),
  radio('21','KBS 1라디오'),
  radio('22','KBS 해피FM'),
  radio('24','KBS 클래식FM'),
  radio('25','KBS 쿨FM'),
  radio('23','KBS 3라디오')
];
