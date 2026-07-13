// web/subscription/enhance.js
// Layered on top of app.js + wire.js. Adds, without touching the mockup markup
// or its transition (event delegation + idempotent DOM patches, re-applied on
// the framework's re-renders):
//   * a per-shop "Number of shops" control on the Business card (minimum 3,
//     starts at 4, price = shops x SHOPS_PRICE_PER). Stays correct even as the
//     PLANS overlay in wire.js re-renders the card (a deferred re-assert wins).
//   * a Download nav item + a Windows / Android download modal, with links the
//     sentinel manages (DOWNLOAD_WINDOWS_URL / DOWNLOAD_ANDROID_URL / RELEASES_URL).
//   * the nav "Sign in" link reflects the signed-in Google account (?email= from
//     the app), plus an optional real "Sign in with Google" (Google Identity
//     Services), both gated on GOOGLE_CLIENT_ID. Sets window.rpos.pageEmail,
//     which wire.js prefills into the pay modal.
//   * a favicon fallback.
// Everything is guarded; a failure just leaves the page as-is. No em-dash in
// user-facing copy (project rule).
(function () {
  var C = window.RPOS_CONFIG || (window.RPOS_CONFIG = {});
  var R = window.rpos || (window.rpos = {});

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function shopsMin() { return Math.max(1, Math.floor(num(C.SHOPS_MIN, 3))); }
  function shopsPer() { var v = num(C.SHOPS_PRICE_PER, 1250); return v > 0 ? v : 1250; }
  function shopsDefault() { return Math.max(shopsMin(), Math.floor(num(C.SHOPS_DEFAULT, 4))); }
  function inrNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function bizPrice() { return R.businessShops * shopsPer(); }
  function safeUrl(u) { u = String(u || ''); return /^https?:\/\//i.test(u) ? u : '#'; }

  // Shared state read by wire.js (rpos is the same object across files).
  if (R.businessShops == null) R.businessShops = shopsDefault();
  if (R.pageEmail == null) { try { R.pageEmail = (R.qs ? R.qs().email : '') || ''; } catch (e) { R.pageEmail = ''; } }

  // -------------------------------------------------------------------------
  // Business "Number of shops" control
  // -------------------------------------------------------------------------
  function bizName() {
    try {
      if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) {
        if ((C.PLANS[i].code || '') === 'business') return C.PLANS[i].name || 'Business';
      }
    } catch (e) {}
    return 'Business';
  }
  function isBizName(el) {
    if (!el) return false;
    var nm = (el.textContent || '').trim();
    return nm === bizName() || nm === 'Business';
  }
  // The Business card content wrap = the parent of its "Buy now" button. We scan
  // buttons (not all divs) and skip compare-table cells. Robust to plan renames.
  function bizWrap() {
    var btns = document.querySelectorAll('button'), i;
    for (i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.getAttribute && b.getAttribute('data-rp') != null) continue;   // our own controls
      if ((b.textContent || '').trim().toLowerCase() !== 'buy now') continue;
      if (b.closest && b.closest('td, th, sc-raw-td')) continue;           // compare table
      var wrap = b.parentElement;
      if (wrap && isBizName(wrap.children[0])) return wrap;
    }
    return null;
  }

  // Steppers are <span role=button>, NOT <button>: the PLANS overlay locates the
  // CTA via wrap.querySelector('button'), so a real button here would hijack it.
  function stepBtn(label, onTap) {
    var s = document.createElement('span');
    s.setAttribute('role', 'button');
    s.setAttribute('tabindex', '0');
    s.setAttribute('data-rp', 'step');
    s.textContent = label;
    s.style.cssText = 'width:44px;flex:none;text-align:center;background:#f3ead1;color:#3a2a00;font-size:20px;font-weight:800;line-height:1;padding:11px 0;cursor:pointer;user-select:none';
    s.addEventListener('click', function (e) { e.preventDefault(); onTap(); });
    s.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } });
    return s;
  }

  function buildShopsField() {
    var box = document.createElement('div');
    box.setAttribute('data-rp', 'shops');
    box.setAttribute('data-rp-shops', '1');
    box.style.cssText = 'margin:0 0 16px;text-align:left';

    var lab = document.createElement('div');
    lab.textContent = 'Number of shops';
    lab.style.cssText = 'font-size:12px;font-weight:700;color:#8a8a90;letter-spacing:.05em;text-transform:uppercase;margin-bottom:7px';
    box.appendChild(lab);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;border:1px solid #e7dcc0;border-radius:11px;overflow:hidden;background:#fffdf7';

    var inp = document.createElement('input');
    inp.type = 'number'; inp.min = String(shopsMin()); inp.step = '1';
    inp.setAttribute('inputmode', 'numeric');
    inp.setAttribute('aria-label', 'Number of shops');
    inp.value = String(R.businessShops);
    inp.style.cssText = 'flex:1;min-width:0;border:0;text-align:center;font-size:17px;font-weight:800;color:#19191c;padding:10px;outline:none;background:transparent';

    var hint = document.createElement('div');
    hint.textContent = 'Minimum ' + shopsMin() + ' shops. Rs ' + inrNum(shopsPer()) + ' per shop / year.';
    hint.style.cssText = 'font-size:11.5px;color:#8a8a90;margin-top:7px';

    // Recompute on every keystroke ("listen to keyboard actions").
    function applyVal(v, snap) {
      var eff, bad = false;
      if (isNaN(v)) { eff = R.businessShops; bad = true; }
      else if (v < shopsMin()) { eff = shopsMin(); bad = true; }
      else { eff = v; }
      R.businessShops = eff;
      hint.style.color = bad ? '#c0392b' : '#8a8a90';
      if (snap) inp.value = String(eff);
      assertBizPrice();
    }
    inp.addEventListener('input', function () { applyVal(parseInt((inp.value || '').replace(/[^\d]/g, ''), 10), false); });
    inp.addEventListener('blur', function () { applyVal(parseInt((inp.value || '').replace(/[^\d]/g, ''), 10), true); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });

    row.appendChild(stepBtn('−', function () { applyVal(R.businessShops - 1, true); }));
    row.appendChild(inp);
    row.appendChild(stepBtn('+', function () { applyVal(R.businessShops + 1, true); }));
    box.appendChild(row);
    box.appendChild(hint);
    return box;
  }

  function assertBizPrice(wrap) {
    wrap = wrap || bizWrap(); if (!wrap) return;
    var prow = wrap.children[2];               // [name, shops-line, price-row, ...]
    if (prow && prow.children && prow.children.length >= 2) {
      var target = prow.children[1];           // [currency, amount, per]
      var want = inrNum(bizPrice());
      if (target && target.textContent !== want) target.textContent = want;
    }
  }

  function ensureShops() {
    var wrap = bizWrap(); if (!wrap) return;
    var btn = wrap.querySelector('button'); if (!btn) return;
    if (!wrap.querySelector('[data-rp-shops]')) wrap.insertBefore(buildShopsField(), btn);
    assertBizPrice(wrap);
  }

  // -------------------------------------------------------------------------
  // Download nav item + Windows / Android modal
  // -------------------------------------------------------------------------
  function navEl() { return document.querySelector('header nav') || document.querySelector('nav.nav') || document.querySelector('nav'); }

  function mountDownload() {
    var nav = navEl(); if (!nav) return;
    if (nav.querySelector('[data-rp-download]')) return;   // re-render clones the nav -> re-add
    var a = document.createElement('a');
    a.setAttribute('data-rp-download', '1');
    a.href = '#download';
    a.textContent = 'Download';
    a.style.cssText = 'display:inline-block;background:linear-gradient(110deg,#e0a412,#f5c542 40%,#e0a412);color:#3a2a00;font-weight:800;padding:8px 16px;border-radius:999px;text-decoration:none;font-size:13px;box-shadow:0 4px 12px rgba(224,164,18,.35)';
    nav.appendChild(a);
  }

  var dlModal = null;
  function osIcon(kind) {
    if (kind === 'win') {
      return '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0a84d8" d="M3 5.4 10.5 4.3v7.2H3zM10.5 12.5v7.2L3 18.6v-6.1zM11.6 4.15 21 2.8v8.7h-9.4zM21 12.5v8.7l-9.4-1.35V12.5z"/></svg>';
    }
    return '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path fill="#3ddc84" d="M6 9h12v8a1.5 1.5 0 0 1-1.5 1.5H15V21a1 1 0 1 1-2 0v-2.5h-2V21a1 1 0 1 1-2 0v-2.5H7.5A1.5 1.5 0 0 1 6 17zm-2.5.2A1 1 0 0 1 4.5 10v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-.8zm17 0A1 1 0 0 1 21.5 10v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-.8zM8.2 4.3l-.9-1.5a.4.4 0 0 1 .7-.4l1 1.7A6 6 0 0 1 12 3.5a6 6 0 0 1 3 .6l1-1.7a.4.4 0 1 1 .7.4l-.9 1.5A5.4 5.4 0 0 1 18 8H6a5.4 5.4 0 0 1 2.2-3.7M9.5 6.2a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4m5 0a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4"/></svg>';
  }
  function panelHTML(kind, title, sub) {
    var g = 'linear-gradient(110deg,#e0a412,#f5c542 40%,#e0a412)';
    return '<div style="flex:1;min-width:220px;border:1px solid #ececef;border-radius:14px;padding:20px;text-align:center;background:#fff">' +
      '<div style="height:36px;display:flex;align-items:center;justify-content:center;margin-bottom:8px">' + osIcon(kind) + '</div>' +
      '<div style="font-size:16px;font-weight:800;color:#19191c">' + title + '</div>' +
      '<div style="font-size:12.5px;color:#8a8a90;margin:4px 0 16px">' + sub + '</div>' +
      '<a data-' + kind + ' href="#" style="display:inline-block;width:100%;box-sizing:border-box;background:' + g + ';color:#3a2a00;font-weight:800;padding:12px;border-radius:11px;text-decoration:none;font-size:14px">Download</a>' +
      '</div>';
  }
  function buildDownload() {
    dlModal = document.createElement('div');
    dlModal.id = 'rpos-dl';
    dlModal.setAttribute('style', 'position:fixed;inset:0;background:rgba(15,15,20,.55);display:none;align-items:center;justify-content:center;z-index:2147483000;font-family:system-ui,Segoe UI,Roboto,sans-serif;padding:16px');
    dlModal.innerHTML =
      '<div style="position:relative;background:#fff;max-width:640px;width:100%;max-height:92vh;overflow:auto;border-radius:16px;padding:26px 24px;box-shadow:0 24px 70px rgba(0,0,0,.35)">' +
      '<button data-x style="position:absolute;top:8px;right:12px;border:0;background:none;font-size:24px;line-height:1;color:#8a8a90;cursor:pointer">&times;</button>' +
      '<h3 style="margin:0 0 4px;font-size:20px;color:#19191c;text-align:center">Download RasidhuPOS</h3>' +
      '<div style="text-align:center;color:#8a8a90;font-size:13px;margin-bottom:18px">Choose your device</div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      panelHTML('win', 'Windows', 'Windows 10 / 11, 64-bit installer (.exe)') +
      panelHTML('android', 'Android', 'Android 5.0 and up (.apk)') +
      '</div>' +
      '<div style="text-align:center;margin-top:16px"><a data-all href="#" target="_blank" rel="noopener" style="color:#a97400;font-weight:700;font-size:13px;text-decoration:none">All versions and release notes</a></div>' +
      '</div>';
    document.body.appendChild(dlModal);
    dlModal.addEventListener('click', function (e) { if (e.target === dlModal) dlModal.style.display = 'none'; });
    dlModal.querySelector('[data-x]').onclick = function () { dlModal.style.display = 'none'; };
  }
  function showDownload() {
    if (!dlModal) buildDownload();
    var win = dlModal.querySelector('[data-win]'); if (win) { win.href = safeUrl(C.DOWNLOAD_WINDOWS_URL); win.setAttribute('target', '_blank'); win.setAttribute('rel', 'noopener'); }
    var and = dlModal.querySelector('[data-android]'); if (and) { and.href = safeUrl(C.DOWNLOAD_ANDROID_URL); and.setAttribute('target', '_blank'); and.setAttribute('rel', 'noopener'); }
    var all = dlModal.querySelector('[data-all]'); if (all) all.href = safeUrl(C.RELEASES_URL || C.DOWNLOAD_WINDOWS_URL);
    dlModal.style.display = 'flex';
  }

  // -------------------------------------------------------------------------
  // Google sign-in (optional) + nav reflect
  // -------------------------------------------------------------------------
  function loadGis(cb) {
    if (!C.GOOGLE_CLIENT_ID) return;
    if (window.google && google.accounts && google.accounts.id) { cb(); return; }
    if (loadGis._cbs) { loadGis._cbs.push(cb); return; }
    loadGis._cbs = [cb];
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = function () { var cbs = loadGis._cbs || []; loadGis._cbs = null; for (var i = 0; i < cbs.length; i++) { try { cbs[i](); } catch (e) {} } };
    s.onerror = function () { loadGis._cbs = null; };
    (document.head || document.documentElement).appendChild(s);
  }
  function jwtEmail(t) {
    try {
      var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      var o = JSON.parse(decodeURIComponent(escape(atob(p))));
      return o.email || '';
    } catch (e) { return ''; }
  }
  function onSignedIn(em) {
    if (!em) return;
    R.pageEmail = em;
    try { reflectSignin(); } catch (e) {}
    try {
      var mf = document.querySelector('#rpos-pay [data-email]');
      if (mf) { mf.value = em; var sb = document.querySelector('#rpos-pay [data-signin]'); if (sb) sb.style.display = 'none'; }
    } catch (e) {}
  }
  var gisReady = false;
  function ensureGis(cb) {
    loadGis(function () {
      if (!gisReady) {
        try { google.accounts.id.initialize({ client_id: C.GOOGLE_CLIENT_ID, callback: function (r) { onSignedIn(jwtEmail(r && r.credential || '')); } }); gisReady = true; } catch (e) {}
      }
      if (cb) cb();
    });
  }
  // Used by the wire.js pay modal to render an in-form sign-in button.
  R.mountGoogleSignin = function (container) {
    if (!C.GOOGLE_CLIENT_ID || !container) return;
    ensureGis(function () { try { google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' }); } catch (e) {} });
  };
  function doSignin() { if (!C.GOOGLE_CLIENT_ID) return; ensureGis(function () { try { google.accounts.id.prompt(); } catch (e) {} }); }

  function reflectSignin() {
    var nav = navEl(); if (!nav) return;
    var links = nav.querySelectorAll('a'), link = null, i;
    for (i = 0; i < links.length; i++) {
      var t = (links[i].textContent || '').trim().toLowerCase();
      if (t === 'sign in' || links[i].getAttribute('data-rp-signin') != null || links[i].getAttribute('data-rp-signed') != null) { link = links[i]; break; }
    }
    if (!link) return;
    var email = R.pageEmail || '';
    if (email) {
      if (link.getAttribute('data-rp-signed') !== email) {
        link.textContent = email.length > 24 ? email.slice(0, 21) + '...' : email;
        link.title = 'Signed in as ' + email;
        link.style.color = '#a97400';
        link.style.fontWeight = '700';
        link.setAttribute('href', '#');
        link.removeAttribute('data-rp-signin');
        link.setAttribute('data-rp-signed', email);
      }
    } else if (C.GOOGLE_CLIENT_ID && link.getAttribute('data-rp-signin') == null) {
      link.setAttribute('data-rp-signin', '1');
    }
  }

  // -------------------------------------------------------------------------
  // Favicon fallback (index.html already ships one; this covers edge cases).
  // -------------------------------------------------------------------------
  function ensureFavicon() {
    try {
      if (document.querySelector('link[rel~="icon"]')) return;
      var l = document.createElement('link');
      l.rel = 'icon'; l.type = 'image/png'; l.href = 'trident.png';
      (document.head || document.documentElement).appendChild(l);
    } catch (e) {}
  }

  // ---- click delegation (bubble phase; wire.js handles buy/contact in capture)
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-rp-download]')) { e.preventDefault(); showDownload(); return; }
    if (t.closest('[data-rp-signin]')) { e.preventDefault(); doSignin(); return; }
  });

  // ---- passes: run now, retry through hydration, re-apply on re-render --------
  function pass() {
    try { ensureFavicon(); } catch (e) {}
    try { ensureShops(); } catch (e) {}
    try { mountDownload(); } catch (e) {}
    try { reflectSignin(); } catch (e) {}
  }
  // The Business price is re-asserted on a macrotask so it runs AFTER the PLANS
  // overlay's synchronous observer (which would otherwise show the flat price).
  function deferredAssert() { try { setTimeout(function () { try { assertBizPrice(); } catch (e) {} }, 0); } catch (e) {} }

  pass();
  var tries = 0;
  var iv = setInterval(function () { pass(); assertBizPrice(); if (++tries > 90) clearInterval(iv); }, 130);   // ~12s of retries
  try {
    new MutationObserver(function () { pass(); deferredAssert(); })
      .observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
