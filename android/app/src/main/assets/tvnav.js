/* 집TV 브라우저: 일반 웹페이지를 TV 리모컨(상하좌우·확인·뒤로)으로 탐색하게 한다.
 * 화살표로 가장 가까운 링크/버튼으로 이동하고 테두리로 표시, 확인으로 클릭한다.
 * 갈 곳이 멀거나 없으면 화면을 스크롤한다. 앱(네이티브)이 window.__tvnav.key()를 호출한다. */
(function () {
  if (window.__tvnav) { window.__tvnav.on(); return; }

  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,' +
    '[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=switch],' +
    '[onclick],[tabindex]:not([tabindex="-1"]),video,iframe,[contenteditable=""],[contenteditable=true]';
  var native = window.HomeTVNative;
  var enabled = true;
  var cur = null;
  var box = document.createElement('div');
  box.setAttribute('data-tvnav', '');
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border-radius:8px;' +
    'box-shadow:0 0 0 4px #e45a3c,0 0 0 7px rgba(255,255,255,.9),0 6px 24px rgba(0,0,0,.5);display:none';

  function attach() { if (!box.isConnected && document.documentElement) document.documentElement.appendChild(box); }

  function editable(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    if (el.tagName === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(t) >= 0;
    }
    return false;
  }

  function visible(el) {
    if (el.disabled || el === box) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    if (el.tagName === 'IFRAME' && (r.width < 150 || r.height < 90)) return false;
    var s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
    return true;
  }

  function candidates() {
    var out = [], all = document.querySelectorAll(SEL);
    for (var i = 0; i < all.length; i++) if (visible(all[i])) out.push(all[i]);
    // 크기가 거의 같은 부모/자식이 함께 잡히면 바깥 것만 남긴다.
    return out.filter(function (el) {
      var p = el.parentElement;
      while (p) {
        if (out.indexOf(p) >= 0) {
          var a = p.getBoundingClientRect(), b = el.getBoundingClientRect();
          if (Math.abs(a.width - b.width) < 12 && Math.abs(a.height - b.height) < 12) return false;
          break;
        }
        p = p.parentElement;
      }
      return true;
    });
  }

  function inView(r) { return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }

  function draw() {
    if (!enabled || !cur || !cur.isConnected) { box.style.display = 'none'; return; }
    var r = cur.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = (r.left - 3) + 'px';
    box.style.top = (r.top - 3) + 'px';
    box.style.width = (r.width + 6) + 'px';
    box.style.height = (r.height + 6) + 'px';
  }

  function select(el) {
    cur = el;
    attach();
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
    var r = el.getBoundingClientRect(), margin = Math.min(120, innerHeight * 0.15);
    if (r.top < margin) window.scrollBy(0, r.top - margin);
    else if (r.bottom > innerHeight - margin) window.scrollBy(0, r.bottom - innerHeight + margin);
    draw();
  }

  /** 화면 안에서 진행 방향 쪽 첫 요소를 고른다(처음 누를 때나 스크롤 뒤). */
  function startFrom(dir) {
    var best = null, bestScore = 1e12;
    candidates().forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!inView(r)) return;
      var s = dir === 'up' ? (innerHeight - r.bottom) + r.left * 0.2 : r.top + r.left * 0.2;
      if (s < bestScore) { bestScore = s; best = el; }
    });
    return best;
  }

  function move(dir) {
    attach();
    if (!cur || !cur.isConnected || !visible(cur) || !inView(cur.getBoundingClientRect())) {
      var start = startFrom(dir);
      if (start) { select(start); return 'ok'; }
    }
    var horiz = dir === 'left' || dir === 'right', forward = dir === 'right' || dir === 'down';
    var a = cur ? cur.getBoundingClientRect()
      : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0, height: 0 };
    var ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
    var best = null, bestScore = 1e12, bestGap = 0;
    candidates().forEach(function (el) {
      if (el === cur || (cur && (cur.contains(el) || el.contains(cur)))) return;
      var r = el.getBoundingClientRect();
      var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      var ahead = horiz ? (cx - ax) * (forward ? 1 : -1) : (cy - ay) * (forward ? 1 : -1);
      if (ahead <= 2) return;
      var gap = dir === 'down' ? r.top - a.bottom : dir === 'up' ? a.top - r.bottom
        : dir === 'right' ? r.left - a.right : a.left - r.right;
      var overlap = horiz ? Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top)
        : Math.min(a.right, r.right) - Math.max(a.left, r.left);
      var cross = horiz ? Math.abs(cy - ay) : Math.abs(cx - ax);
      var score = Math.max(gap, 0) + (overlap > 0 ? cross * 0.15 : cross * 2 + 250);
      if (score < bestScore) { bestScore = score; best = el; bestGap = Math.max(gap, 0); }
    });

    if (horiz) {
      if (best) { select(best); return 'ok'; }
      return 'edge';
    }
    // 위아래: 가까운 요소가 있으면 이동, 멀면(긴 글 등) 한 화면씩 스크롤.
    if (best && bestGap < innerHeight * 0.75) { select(best); return 'ok'; }
    var before = window.scrollY;
    window.scrollBy(0, (forward ? 1 : -1) * innerHeight * 0.6);
    if (window.scrollY !== before) {
      if (cur && !inView(cur.getBoundingClientRect())) { cur = null; }
      setTimeout(draw, 50);
      return 'ok';
    }
    if (best) { select(best); return 'ok'; }
    return 'edge';
  }

  function activate() {
    if (!cur || !cur.isConnected) {
      var s = startFrom('down');
      if (s) select(s);
      return 'ok';
    }
    var el = cur;
    if (el.tagName === 'IFRAME') {
      // 다른 사이트의 플레이어(iframe) 안쪽은 페이지 스크립트로 조작할 수 없어 커서로 넘긴다.
      var r = el.getBoundingClientRect();
      return 'iframe:' + ((r.left + r.width / 2) / innerWidth) + ',' + ((r.top + r.height / 2) / innerHeight);
    }
    if (el.tagName === 'VIDEO') { if (el.paused) el.play(); else el.pause(); return 'ok'; }
    if (editable(el)) { el.focus(); if (native) native.editing(true); return 'edit'; }
    if (el.tagName === 'SELECT') { el.focus(); try { el.showPicker(); } catch (e) { el.click(); } return 'ok'; }
    el.click();
    return 'ok';
  }

  function key(name) {
    if (!enabled) return 'off';
    if (name === 'enter') return activate();
    var ae = document.activeElement;
    if (editable(ae)) { ae.blur(); if (native) native.editing(false); }
    return move(name);
  }

  /** 뒤로: 입력 중이면 입력만 끝낸다. */
  function back() {
    var ae = document.activeElement;
    if (editable(ae)) { ae.blur(); if (native) native.editing(false); return 'handled'; }
    return 'pass';
  }

  document.addEventListener('focusin', function (e) { if (native && editable(e.target)) native.editing(true); }, true);
  document.addEventListener('focusout', function (e) { if (native && editable(e.target)) native.editing(false); }, true);
  window.addEventListener('scroll', draw, true);
  window.addEventListener('resize', draw);
  setInterval(draw, 400);

  window.__tvnav = {
    key: key,
    back: back,
    current: function () { return cur; },
    on: function () { enabled = true; draw(); },
    off: function () { enabled = false; draw(); }
  };
})();
