# 집TV

PC와 Android TV / Google TV용 가족 영상 홈. React + TypeScript + Vite 프런트엔드, Cloudflare Worker API, D1 데이터베이스로 구성합니다. 영상은 원본 제공처에서 직접 재생하며 프록시·다운로드·봇 인증 우회를 하지 않습니다.

## 로컬 실행

Node.js 24 이상 필요. `npm install` 후 `.env.example`의 항목을 `.dev.vars`에 설정합니다. 가족과 관리자 PIN은 각각 숫자 6~12자리이며 같은 값도 사용할 수 있습니다. SESSION_SECRET은 32자 이상의 난수로 설정하세요. 이 파일은 Git에서 제외됩니다.

```powershell
npm run dev
```

PC: http://localhost:4317 . 같은 와이파이의 TV에서는 `http://PC의사설IP:4317`로 접속합니다. 브라우저 개발 서버를 외부 인터넷에 노출하지 마세요. Windows 방화벽이나 공유기 격리에 따라 TV 접근을 위한 별도 설정이 필요할 수 있습니다. 로컬 데이터는 `.local/hometv.sqlite`에 보관됩니다.

```powershell
npm test
npm run build
npm start
```

`npm start`는 빌드된 Worker를 로컬 Node 어댑터로 실행하므로 개발용 Vite 서버 없이 배포 결과를 검증할 수 있습니다. Windows에서 여러 서버를 동시에 실행하면 4317 포트가 충돌하므로 한 개만 실행하세요.

## 배포

`.openai/hosting.json`의 Sites 프로젝트와 `DB` D1 바인딩을 사용합니다. Sites에서 `FAMILY_PIN`, `ADMIN_PIN`, `SESSION_SECRET`을 비밀 환경 변수로 설정하고, 스킬의 소스 동기화·아카이브·배포 절차로 발행합니다. `drizzle/`의 생성된 마이그레이션을 함께 패키징합니다. 운영·로컬 DB는 별개입니다. 초기 링크는 첫 인증된 목록 조회 시 한 번만 등록됩니다. 삭제한 초기 링크는 다시 생성되지 않습니다.

Sites 비공개 배포는 플랫폼 로그인/접근 제어도 적용되므로 가족 PIN만으로 누구나 접속할 수 있는 배포와 다릅니다. 가족 기기에서는 플랫폼이 허용하는 접근 권한이 추가로 필요합니다. 일반 Cloudflare 배포를 사용할 경우 별도 도메인과 D1 바인딩·마이그레이션·비밀 환경 변수를 구성해야 합니다.

## 기능과 인터페이스

- `GET /api/session`, `POST /api/login`, `POST /api/logout`: 서버 인증, 서명된 HttpOnly 쿠키. 가족 세션 30일, 관리자 8시간. 로그인 실패 8회/10분 제한.
- `GET /api/channels`: 가족에게는 표시 중인 항목만 반환. 관리자는 숨김 항목 포함.
- `POST /api/admin/channels`, `PUT/DELETE /api/admin/channels/:id`: 관리자 전용. 수정·삭제는 revision 충돌 검사.
- `POST /api/reports`, `GET/DELETE /api/admin/reports`: 가족 접속 문제 기록·관리. 세션·항목·날짜별 중복 기록 방지.
- `PUT /api/admin/pin`: 현재 관리자 PIN 재확인. 숫자 6~12자리. 변경한 역할의 기존 세션 만료, PIN은 PBKDF2로 저장.
- 모든 변경 요청은 동일 출처 Origin을 검사합니다. API는 캐시하지 않습니다. 콘텐츠는 https 주소만 허용합니다.

즐겨찾기·최근 이용·TV 모드·다시보기 재생 위치는 기기 로컬 저장소에 보관합니다. 링크·순서·대체 경로·확인 상태·신고는 서버에서 공유합니다. TV 모드는 방향키 공간 탐색, 확인 선택, 브라우저 뒤로가기, 숫자 키패드를 제공합니다. 검색어 입력은 브라우저 키보드를 사용합니다.

## 콘텐츠와 검증 한계

SBS 공식 `/live` 목록에서 TV 9개, 24시간 TV 8개, 라디오 3개를 추출해 등록합니다. `shared/sbs-catalog.mjs`에는 채널 이름·ID·그룹·공식 페이지와 공개 재생 지원 여부만 저장하며, 방송 토큰은 포함하지 않습니다. `npm run catalog:sbs`로 공식 목록을 다시 확인할 수 있습니다. 목록 변경 후 기존 DB의 항목은 관리자 API로 별도 반영해야 하며 임의로 덮어쓰거나 삭제하지 않습니다.

공식 채널은 SBS의 onair 정보 API에서 전체 세션의 로그인·지역·방송 제공 상태를 확인합니다. 화질 선택의 이용권 표시와 전체 채널 재생 조건을 구분합니다. 공식 플레이어가 제공하는 기본 미리보기 소스는 방송사 duration과 최대 60초 범위에서 재생하고 남은 시간을 표시합니다. 미리보기가 끝나면 재생·미디어 로드를 중단하고 공식 로그인 경로를 제공합니다. 같은 방송의 미리보기 기한을 탭의 sessionStorage에 기록해 재시도·닫기·새로고침으로 자동 연장하지 않습니다. 토큰은 저장하지 않습니다.

현재 목록은 공개 재생 4개(SBS BIZ, POWER FM, LOVE FM, 고릴라M), 공식 미리보기 14개, 공식 페이지 연결 2개입니다. SBS No.1 뉴스라이브는 응답에 재생 주소가 없고, SBS Plus 공식 채널은 방송 제공 제한 상태이므로 외부 연결을 유지합니다. 기존 별도 나는 SOLO 바로가기의 연결 방식은 유지합니다. 제공 조건은 바뀔 수 있으며 매 재생마다 다시 검증합니다.

나는 SOLO 라이브는 원본 페이지가 사용하는 SBS Plus 공개 재생 API에 브라우저가 직접 연결합니다. 재생할 때마다 만료 시간이 있는 HLS 주소를 새로 받고, SBS의 예상 호스트·경로·토큰 형식을 확인합니다. 영상 주소와 토큰은 DB나 소스에 저장하지 않습니다. 네이티브 HLS 또는 hls.js로 재생하고 재연결 시 주소를 다시 받습니다. 자동 재생이 제한된 브라우저는 재생 버튼을 사용하세요. 현재 편성된 SBS Plus 방송이 나오므로 항상 나는 SOLO가 방송되는 것은 아닙니다.

초기에는 사용자 제공 나는 SOLO 페이지, SBS·KBS·EBS 공식 페이지, KBS 다시보기, 주소월드 무료드라마 분류, MDN CC0 공개 MP4 샘플을 제공합니다. 외부 페이지의 무료 범위·로그인·지역 제한은 제공처에 따릅니다. 주소월드는 외부 링크 모음으로 연결하며 자동 수집하거나 스트림을 추출하지 않습니다.

샘플: MDN CC0 flower video https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video . 배경 사진: https://images.unsplash.com/photo-1440404653325-ab127d49abc1 (원격 이미지 URL 사용, 배경 대체 색상 제공).

외부 페이지는 동일 출처 정책 때문에 봇 차단 여부를 자동 판독하지 않습니다. 실제 사용할 TV에서 접속·영상·오디오·인증·전체화면·리모컨·복귀를 확인한 후에만 관리 화면의 TV 확인 표시를 켜세요. 관리자가 확인하더라도 향후 원본 사이트가 변경될 수 있습니다. TV 브라우저별 기능과 코덱 지원 차이가 있습니다.

## GitHub 동기화

`origin`은 https://github.com/tenjung/hometv.git 입니다. Sites는 별도 소스 저장소의 배포 이력을 유지합니다. 로컬 `main`에서 변경을 커밋한 후 `npm run sync:github`로 동일한 소스 트리를 GitHub `main`에 올립니다. `github-main`은 GitHub의 최근 소스 스냅샷을 추적합니다. GitHub에는 필요한 소스 스냅샷만 보내며 로컬 운영 설정, 데이터베이스, 빌드 산출물, 과거의 비공개 배포 이력은 보내지 않습니다. 기존 원격 변경은 확인하고 이어 붙이며 강제 푸시를 하지 않습니다.
