# 집TV 개발 업무일지 2026년 11월 27일 (2부: 외부 배포 · Android TV 앱)

1부: [업무일지 2026-11-27](work-log-2026-11-27.md).

## 현재 상태 한눈에

| 구분 | 내용 |
| --- | --- |
| 외부 접속 주소 (메인) | https://hometv-kappa.vercel.app — 가족 PIN만으로 폰·TV·PC 어디서나 접속 |
| 호스팅 | Vercel 프로젝트 `hometv` (팀 daon, `tenjungs-projects`), 함수 리전 `sin1` |
| DB | Neon `hometv-db` (Vercel Marketplace 연동, Free 플랜, 싱가포르) |
| Android 앱 | `android/` · 최신 릴리스 [app-v1.4](https://github.com/tenjung/hometv/releases/tag/app-v1.4) |
| GitHub | https://github.com/tenjung/hometv (2026-11-27 **공개 전환**) |
| 기존 배포 | ChatGPT Sites(D1) 비공개 배포는 그대로 남아 있음. 데이터는 Vercel/Neon과 **별개** |

- 앞으로 채널 추가·수정은 **Vercel 주소의 관리 화면**에서 한다. PC 로컬 서버·Sites와는 데이터가 동기화되지 않는다.
- 실제 TV·폰에서 PIN 로그인, 업데이트 알림 설치는 아직 사용자 확인 전이다.

## 오늘 한 일

### 1. 웹 화면 개편 (Google TV 스타일)
- 사이드바를 없애고 위쪽 둥근 탭(검색·홈·실시간 TV·드라마·예능·즐겨찾기·최근 이용) + 오른쪽 아이콘·시계.
- 홈: 리모컨으로 고른 카드에 따라 바뀌는 큰 배너, 가로 카드 줄(지금 바로 보는 LIVE·즐겨찾기·최근·우리집 채널·SBS·24시간·라디오·다시보기).
- 시청 화면: 전체화면, 왼쪽 영상·정보 / 오른쪽 같은 분류 채널 목록, 이전·다음 채널 버튼. 좁은 화면은 목록이 아래로.
- 카드 상태 표시를 데이터의 `badge` 문구 대신 실제 재생 가능 여부로 계산: `LIVE`(앱 안 바로 재생 5개) / `미리보기 60초`(14개) / `외부 연결`.
- 검색창이 세로로 깨지던 문제(전역 `label` 스타일 상속) 수정.

### 2. 외부 배포 (Vercel + Neon)
- `worker/api.mjs` 의 SQL을 SQLite·Postgres 공용으로 수정(`INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`, 별칭 따옴표).
- `server/neon-db.mjs`: Neon을 D1 방식(prepare/bind/first/all/run/batch)으로 감싸는 어댑터. `?` → `$1`, bigint → number.
- `api/index.mjs`: Vercel Function 진입점. `vercel.json` 이 `/api/*` 를 여기로 보낸다.
- **보안**: 로그인 실패 제한(8회/10분)의 IP는 Vercel이 덮어쓰는 `x-real-ip` 만 사용. 클라이언트가 보낸 `CF-Connecting-IP` 등은 버린다(꾸민 헤더로 PIN 무한 대입 방지).
- `.vercelignore`: `.dev.vars`, `.local`, `.env*`, `android` 등 업로드 제외.
- Neon 테이블: `server/schema.pg.sql`. 로컬 SQLite 채널 26개 복사(`scripts/neon-setup.mjs`). PIN 해시·로그인 기록·신고는 복사하지 않음.
- Vercel 환경 변수(Production): `DATABASE_URL`(Neon 연동 자동), `SESSION_SECRET`(무작위 생성), `FAMILY_PIN`·`ADMIN_PIN`(사용자가 직접 입력, `scripts/set-pins.ps1`). 값은 업무일지·Git에 기록하지 않는다.
- 외부 확인: 첫 화면 200, 로그인 전 목록 401, 틀린 PIN 401, 다른 출처 요청 403, `.dev.vars`·로컬 DB 404.

### 3. Android TV·폰 앱 (`android/`)
- WebView 기반 개인용 브라우저. 한 APK로 TV(리모컨)·폰(터치) 모두 지원, TV 홈 배너(Leanback) 포함.
- 홈 주소 기본값 `https://hometv-kappa.vercel.app/`. 예전 기본값(집 PC `http://172.30.1.46:4317/`)을 쓰던 기기는 자동 전환.
- 위쪽 버튼 줄: 뒤로·앞으로·새로고침·홈·주소창·즐겨찾기·메뉴. 자동 팝업 창 차단.
- **일반 사이트 리모컨 조작** (`app/src/main/assets/tvnav.js`):
  - 방향키로 링크·버튼·입력칸 사이 이동(주황+흰 테두리), 가운데로 클릭, 링크가 멀면 반 화면씩 스크롤.
  - 맨 위에서 위 → 버튼 줄, 입력칸은 확인으로 입력 시작·위아래로 빠져나옴.
  - 다른 사이트 플레이어(iframe)는 확인 시 커서 모드로 전환, 뒤로로 복귀.
  - 집TV 홈에서는 꺼지고 웹 자체 방향키 이동 사용. 메뉴에서 자동 이동/커서/끔 선택.
- 뒤로 길게 누르기 = 메뉴(메뉴 키 없는 리모컨용). 키보드 백스페이스·Esc = 뒤로.
- **업데이트 알림** (`Updater.java`): 앱 실행 3초 후 GitHub 릴리스(`app-v*` 태그)에서 새 APK 확인 → 받기 → 시스템 설치 화면. 메뉴에 "업데이트 확인".
- 릴리스: v1.2(업데이트 기능), v1.3(일반 사이트 리모컨), v1.4(Vercel 주소·뒤로 길게=메뉴 등).
- tvmon 예시 앱(불법 스트리밍 사이트 전용 광고 숨김)은 적용하지 않았다. 특정 사이트용 광고 제거·시작 페이지 지정은 하지 않는다.

### 4. 테스트 환경
- 자동 테스트 26개 통과(`npm test`, Neon 어댑터 테스트 추가).
- Google TV 에뮬레이터(Android 13, `HomeTV_GoogleTV`)에서 실제 앱 동작 확인: 설치·홈 로드·뒤로 길게 메뉴·주소 자동 전환.
- PC 크롬 테스트 도구: `android/tools/pc-tester.html` (북마크 버튼으로 아무 사이트에서 방향키·엔터·백스페이스 테스트). `tvnav.js` 수정 후 `node android/tools/build-pc-tester.mjs` 로 다시 생성.

## 다른 컴퓨터에서 이어서 작업하기

### 웹
```powershell
git clone https://github.com/tenjung/hometv.git
cd hometv
npm ci
copy .env.example .dev.vars   # 로컬용 PIN·SESSION_SECRET 직접 입력
npm run dev                   # http://localhost:4317
npm test
```
Vercel 배포를 하려면: `npm i -g vercel` → `vercel login` → `vercel link --project hometv --scope tenjungs-projects` → `vercel deploy --prod`.
환경 변수는 Vercel에 저장되어 있으므로 새 PC에 옮길 필요 없다.

### Android 앱 빌드·릴리스
- 필요한 것: JDK 17, Android SDK(platform 35, build-tools 35.0.0), Gradle 8.9, GitHub CLI(`gh auth login`).
- 이 PC는 `C:\Users\VICTUS\.hometv-android\` 에 설치. `android/release.ps1` 안의 경로(`$T`)를 새 PC에 맞게 고친다.
- **경로에 한글이 있으면 Android 빌드가 실패**한다. `release.ps1` 은 영문 경로(`$T\build-src`)로 복사해 빌드한다.
- `android/local.properties` (Git 제외)를 새 PC에 만든다:
  ```
  sdk.dir=C\:/경로/sdk
  hometv.keystore=C\:/경로/hometv-signing.keystore
  ```
- **서명 키 `hometv-signing.keystore` 는 Git에 없다.** 이 PC의 `C:\Users\VICTUS\.hometv-android\hometv-signing.keystore` 를 USB 등으로 직접 옮긴다. 다른 키로 서명하면 설치된 앱 위에 업데이트가 안 된다(삭제 후 재설치 필요).
- 릴리스: `app/build.gradle.kts` 의 `versionCode`·`versionName` 을 올리고
  ```powershell
  powershell -File android\release.ps1 -Notes "바뀐 점"
  ```
  → 빌드 후 GitHub 릴리스 `app-v<버전>` 에 APK 업로드 → 설치된 앱들이 업데이트 알림을 받는다.

## 남은 일
1. 실제 TV·폰에서 Vercel 주소 PIN 로그인, 앱 v1.4 업데이트 알림·설치, 리모컨 조작(이동 순서·스크롤 감도) 확인.
2. 업무일지 1부의 남은 일(실기기 키 매핑, 삼성 TV 플러스, 네이티브 플레이어 여부)은 유지.
3. 공식 무료 라이브(KBS·MBC·EBS 등 방송사 공개 스트림) 앱 안 재생 추가 검토.
4. 데이터 저장소가 Sites(D1)·로컬·Neon 세 곳으로 나뉘어 있다. Neon을 기준으로 정리할지 결정.
5. 서명 키 백업 확인.
