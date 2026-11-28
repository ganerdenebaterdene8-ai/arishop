// АриШоп — 360° 3D харагдац.
// Firestore `prices`-ийн model3d талбартай (scripts/make-3d.mjs үүсгэсэн) бараанд "360°" товч гаргаж,
// дарахад барааг бүх талаас нь эргүүлж харах, утасны камераар өрөөндөө тавьж үзэх (AR) цонх нээнэ.
// Сайтын үндсэн кодыг өөрчлөхгүй: барааны зургийг (background-image) ажиглаж товчийг дээр нь нэмнэ.
(function () {
  if (window.__ari360) return;
  window.__ari360 = true;

  var FS = 'https://firestore.googleapis.com/v1/projects/arishop-2671a/databases/(default)/documents/prices';
  var KEY = 'AIzaSyAPTCK_YseknlGHshSQc-DAxKnw74KoLLs'; // сайтын нийтийн Firebase web түлхүүр (index.html-д байгаатай ижил)
  var MV = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js';
  var byImage = {}, byName = {};

  // ---------- өгөгдөл ----------
  function load(token) {
    var url = FS + '?pageSize=300&mask.fieldPaths=name&mask.fieldPaths=image&mask.fieldPaths=model3d&mask.fieldPaths=model3dImage&key=' + KEY + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    return fetch(url).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
      (d.documents || []).forEach(function (doc) {
        var f = doc.fields || {};
        var s = function (k) { return f[k] && f[k].stringValue || ''; };
        var glb = s('model3d');
        if (!glb) return;
        // Үнэ шинэчлэлт өөр зарын зураг сонгосон бол хуучин загварыг харуулахгүй (шинэ загвар үүстэл)
        if (s('model3dImage') && s('image') && s('model3dImage') !== s('image')) return;
        var name = s('name') || decodeURIComponent(doc.name.split('/').pop());
        var item = { name: name, glb: glb, poster: s('image') };
        byName[name] = item;
        if (s('image')) byImage[norm(s('image'))] = item;
        if (s('model3dImage')) byImage[norm(s('model3dImage'))] = item;
      });
      if (d.nextPageToken) return load(d.nextPageToken);
    });
  }
  function norm(u) { return String(u || '').replace(/^https?:/, '').replace(/[?#].*$/, ''); }
  function bgUrl(el) {
    var m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage || '');
    return m ? m[1] : '';
  }

  // ---------- товч ----------
  var css = document.createElement('style');
  css.textContent = [
    '.ari360-chip{position:absolute;left:10px;bottom:10px;z-index:3;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px 0 10px;border:0;border-radius:999px;',
    'background:rgba(20,16,28,.82);color:#fff;font:700 13px/1 system-ui,-apple-system,sans-serif;cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 6px 16px -6px rgba(0,0,0,.5)}',
    '.ari360-chip svg{width:18px;height:18px;animation:ari360spin 3.5s linear infinite}',
    '.ari360-chip.big{height:44px;font-size:15px;left:14px;bottom:14px;padding:0 16px 0 12px}',
    '.ari360-chip:focus-visible{outline:3px solid #fff;outline-offset:2px}',
    '@keyframes ari360spin{to{transform:rotate(360deg)}}',
    '.ari360-ov{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:radial-gradient(ellipse 80% 60% at 50% 40%,#3b3550,#121019 72%);color:#fff;font:15px/1.5 system-ui,-apple-system,sans-serif;',
    'padding:max(12px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom))}',
    '.ari360-top{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.ari360-top b{font-size:17px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '.ari360-x{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:22px;cursor:pointer}',
    '.ari360-ov model-viewer{flex:1;width:100%;min-height:0;--poster-color:transparent;--progress-bar-color:#ff2d7a;background:transparent}',
    '.ari360-hint{text-align:center;opacity:.75;font-size:13px;margin:4px 0 10px}',
    '.ari360-bar{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
    '.ari360-btn{height:46px;padding:0 18px;border-radius:999px;border:2px solid rgba(255,255,255,.6);background:transparent;color:#fff;font:700 15px system-ui,-apple-system,sans-serif;cursor:pointer}',
    '.ari360-btn.ar{background:#ff2d7a;border-color:#ff2d7a}',
    '.ari360-err{flex:1;display:grid;place-items:center;text-align:center;opacity:.85;padding:20px}'
  ].join('');
  document.head.appendChild(css);

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M12 7l4 2.3v4.6L12 16l-4-2.1V9.3z"/></svg>';

  function decorate() {
    var boxes = document.querySelectorAll('.washed');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var imgDiv = null, kids = box.children;
      for (var k = 0; k < kids.length; k++) if (kids[k].style && kids[k].style.backgroundImage) { imgDiv = kids[k]; break; }
      var item = imgDiv && byImage[norm(bgUrl(imgDiv))];
      if (!item) {
        var card = box.closest('.card');
        var t = card && card.querySelector('.card-title');
        if (t) item = byName[t.textContent.trim()];
      }
      var chip = box.querySelector(':scope > .ari360-chip');
      if (!item) { if (chip) chip.remove(); continue; }
      if (chip && chip.__glb === item.glb) continue;
      if (chip) chip.remove();
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ari360-chip' + (box.closest('.card') ? '' : ' big');
      chip.innerHTML = ICON + '<span>360\u00b0</span>';
      chip.setAttribute('aria-label', item.name + ' \u2014 360\u00b0 3D-\u044d\u044d\u0440 \u0445\u0430\u0440\u0430\u0445');
      chip.__glb = item.glb;
      chip.__item = item;
      chip.addEventListener('click', onChip, true);
      ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { chip.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
      box.appendChild(chip);
    }
  }
  function onChip(e) { e.preventDefault(); e.stopPropagation(); open(this.__item); }

  // ---------- цонх ----------
  var mvReady = null;
  function loadMV() {
    if (customElements.get('model-viewer')) return Promise.resolve();
    if (mvReady) return mvReady;
    mvReady = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.type = 'module'; s.src = MV;
      s.onload = function () { customElements.whenDefined('model-viewer').then(res); };
      s.onerror = function () { mvReady = null; rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return mvReady;
  }

  var ov = null, lastFocus = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function open(item) {
    if (ov) close(true);
    lastFocus = document.activeElement;
    ov = document.createElement('div');
    ov.className = 'ari360-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', item.name + ' 360\u00b0');
    ov.innerHTML = '<div class="ari360-top"><b>' + esc(item.name) + '</b><button class="ari360-x" aria-label="\u0425\u0430\u0430\u0445">\u2715</button></div>' +
      '<div class="ari360-err" data-wait>\u0410\u0447\u0430\u0430\u043b\u0436 \u0431\u0430\u0439\u043d\u0430\u2026</div>' +
      '<p class="ari360-hint">\u0425\u0443\u0440\u0443\u0443\u0433\u0430\u0430\u0440\u0430\u0430 \u0447\u0438\u0440\u0436 \u044d\u0440\u0433\u04af\u04af\u043b \u00b7 \u0445\u043e\u0451\u0440 \u0445\u0443\u0440\u0443\u0443\u0433\u0430\u0430\u0440 \u0442\u043e\u043c\u0440\u0443\u0443\u043b</p>' +
      '<div class="ari360-bar"><button class="ari360-btn" data-spin>\u0417\u043e\u0433\u0441\u043e\u043e\u0445</button><button class="ari360-btn ar" data-ar hidden>\u04e8\u0440\u04e9\u04e9\u043d\u0434\u04e9\u04e9 \u0442\u0430\u0432\u044c\u0436 \u04af\u0437\u044d\u0445</button></div>';
    document.body.appendChild(ov);
    document.documentElement.style.overflow = 'hidden';
    ov.querySelector('.ari360-x').addEventListener('click', function () { close(); });
    ov.querySelector('.ari360-x').focus();
    try { history.pushState({ ari360: 1 }, ''); } catch (e) {}

    loadMV().then(function () {
      if (!ov) return;
      var mv = document.createElement('model-viewer');
      mv.setAttribute('src', item.glb);
      if (item.poster) mv.setAttribute('poster', item.poster);
      mv.setAttribute('alt', item.name + ' \u2014 3D \u0437\u0430\u0433\u0432\u0430\u0440');
      ['camera-controls', 'auto-rotate', 'ar'].forEach(function (a) { mv.setAttribute(a, ''); });
      mv.setAttribute('auto-rotate-delay', '0');
      mv.setAttribute('rotation-per-second', '24deg');
      mv.setAttribute('interaction-prompt', 'none');
      mv.setAttribute('shadow-intensity', '1');
      mv.setAttribute('shadow-softness', '0.8');
      mv.setAttribute('exposure', '1.05');
      mv.setAttribute('environment-image', 'neutral');
      mv.setAttribute('camera-orbit', '30deg 75deg auto');
      mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
      mv.setAttribute('touch-action', 'none');
      var arBtn = ov.querySelector('[data-ar]');
      var spin = ov.querySelector('[data-spin]');
      mv.addEventListener('load', function () { if (mv.canActivateAR) arBtn.hidden = false; });
      mv.addEventListener('error', function () {
        var w = document.createElement('div'); w.className = 'ari360-err'; w.textContent = '3D \u0437\u0430\u0433\u0432\u0430\u0440 \u0430\u0447\u0430\u0430\u043b\u0436 \u0447\u0430\u0434\u0441\u0430\u043d\u0433\u04af\u0439. \u0414\u0430\u0440\u0430\u0430 \u0434\u0430\u0445\u0438\u043d \u043e\u0440\u043e\u043b\u0434\u043e\u043d\u043e \u0443\u0443.';
        mv.replaceWith(w);
      });
      arBtn.addEventListener('click', function () { try { mv.activateAR(); } catch (e) {} });
      spin.addEventListener('click', function () {
        if (mv.hasAttribute('auto-rotate')) { mv.removeAttribute('auto-rotate'); spin.textContent = '\u042d\u0440\u0433\u04af\u04af\u043b\u044d\u0445'; }
        else { mv.setAttribute('auto-rotate', ''); spin.textContent = '\u0417\u043e\u0433\u0441\u043e\u043e\u0445'; }
      });
      ov.querySelector('[data-wait]').replaceWith(mv);
    }).catch(function () {
      var w = ov && ov.querySelector('[data-wait]');
      if (w) w.textContent = '3D \u0445\u0430\u0440\u0430\u0433\u0434\u0430\u0446 \u0430\u0447\u0430\u0430\u043b\u0436 \u0447\u0430\u0434\u0441\u0430\u043d\u0433\u04af\u0439. \u0418\u043d\u0442\u0435\u0440\u043d\u044d\u0442\u044d\u044d \u0448\u0430\u043b\u0433\u0430\u0430\u0434 \u0434\u0430\u0445\u0438\u043d \u043e\u0440\u043e\u043b\u0434\u043e\u043d\u043e \u0443\u0443.';
    });
  }
  function close(silent) {
    if (!ov) return;
    ov.remove(); ov = null;
    document.documentElement.style.overflow = '';
    if (!silent && history.state && history.state.ari360) { try { history.back(); } catch (e) {} }
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  window.addEventListener('popstate', function () { if (ov) close(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov) close(); });

  // ---------- эхлүүлэх ----------
  var queued = false;
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; decorate(); }); }
  function start() {
    load().then(schedule).catch(function () {});
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    setInterval(function () { load().then(schedule).catch(function () {}); }, 10 * 60 * 1000);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
