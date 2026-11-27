/* PC 테스트용: TV 앱의 리모컨 이동(tvnav.js)을 PC 크롬 키보드로 써 본다.
 * 방향키 = 상하좌우, 엔터 = 확인, 백스페이스 = 뒤로. 다시 누르면 꺼진다.
 * build-bookmarklet.mjs 가 이 파일 + tvnav.js 를 북마크 버튼으로 묶는다. */
(function () {
  if (window.__tvnavPc) {
    // 이미 켜져 있으면 끈다.
    window.removeEventListener('keydown', window.__tvnavPc, true);
    window.__tvnavPc = null;
    if (window.__tvnav) window.__tvnav.off();
    toast('리모컨 테스트 끔');
    return;
  }
  /*__TVNAV__*/

  function editing() {
    var el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    if (el.tagName === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(t) >= 0;
    }
    return false;
  }

  function toast(text) {
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483647;' +
      'background:#16171d;color:#fff;font:600 15px sans-serif;padding:12px 18px;border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.4);pointer-events:none';
    document.documentElement.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  var names = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  window.__tvnavPc = function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var typing = editing();
    var name = names[e.key];
    // 앱과 같은 규칙: 입력 중에는 좌우·엔터·백스페이스를 입력칸이 쓴다.
    if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter' || e.key === 'Backspace')) return;
    if (typing && e.key === 'Escape') { e.preventDefault(); window.__tvnav.back(); return; }
    if (name) {
      e.preventDefault(); e.stopPropagation();
      var r = window.__tvnav.key(name);
      if (r === 'edge' && name === 'up') toast('맨 위 — 앱에서는 여기서 버튼 줄(주소창·메뉴)로 올라가요');
      else if (r.indexOf('iframe:') === 0) toast('플레이어 — 앱에서는 여기서 커서 모드로 바뀌어요');
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      var res = window.__tvnav.key('enter');
      if (res.indexOf('iframe:') === 0) toast('플레이어 — 앱에서는 여기서 커서 모드로 바뀌어요');
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      history.back();
    }
  };
  window.addEventListener('keydown', window.__tvnavPc, true);
  window.__tvnav.on();
  toast('리모컨 테스트 켬 · 방향키 이동 · 엔터 확인 · 백스페이스 뒤로');
})();
