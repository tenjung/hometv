// tvnav.js + pc-tester.js 를 북마크 버튼(javascript: 주소)으로 묶어 pc-tester.html 을 만든다.
// 사용: node android/tools/build-pc-tester.mjs  (tvnav.js 를 고친 뒤 다시 실행)
import {readFileSync, writeFileSync} from 'node:fs';
const here = new URL('.', import.meta.url);
const tvnav = readFileSync(new URL('../app/src/main/assets/tvnav.js', here), 'utf8');
const tester = readFileSync(new URL('pc-tester.js', here), 'utf8').replace('/*__TVNAV__*/', tvnav);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
const code = strip(tester);
const bookmarklet = 'javascript:' + encodeURIComponent(code);
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>집TV 리모컨 테스트</title>
<style>
:root{--bg:#101117;--panel:#1b1c23;--text:#eeeef2;--muted:#9a9daa;--accent:#e45a3c;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 'Malgun Gothic',sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:28px;margin:0 0 6px}h2{font-size:19px;margin:34px 0 10px}p,li{color:#c9cbd4}
.install{display:flex;flex-wrap:wrap;gap:14px;align-items:center;background:var(--panel);border-radius:14px;padding:20px;margin:18px 0}
.bm{display:inline-block;background:var(--accent);color:#fff;font-weight:700;padding:12px 18px;border-radius:10px;text-decoration:none;cursor:grab}
kbd{background:#2a2c36;border-radius:5px;padding:2px 8px;font:inherit;color:#fff}
table{border-collapse:collapse;width:100%;background:var(--panel);border-radius:12px;overflow:hidden}td{padding:10px 14px;border-top:1px solid #ffffff10}
.demo{background:#f3f3f6;color:#222;border-radius:14px;padding:16px;margin-top:12px}
.demo header{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.demo a{color:#2357c5}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{display:block;height:90px;background:#dfe0ea;border-radius:8px;padding:10px;color:#222;text-decoration:none}
.long{height:900px;background:linear-gradient(#f3f3f6,#d9dae3);border-radius:8px;margin-top:14px;padding:12px;color:#555}
.demo input{padding:6px 10px;border:1px solid #bbb;border-radius:6px;background:#fff;color:#222}
@media(max-width:600px){.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main>
<h1>집TV 리모컨 테스트 (PC)</h1>
<p>TV 앱의 리모컨 이동 방식을 PC 크롬 키보드로 그대로 써 보는 도구입니다. 아무 사이트에서나 켤 수 있습니다.</p>
<div class="install"><a class="bm" href="${esc(bookmarklet)}">📺 집TV 리모컨 테스트</a>
<span>← 이 버튼을 크롬 <b>북마크바로 끌어다 놓으세요</b>. (북마크바가 안 보이면 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>)</span></div>
<h2>사용법</h2>
<ol><li>테스트할 사이트를 엽니다.</li><li>북마크바의 <b>📺 집TV 리모컨 테스트</b>를 누르면 켜집니다. 한 번 더 누르면 꺼집니다.</li><li>키보드로 조작합니다. 새 페이지로 이동하면 다시 눌러 켜 주세요.</li></ol>
<table>
<tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></td><td>리모컨 상하좌우 — 링크·버튼 사이 이동, 먼 곳은 스크롤</td></tr>
<tr><td><kbd>Enter</kbd></td><td>리모컨 가운데(확인) — 클릭, 검색창이면 입력 시작</td></tr>
<tr><td><kbd>Backspace</kbd></td><td>리모컨 뒤로 — 이전 페이지 (입력 중에는 글자 지우기, <kbd>Esc</kbd>로 입력 끝내기)</td></tr>
</table>
<h2>여기서 바로 연습</h2>
<p>이 페이지는 테스트가 자동으로 켜져 있습니다. <kbd>↓</kbd>를 눌러 시작해 보세요.</p>
<div class="demo">
<header><a href="#home">홈</a><a href="#drama">드라마</a><a href="#ent">예능</a><input placeholder="검색"><button>검색</button></header>
<div class="grid">${[1,2,3,4,5,6,7,8].map(n=>`<a class="card" href="#card${n}">카드 ${n}</a>`).join('')}</div>
<div class="long">링크가 없는 긴 본문 — 위아래 방향키로 반 화면씩 스크롤됩니다.</div>
<p><a href="#end">맨 아래 링크</a></p>
</div>
</main>
<script>${code}</script>
</body></html>`;
writeFileSync(new URL('pc-tester.html', here), html);
console.log('pc-tester.html', html.length, 'bytes · bookmarklet', bookmarklet.length, 'chars');
