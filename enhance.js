// web/subscription/enhance.js
// Layered on top of app.js + wire.js. Adds, without touching the mockup markup
// or its transition (event delegation + idempotent DOM patches, re-applied on
// the framework's re-renders):
//   * a per-shop "Number of shops" control on the Business card (minimum 3,
//     starts at 4, price = shops x SHOPS_PRICE_PER). Stays correct even as the
//     PLANS overlay in wire.js re-renders the card (a deferred re-assert wins).
//   * a Download nav item + a Windows / Android download modal, with links the
//     sentinel manages (DOWNLOAD_WINDOWS_URL / DOWNLOAD_ANDROID_URL / RELEASES_URL).
//   * the nav "Sign in" link reflects the signed-in Google account: it shows the
//     account's display NAME (?name= from the app, or from a Google sign-in),
//     falling back to the Gmail when the name is unknown. Plus an optional real
//     "Sign in with Google" (Google Identity Services), both gated on
//     GOOGLE_CLIENT_ID. Sets window.rpos.pageEmail / window.rpos.pageName; wire.js
//     prefills the (read-only) Gmail into the pay modal.
//   * a favicon fallback.
// Everything is guarded; a failure just leaves the page as-is. No em-dash in
// user-facing copy (project rule).
(function () {
  var C = window.RPOS_CONFIG || (window.RPOS_CONFIG = {});
  var R = window.rpos || (window.rpos = {});

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  // Business shop range is sentinel-driven from PLANS[].caps.max_shops: it
  // starts one above the tier below it (Growth's max) and tops out at
  // Business's own max. Falls back to config.js SHOPS_MIN / a large ceiling
  // when caps are absent (e.g. no published PLANS yet).
  function planCap(code) {
    try {
      if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) {
        var p = C.PLANS[i];
        if ((p.code || '') === code) { var m = p.caps && Number(p.caps.max_shops); return isFinite(m) && m > 0 ? m : 0; }
      }
    } catch (e) {}
    return 0;
  }
  function shopsMin() { var g = planCap('growth'); return Math.max(1, g > 0 ? g + 1 : Math.floor(num(C.SHOPS_MIN, 3))); }
  // Self-serve ceiling: the published Business cap wins, else config SHOPS_MAX
  // (default 10). Above this the buyer is steered to contact sales.
  function shopsMax() { var b = planCap('business'); return b > 0 ? b : Math.max(shopsMin(), Math.floor(num(C.SHOPS_MAX, 10))); }
  function shopsPer() { var v = num(C.SHOPS_PRICE_PER, 1250); return v > 0 ? v : 1250; }
  function shopsDefault() { return Math.min(shopsMax(), Math.max(shopsMin(), Math.floor(num(C.SHOPS_DEFAULT, 4)))); }
  function shopsHintText() { return 'Minimum ' + shopsMin() + ' shops. Rs ' + inrNum(shopsPer()) + ' per shop / year.'; }
  // Shown in place of the hint when the buyer asks for more shops than we sell
  // self-serve; steers them to the Enterprise tier and pairs with the
  // Enterprise-card hover flourish below.
  function overLimitText() { return 'For more than ' + shopsMax() + ' shops, try the ' + entName() + ' subscription.'; }
  function inrNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function bizPrice() { return R.businessShops * shopsPer(); }
  function safeUrl(u) { u = String(u || ''); return /^https?:\/\//i.test(u) ? u : '#'; }

  // Shared state read by wire.js (rpos is the same object across files).
  if (R.businessShops == null) R.businessShops = shopsDefault();
  // Growth is taken for 1 OR 2 shops; default to a single shop so the card leads
  // with the entry price. The Growth selector below flips this; wire.js reads it.
  if (R.growthShops == null) R.growthShops = 1;
  // Signed-in email: the app's ?email= wins, else a Google sign-in from an
  // earlier step this session (sessionStorage) so a re-render doesn't drop it.
  if (R.pageEmail == null) {
    try {
      R.pageEmail = (R.qs ? R.qs().email : '') || '';
      if (!R.pageEmail) { var _se = sessionStorage.getItem('rpos_email_v1'); if (_se) R.pageEmail = _se; }
    } catch (e) { R.pageEmail = ''; }
  }
  // Signed-in display name: the app passes ?name= alongside ?email=, else a
  // Google sign-in on the page supplies it. Shown in the nav in place of the
  // raw Gmail; falls back to the email when unknown.
  if (R.pageName == null) {
    try {
      R.pageName = (R.qs ? R.qs().name : '') || '';
      if (!R.pageName) { var _sn = sessionStorage.getItem('rpos_name_v1'); if (_sn) R.pageName = _sn; }
    } catch (e) { R.pageName = ''; }
  }

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

  // The shop count uses ONLY the number field's native up/down spinner (no
  // separate +/- buttons). Chromium hides that spinner until hover, so force it
  // always visible + comfortably tall via a one-time stylesheet.
  function ensureStepperStyle() {
    if (document.getElementById('rp-shops-style')) return;
    try {
      var st = document.createElement('style');
      st.id = 'rp-shops-style';
      st.textContent =
        'input[data-rp-shops-input]::-webkit-outer-spin-button,' +
        'input[data-rp-shops-input]::-webkit-inner-spin-button{' +
        '-webkit-appearance:inner-spin-button;opacity:1;cursor:pointer;height:38px;margin-left:4px}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  }

  function buildShopsField() {
    var box = document.createElement('div');
    box.setAttribute('data-rp', 'shops');
    box.setAttribute('data-rp-shops', '1');
    box.style.cssText = 'margin:0 0 16px;text-align:left';

    // Layout: the compact number box on the LEFT, its label + hint stacked to the
    // RIGHT. Keeps the whole control to a single short row so every feature bullet
    // still fits inside the card.
    var flow = document.createElement('div');
    flow.style.cssText = 'display:flex;align-items:center;gap:12px';

    // Number box: wide enough for a 3-digit shop count + the native spinner.
    var row = document.createElement('div');
    row.style.cssText = 'display:inline-flex;width:110px;flex:0 0 auto;align-items:center;border:1px solid #e7dcc0;border-radius:11px;overflow:hidden;background:#fffdf7';

    var inp = document.createElement('input');
    inp.type = 'number'; inp.min = String(shopsMin()); inp.max = String(shopsMax()); inp.step = '1';
    inp.setAttribute('inputmode', 'numeric');
    inp.setAttribute('aria-label', 'Number of shops');
    inp.setAttribute('data-rp-shops-input', '1');
    inp.value = String(R.businessShops);
    inp.style.cssText = 'flex:1;min-width:0;border:0;text-align:center;font-size:16px;font-weight:800;color:#19191c;padding:9px 6px 9px 10px;outline:none;background:transparent';

    var textcol = document.createElement('div');
    textcol.style.cssText = 'flex:1;min-width:0';

    var lab = document.createElement('div');
    lab.textContent = 'Number of shops';
    lab.style.cssText = 'font-size:12px;font-weight:700;color:#8a8a90;letter-spacing:.05em;text-transform:uppercase';

    var hint = document.createElement('div');
    hint.setAttribute('data-rp-shops-hint', '1');
    hint.textContent = shopsHintText();
    hint.style.cssText = 'font-size:11.5px;color:#8a8a90;margin-top:4px;line-height:1.35';

    // Recompute on every keystroke ("listen to keyboard actions").
    function applyVal(v, snap) {
      var eff, bad = false, over = false;
      if (isNaN(v)) { eff = R.businessShops; bad = true; }
      else if (v < shopsMin()) { eff = shopsMin(); bad = true; }
      else if (v > shopsMax()) { eff = shopsMax(); bad = true; over = true; }   // clamp price, steer to sales
      else { eff = v; }
      R.businessShops = eff;
      R.businessOverLimit = over;
      if (over) {
        // Swap the per-shop hint for a red "try Enterprise" line and draw the eye
        // to the Enterprise card by holding its own hover pose (a slight lift).
        hint.textContent = overLimitText();
        hint.style.color = '#c0392b';
        hint.style.fontWeight = '700';
        try { triggerEnterpriseAttention(); } catch (e) {}
      } else {
        hint.textContent = shopsHintText();
        hint.style.color = bad ? '#c0392b' : '#8a8a90';
        hint.style.fontWeight = '';
        try { clearEnterpriseAttention(); } catch (e) {}
      }
      if (snap) inp.value = String(eff);
      assertBizPrice();
    }
    inp.addEventListener('input', function () { applyVal(parseInt((inp.value || '').replace(/[^\d]/g, ''), 10), false); });
    inp.addEventListener('blur', function () { applyVal(parseInt((inp.value || '').replace(/[^\d]/g, ''), 10), true); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });

    row.appendChild(inp);
    textcol.appendChild(lab);
    textcol.appendChild(hint);
    flow.appendChild(row);
    flow.appendChild(textcol);
    box.appendChild(flow);
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

  // -------------------------------------------------------------------------
  // Enterprise-card attention - fired while the Business shop count exceeds what
  // we sell self-serve, to point the buyer at the Enterprise tier beside it.
  // We replay the mockup's OWN card-hover pose (a slight lift), so the card
  // reacts as if the mouse were resting on it, plus a soft glow and a one-shot
  // shimmer sweep. Held while over-limit; eased back when the count drops.
  // -------------------------------------------------------------------------
  function entName() {
    try {
      if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) {
        if ((C.PLANS[i].code || '') === 'enterprise') return C.PLANS[i].name || 'Enterprise';
      }
    } catch (e) {}
    return 'Enterprise';
  }
  // Locate a plan card by the name shown on it. Returns {face, wrap} where face
  // is the .card-face (carries the glow) and wrap is its z-index:1 content div,
  // whose first child holds the tier title we match on.
  function planCardByName(name) {
    var faces = document.querySelectorAll('.card-face'), k;
    for (k = 0; k < faces.length; k++) {
      var face = faces[k], ch = face.children, wrap = null, c;
      for (c = 0; c < ch.length; c++) { if (ch[c].tagName === 'DIV' && ch[c].style && ch[c].style.zIndex === '1') { wrap = ch[c]; break; } }
      if (!wrap || !wrap.children[0]) continue;
      if ((wrap.children[0].textContent || '').trim() === name) return { face: face, wrap: wrap };
    }
    return null;
  }
  function ensureEntAttnStyle() {
    if (document.getElementById('rp-ent-attn-style')) return;
    try {
      var st = document.createElement('style');
      st.id = 'rp-ent-attn-style';
      st.textContent =
        '@keyframes rp-ent-shimmer{0%{transform:translateX(-165%)}100%{transform:translateX(330%)}}' +
        '.rp-ent-glow{box-shadow:0 0 0 2px rgba(224,164,18,.9),0 22px 60px rgba(224,164,18,.5)!important}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  }
  // Resolve the Enterprise card's outer .flip-card (the element the mockup itself
  // transforms on hover) plus its glowing .card-face.
  function entCard() {
    var pc = planCardByName(entName()); if (!pc || !pc.face) return null;
    var outer = pc.face.closest ? pc.face.closest('.flip-card') : null;
    return outer ? { outer: outer, face: pc.face } : null;
  }
  // Hold the mockup's own hover pose on the Enterprise card: a slight lift (its
  // real mouse-hover uses translateY(-6px)) plus a soft gold glow, so it reacts
  // as though the pointer were resting on it. Stays until the count drops back.
  function triggerEnterpriseAttention() {
    var ec = entCard(); if (!ec) return;
    var outer = ec.outer, face = ec.face;
    ensureEntAttnStyle();
    outer.style.transition = 'transform .18s ease-out';
    outer.style.transform = 'translateY(-8px) rotateX(2deg)';
    face.classList.add('rp-ent-glow');
    if (outer.getAttribute('data-rp-attn') === '1') return;   // already lifted -> no re-shimmer
    outer.setAttribute('data-rp-attn', '1');
    // One shimmer sweep as we first cross the limit, clipped to the rounded
    // corners and pointer-transparent so the card's button stays clickable.
    var shine = document.createElement('span');
    shine.setAttribute('data-rp', 'ent-shine');
    shine.setAttribute('aria-hidden', 'true');
    shine.style.cssText = 'position:absolute;inset:0;border-radius:18px;overflow:hidden;pointer-events:none;z-index:4';
    var band = document.createElement('span');
    band.style.cssText = 'position:absolute;top:-25%;left:0;width:45%;height:150%;background:linear-gradient(115deg,transparent,rgba(255,255,255,.85) 48%,rgba(255,244,205,.85) 58%,transparent);transform:translateX(-165%);animation:rp-ent-shimmer 1s ease-in-out';
    shine.appendChild(band);
    try { face.appendChild(shine); } catch (e) {}
    setTimeout(function () { try { if (shine.parentNode) shine.parentNode.removeChild(shine); } catch (e) {} }, 1000);
  }
  // Ease the card back down exactly like the mockup's own mouse-leave reset.
  function clearEnterpriseAttention() {
    var ec = entCard(); if (!ec) return;
    var outer = ec.outer, face = ec.face;
    outer.style.transition = 'transform .5s ease';
    outer.style.transform = '';
    face.classList.remove('rp-ent-glow');
    outer.removeAttribute('data-rp-attn');
  }

  function ensureShops() {
    var wrap = bizWrap(); if (!wrap) return;
    var btn = wrap.querySelector('button'); if (!btn) return;
    if (!wrap.querySelector('[data-rp-shops]')) wrap.insertBefore(buildShopsField(), btn);
    // Refresh the per-shop hint in case the rate (SHOPS_PRICE_PER) arrived from
    // config.json after the field was first built. Guarded so it never loops,
    // and left alone while the "contact sales" over-limit message is showing.
    var h = wrap.querySelector('[data-rp-shops-hint]');
    if (h && !R.businessOverLimit && h.textContent !== shopsHintText()) h.textContent = shopsHintText();
    // A re-render can drop the held hover pose off a freshly rebuilt Enterprise
    // card; re-assert it while still over the cap (idempotent, no re-shimmer).
    if (R.businessOverLimit) { try { triggerEnterpriseAttention(); } catch (e) {} }
    assertBizPrice(wrap);
    try { ensureCardFit(wrap); } catch (e) {}
  }

  // The Business card carries one extra control (the shops field) the other cards
  // do not, so its content is taller than the mockup's fixed card height and the
  // last feature bullets would spill past the border. Grow every card in the row
  // to fit the tallest content, keeping the row level. Writes are style-only (not
  // seen by the childList MutationObserver) and idempotent, so this converges
  // without a feedback loop. Runs only while the card is visible.
  function ensureCardFit(wrap) {
    if (!wrap || !wrap.closest) return;
    var face = wrap.closest('.card-face'); if (!face) return;
    if (face.offsetParent === null) return;                 // hidden segment -> skip
    var cs = getComputedStyle(face);
    var padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var needed = Math.ceil(wrap.getBoundingClientRect().height + padY + 4);
    if (!(needed > 0)) return;
    if (Math.round(face.getBoundingClientRect().height) >= needed - 1) return;   // already fits
    var flip = face.closest('.flip-card'); var section = flip && flip.parentElement;
    if (!section) return;
    var cards = section.querySelectorAll('.flip-card'), i, j;
    for (i = 0; i < cards.length; i++) {
      cards[i].style.setProperty('height', needed + 'px', 'important');
      var inner = cards[i].querySelector('.flip-inner');
      if (inner) inner.style.setProperty('height', needed + 'px', 'important');
      var faces = cards[i].querySelectorAll('.card-face');
      for (j = 0; j < faces.length; j++) faces[j].style.setProperty('height', needed + 'px', 'important');
    }
  }

  // Drop our height overrides so the next fit re-measures from the mockup default
  // (used on resize, where content wrapping - and the needed height - can change).
  function clearCardFit() {
    var wrap = bizWrap(); if (!wrap || !wrap.closest) return;
    var face = wrap.closest('.card-face'); var flip = face && face.closest('.flip-card');
    var section = flip && flip.parentElement; if (!section) return;
    var cards = section.querySelectorAll('.flip-card'), i, j;
    for (i = 0; i < cards.length; i++) {
      cards[i].style.removeProperty('height');
      var inner = cards[i].querySelector('.flip-inner');
      if (inner) inner.style.removeProperty('height');
      var faces = cards[i].querySelectorAll('.card-face');
      for (j = 0; j < faces.length; j++) faces[j].style.removeProperty('height');
    }
  }

  // -------------------------------------------------------------------------
  // Growth "1 or 2 shops" selector
  // -------------------------------------------------------------------------
  // Growth is one plan the buyer takes for 1 OR 2 shops, each with its own flat
  // total in PLANS[growth].shop_prices (NOT rate x shops). A compact segmented
  // control on the card flips rpos.growthShops; the card + pay-modal price follow
  // (wire.js reads the same rpos.growthShops). Mirrors the Business shops control.
  function growthName() {
    try {
      if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) {
        if ((C.PLANS[i].code || '') === 'growth') return C.PLANS[i].name || 'Growth';
      }
    } catch (e) {}
    return 'Growth';
  }
  function isGrowthName(el) {
    if (!el) return false;
    var nm = (el.textContent || '').trim();
    return nm === growthName() || nm === 'Growth';
  }
  function growthWrap() {
    var btns = document.querySelectorAll('button'), i;
    for (i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.getAttribute && b.getAttribute('data-rp') != null) continue;   // our own controls
      if ((b.textContent || '').trim().toLowerCase() !== 'buy now') continue;
      if (b.closest && b.closest('td, th, sc-raw-td')) continue;           // compare table
      var wrap = b.parentElement;
      if (wrap && isGrowthName(wrap.children[0])) return wrap;
    }
    return null;
  }
  // Growth's per-shop-count totals { "1":.., "2":.. } from PLANS[growth].shop_prices.
  function growthPricesE() {
    try {
      if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) {
        var p = C.PLANS[i];
        if ((p.code || '') === 'growth' && p.shop_prices) {
          var out = {}, any = false;
          for (var k in p.shop_prices) { var n = num(p.shop_prices[k], NaN); if (isFinite(n)) { out[String(parseInt(k, 10))] = n; any = true; } }
          if (any) return out;
        }
      }
    } catch (e) {}
    return null;
  }
  function growthShopsVal() { return R.growthShops === 2 ? 2 : 1; }
  // The 1/2 selector + price management only kick in when the vendor has
  // published Growth shop_prices. Without them, Growth is a single-price plan and
  // we leave its card entirely to wire.js / the baked mockup (no selector, no
  // price rewrite) - exactly like a page with no published PLANS.
  function growthConfigured() { return !!growthPricesE(); }
  // Total for the chosen shop count (lookup); falls back to the plan's base price
  // (1-shop) when shop_prices are not published yet.
  function growthPriceVal() {
    var gp = growthPricesE();
    if (gp && gp[String(growthShopsVal())] != null) return gp[String(growthShopsVal())];
    try { if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) { if ((C.PLANS[i].code || '') === 'growth') return num(C.PLANS[i].price, 0); } } catch (e) {}
    return 0;
  }
  // A two-option segmented control ("1 shop" / "2 shops"). Its buttons carry
  // data-rp so growthWrap()/bizWrap() skip them; the box is data-rp-growth.
  function buildGrowthField() {
    var box = document.createElement('div');
    box.setAttribute('data-rp', 'growth');
    box.setAttribute('data-rp-growth', '1');
    box.style.cssText = 'margin:0 0 16px;text-align:left';
    var lab = document.createElement('div');
    lab.textContent = 'Number of shops';
    lab.style.cssText = 'font-size:12px;font-weight:700;color:#8a8a90;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px';
    var seg = document.createElement('div');
    seg.style.cssText = 'display:inline-flex;border:1px solid #e7dcc0;border-radius:11px;overflow:hidden;background:#fffdf7';
    function mkBtn(n, text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-rp', 'growth-opt');
      btn.setAttribute('data-rp-growth-opt', String(n));
      btn.textContent = text;
      btn.style.cssText = 'border:0;background:transparent;padding:9px 16px;font-size:14px;font-weight:800;color:#8a8a90;cursor:pointer';
      btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setGrowth(n); });
      return btn;
    }
    seg.appendChild(mkBtn(1, '1 shop'));
    seg.appendChild(mkBtn(2, '2 shops'));
    box.appendChild(lab);
    box.appendChild(seg);
    return box;
  }
  // Highlight the selected option (gold) and mute the other; idempotent.
  function paintGrowthSeg(box) {
    if (!box) return;
    var opts = box.querySelectorAll('[data-rp-growth-opt]'), i;
    for (i = 0; i < opts.length; i++) {
      var on = String(growthShopsVal()) === opts[i].getAttribute('data-rp-growth-opt');
      opts[i].style.background = on ? 'linear-gradient(#f5c542,#e6b325)' : 'transparent';
      opts[i].style.color = on ? '#19191c' : '#8a8a90';
    }
  }
  function setGrowth(n) {
    R.growthShops = (n === 2) ? 2 : 1;
    var w = growthWrap();
    if (w) { paintGrowthSeg(w.querySelector('[data-rp-growth]')); assertGrowthPrice(w); try { ensureCardFit(w); } catch (e) {} }
  }
  // Write the Growth card's price = the chosen shop count's total (only when it
  // actually differs, so this stays quiet inside the re-render observer).
  function assertGrowthPrice(wrap) {
    if (!growthConfigured()) return;           // single-price Growth -> leave to wire.js
    wrap = wrap || growthWrap(); if (!wrap) return;
    var prow = wrap.children[2];               // [name, shops-line, price-row, ...]
    if (prow && prow.children && prow.children.length >= 2) {
      var target = prow.children[1];           // [currency, amount, per]
      var want = inrNum(growthPriceVal());
      if (target && target.textContent !== want) target.textContent = want;
    }
  }
  function ensureGrowth() {
    if (!growthConfigured()) return;           // no dual-price published -> no selector
    var wrap = growthWrap(); if (!wrap) return;
    var btn = wrap.querySelector('button'); if (!btn) return;   // before any inject, this is Buy now
    if (!wrap.querySelector('[data-rp-growth]')) wrap.insertBefore(buildGrowthField(), btn);
    paintGrowthSeg(wrap.querySelector('[data-rp-growth]'));
    assertGrowthPrice(wrap);
    try { ensureCardFit(wrap); } catch (e) {}
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
    a.textContent = 'Start Trial';
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
      '<h3 style="margin:0 0 4px;font-size:20px;color:#19191c;text-align:center">Start your free trial</h3>' +
      '<div style="text-align:center;color:#8a8a90;font-size:13px;margin-bottom:18px">Choose your device to get started</div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      panelHTML('win', 'Windows', 'Windows 10 / 11, 64-bit installer (.exe)') +
      panelHTML('android', 'Android', 'Android 5.0 and up (.apk)') +
      '</div>' +
      '</div>';
    document.body.appendChild(dlModal);
    dlModal.addEventListener('click', function (e) { if (e.target === dlModal) dlModal.style.display = 'none'; });
    dlModal.querySelector('[data-x]').onclick = function () { dlModal.style.display = 'none'; };
    // Download click-guard: if the button's URL is already a DIRECT asset, let
    // the browser download it. Otherwise (config.json still points at the
    // releases page and resolution hasn't produced a direct link yet), resolve
    // first and then trigger the direct download, so we never land on GitHub.
    dlModal.addEventListener('click', function (e) {
      var btn = (e.target && e.target.closest) ? e.target.closest('[data-win],[data-android]') : null;
      if (!btn) return;
      var kind = btn.hasAttribute('data-android') ? 'android' : 'win';
      var cur = (kind === 'android') ? C.DOWNLOAD_ANDROID_URL : C.DOWNLOAD_WINDOWS_URL;
      if (isDirectAsset(cur)) return;                    // href is direct -> native download
      e.preventDefault();
      if (btn.getAttribute('data-busy')) return;         // a resolve is already running
      var prev = btn.textContent;
      btn.setAttribute('data-busy', '1'); btn.textContent = 'Preparing...';
      _dlResolved = false;                               // config value was not direct -> retry
      resolveLatestDownloads().then(function () {
        btn.removeAttribute('data-busy'); btn.textContent = prev;
        var u = (kind === 'android') ? C.DOWNLOAD_ANDROID_URL : C.DOWNLOAD_WINDOWS_URL;
        if (isDirectAsset(u)) { refreshDownloadLinks(); triggerDownload(u); }
        else { var rel = safeUrl(C.RELEASES_URL); if (rel !== '#') window.open(rel, '_blank', 'noopener'); }
      });
    });
  }
  function showDownload() {
    if (!dlModal) buildDownload();
    // Mark the buttons as downloads (no target) so the browser fetches the file
    // directly instead of opening the GitHub page. Hrefs are filled by
    // refreshDownloadLinks() and kept current by resolveLatestDownloads().
    var win = dlModal.querySelector('[data-win]'); if (win) { win.setAttribute('download', ''); win.removeAttribute('target'); win.removeAttribute('rel'); }
    var and = dlModal.querySelector('[data-android]'); if (and) { and.setAttribute('download', ''); and.removeAttribute('target'); and.removeAttribute('rel'); }
    refreshDownloadLinks();
    try { resolveLatestDownloads(); } catch (e) {}
    dlModal.style.display = 'flex';
  }
  function refreshDownloadLinks() {
    if (!dlModal) return;
    var w = safeUrl(C.DOWNLOAD_WINDOWS_URL), a = safeUrl(C.DOWNLOAD_ANDROID_URL);
    var win = dlModal.querySelector('[data-win]'); if (win && w !== '#') win.href = w;
    var and = dlModal.querySelector('[data-android]'); if (and && a !== '#') and.href = a;
  }

  // Resolve the CURRENT latest-release .exe / .apk at runtime so the buttons
  // always serve the newest build (the config URLs are only an offline fallback).
  // Primary: GitHub's "latest release" API, matched by file extension. Fallback:
  // the release's latest.json manifest (stable URL), from which we derive the
  // asset URLs by the naming convention. Everything is guarded and best-effort.
  var _dlResolved = false, _dlResolving = null;
  // A DIRECT asset link (.../releases/download/<tag>/<file>.apk|.exe) downloads
  // the file straight away; the releases PAGE (.../releases or /releases/latest)
  // just navigates to GitHub. We only ever click a direct asset.
  function isDirectAsset(u) { return /\/releases\/download\/.+\.(apk|exe)$/i.test(String(u || '')); }
  // Remember the last successfully-resolved direct URLs so a later visit that
  // can't reach the GitHub API (rate-limited: 60 req/hr/IP -> 403) still has a
  // direct link ready, instead of falling back to the releases page.
  var _DL_CACHE_KEY = 'rpos_dl_v1';
  function readDlCache() { try { return JSON.parse(localStorage.getItem(_DL_CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function writeDlCache(win, apk) {
    try {
      var cur = readDlCache() || {};
      if (isDirectAsset(win)) cur.win = win;
      if (isDirectAsset(apk)) cur.apk = apk;
      localStorage.setItem(_DL_CACHE_KEY, JSON.stringify(cur));
    } catch (e) {}
  }
  // Seed C.DOWNLOAD_* from the cache when the configured value is NOT a direct
  // asset (e.g. config.json points at the releases page). A direct config value
  // always wins and is left untouched.
  function seedDownloadsFromCache() {
    var c = readDlCache(); if (!c) return;
    if (!isDirectAsset(C.DOWNLOAD_WINDOWS_URL) && isDirectAsset(c.win)) C.DOWNLOAD_WINDOWS_URL = c.win;
    if (!isDirectAsset(C.DOWNLOAD_ANDROID_URL) && isDirectAsset(c.apk)) C.DOWNLOAD_ANDROID_URL = c.apk;
  }
  // Programmatically start a download of a direct asset URL (GitHub serves it
  // with Content-Disposition: attachment, so the page stays put).
  function triggerDownload(u) {
    if (!u || u === '#') return;
    try {
      var a = document.createElement('a');
      a.href = u; a.setAttribute('download', ''); a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { document.body.removeChild(a); } catch (e) {} }, 0);
    } catch (e) { try { window.location.href = u; } catch (e2) {} }
  }
  function ghRepo() {
    var m = /github\.com\/([^\/]+)\/([^\/?#]+)/i.exec(String(C.RELEASES_URL || C.DOWNLOAD_WINDOWS_URL || ''));
    return m ? { owner: m[1], repo: m[2] } : null;
  }
  function pickAsset(assets, re) {
    for (var i = 0; i < (assets || []).length; i++) {
      var a = assets[i], u = a && a.browser_download_url;
      if (a && re.test(a.name || '') && /^https:\/\//i.test(u || '')) return u;
    }
    return null;
  }
  // Resolve the current latest .exe / .apk to DIRECT asset URLs. Returns a
  // Promise so a click can await it. Manifest FIRST (a stable release file, not
  // rate-limited), API second (exact, CORS-ok, but rate-limited). _dlResolving
  // holds the in-flight promise so concurrent callers share one fetch.
  function resolveLatestDownloads() {
    if (_dlResolved) return Promise.resolve();
    if (_dlResolving) return _dlResolving;
    var repo = ghRepo();
    if (!repo || typeof fetch !== 'function') return Promise.resolve();
    _dlResolving = resolveViaManifest(repo)
      .then(function () { if (!_dlResolved) return resolveViaApi(repo); })
      .then(function () { _dlResolving = null; })
      .catch(function () { _dlResolving = null; });
    return _dlResolving;
  }
  function resolveViaApi(repo) {
    var api = 'https://api.github.com/repos/' + repo.owner + '/' + repo.repo + '/releases/latest';
    return fetch(api, { headers: { 'Accept': 'application/vnd.github+json' } })
      .then(function (r) { if (!r.ok) throw new Error('gh ' + r.status); return r.json(); })
      .then(function (rel) {
        var win = pickAsset(rel && rel.assets, /\.exe$/i);
        var apk = pickAsset(rel && rel.assets, /\.apk$/i);
        if (win) C.DOWNLOAD_WINDOWS_URL = win;
        if (apk) C.DOWNLOAD_ANDROID_URL = apk;
        if (!win && !apk) throw new Error('no assets');
        _dlResolved = true; writeDlCache(win, apk); refreshDownloadLinks();
      })
      .catch(function () {});
  }
  function resolveViaManifest(repo) {
    if (typeof fetch !== 'function') return Promise.resolve();
    var base = 'https://github.com/' + repo.owner + '/' + repo.repo + '/releases';
    return fetch(base + '/latest/download/latest.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function (j) {
        var v = j && j.payload && j.payload.version; if (!v) throw new Error('no version');
        var win = base + '/download/v' + v + '/RasidhuPOS-Setup-' + v + '.exe';
        var apk = base + '/download/v' + v + '/RasidhuPOS-Mobile-' + v + '.apk';
        C.DOWNLOAD_WINDOWS_URL = win; C.DOWNLOAD_ANDROID_URL = apk;
        _dlResolved = true; writeDlCache(win, apk); refreshDownloadLinks();
      })
      .catch(function () {});
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
  function jwtClaims(t) {
    try {
      var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      return JSON.parse(decodeURIComponent(escape(atob(p)))) || {};
    } catch (e) { return {}; }
  }
  function onSignedIn(em, nm) {
    if (!em) return;
    R.pageEmail = em;
    if (nm) R.pageName = nm;
    // Persist for this browser session so a framework re-render / the Buy-now
    // gate keeps seeing the signed-in user without re-prompting.
    try { sessionStorage.setItem('rpos_email_v1', em); } catch (e) {}
    try { if (nm) sessionStorage.setItem('rpos_name_v1', nm); } catch (e) {}
    try { reflectSignin(); } catch (e) {}
    try {
      var mf = document.querySelector('#rpos-pay [data-email]');
      if (mf) {
        // Now that the Gmail is known, fill and lock it (matches wire.js).
        mf.value = em; mf.readOnly = true;
        mf.style.background = '#f2f2f4'; mf.style.cursor = 'not-allowed';
        mf.title = 'Signed in with Google, this is your subscription email';
        var sb = document.querySelector('#rpos-pay [data-signin]'); if (sb) sb.style.display = 'none';
      }
    } catch (e) {}
  }
  var gisReady = false;
  function ensureGis(cb) {
    loadGis(function () {
      if (!gisReady) {
        try { google.accounts.id.initialize({ client_id: C.GOOGLE_CLIENT_ID, callback: function (r) { var c = jwtClaims(r && r.credential || ''); onSignedIn(c.email || '', c.name || ''); } }); gisReady = true; } catch (e) {}
      }
      if (cb) cb();
    });
  }
  // Used by the wire.js pay modal to render an in-form sign-in button.
  R.mountGoogleSignin = function (container) {
    if (!C.GOOGLE_CLIENT_ID || !container) return;
    ensureGis(function () { try { google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' }); } catch (e) {} });
  };
  // Sign in via the OAuth2 popup (a real Google window), NOT One Tap. One Tap's
  // google.accounts.id.prompt() goes through FedCM, which rejects with
  // AbortError / NetworkError when the browser has FedCM disabled (or turned off
  // after a prior dismissal) or the client/origin is misconfigured. The popup
  // path (requireSignIn -> initTokenClient, ux_mode:'popup') avoids FedCM
  // entirely, so the nav "Sign in" click always opens a working Google window.
  function doSignin() { if (!C.GOOGLE_CLIENT_ID) return; try { R.requireSignIn(function () {}); } catch (e) {} }

  // ---- OAuth2 popup sign-in (a small Google window on top of the page) ------
  // Used to GATE Buy now: unlike One Tap (doSignin), this always opens Google's
  // own popup window sized just for signing in. On success we read the email
  // from the userinfo endpoint and mark the user signed in.
  var _tokenClient = null, _signinDone = null;
  function _fetchEmail(token, done) {
    try {
      fetch('https://www.googleapis.com/oauth2/v3/userinfo',
            { headers: { Authorization: 'Bearer ' + token } })
        .then(function (r) { return r.json(); })
        .then(function (o) {
          var em = (o && o.email) || '';
          var nm = (o && o.name) || '';
          if (em) onSignedIn(em, nm);
          if (done) { try { done(em); } catch (e) {} }
        })
        .catch(function () { if (done) done(''); });
    } catch (e) { if (done) done(''); }
  }
  function _ensureTokenClient() {
    if (_tokenClient) return _tokenClient;
    try {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: C.GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: function (resp) {
          var done = _signinDone; _signinDone = null;
          if (resp && resp.access_token) _fetchEmail(resp.access_token, done);
          else if (done) done('');
        }
      });
    } catch (e) { _tokenClient = null; }
    return _tokenClient;
  }
  // Public (called by wire.js's Buy-now gate). Ensures a Google sign-in via the
  // popup window, then calls onDone(email). email is '' if sign-in is off, the
  // user cancelled, or it could not complete - callers then simply do nothing.
  R.requireSignIn = function (onDone) {
    if (!C.GOOGLE_CLIENT_ID) { if (onDone) onDone(''); return; }
    var em = R.currentEmail ? R.currentEmail() : (R.pageEmail || '');
    if (em) { if (onDone) onDone(em); return; }        // already signed in
    loadGis(function () {
      var tc = _ensureTokenClient();
      if (!tc) { if (onDone) onDone(''); return; }
      _signinDone = onDone || null;
      try { tc.requestAccessToken(); }                 // opens the Google popup window
      catch (e) { _signinDone = null; if (onDone) onDone(''); }
    });
  };

  // The official multi-colour Google "G" mark, inlined so it needs no network
  // request (and survives the strict-origin landing page). Rendered inside the
  // signed-out "Sign in" pill.
  var GOOGLE_G_SVG =
    '<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;flex:none">' +
    '<path fill="#4285F4" d="M17.64 9.2045c0-.6382-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6151z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1818l-2.9087-2.2582c-.8059.54-1.8368.8618-3.0477.8618-2.344 0-4.3282-1.5831-5.0364-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>' +
    '<path fill="#FBBC05" d="M3.9636 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1022-1.17.2822-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.9636 10.71z"/>' +
    '<path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"/>' +
    '</svg>';
  // Injected once: only the :hover effect needs a stylesheet (inline styles set
  // the base pill so they always beat the template's inline colour).
  function ensureSigninBtnCss() {
    if (document.getElementById('rp-signin-btn-css')) return;
    try {
      var st = document.createElement('style');
      st.id = 'rp-signin-btn-css';
      st.textContent =
        '.rp-signin-btn{transition:background .15s ease,box-shadow .15s ease,border-color .15s ease}' +
        '.rp-signin-btn:hover{background:#f7f8fa!important;box-shadow:0 1px 4px rgba(60,64,67,.3)!important;border-color:#c6cacf!important}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  }
  // Turn the signed-out "Sign in" link into a Google sign-in pill (icon + label).
  // Idempotent: the icon/label are injected once (guarded by data-rp-btn); the
  // inline pill styles are re-applied every pass, which is free (the render
  // MutationObserver watches childList only, not attributes).
  function styleSigninButton(link) {
    ensureSigninBtnCss();
    if (link.getAttribute('data-rp-btn') == null) {
      link.innerHTML = GOOGLE_G_SVG + '<span>Sign in</span>';
      if ((' ' + (link.className || '') + ' ').indexOf(' rp-signin-btn ') < 0) {
        link.className = (link.className ? link.className + ' ' : '') + 'rp-signin-btn';
      }
      link.setAttribute('aria-label', 'Sign in with Google');
      link.setAttribute('data-rp-btn', '1');
    }
    var s = link.style;
    s.display = 'inline-flex'; s.alignItems = 'center'; s.gap = '8px';
    s.padding = '7px 16px'; s.border = '1px solid #dadce0'; s.borderRadius = '999px';
    s.background = '#fff'; s.color = '#3c4043'; s.fontWeight = '600';
    s.lineHeight = '1'; s.textDecoration = 'none'; s.cursor = 'pointer';
    s.boxShadow = '0 1px 2px rgba(60,64,67,.12)';
  }

  // ---- Sign out --------------------------------------------------------------
  // Clears the signed-in state this browser session holds (sessionStorage + the
  // in-memory rpos.pageEmail/pageName), stops One Tap from silently re-selecting
  // the account, re-unlocks the pay modal email, then repaints the nav back to
  // the signed-out "Sign in" pill.
  function doSignout() {
    try { sessionStorage.removeItem('rpos_email_v1'); } catch (e) {}
    try { sessionStorage.removeItem('rpos_name_v1'); } catch (e) {}
    R.pageEmail = ''; R.pageName = '';
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {}
    // Re-unlock the pay modal email field (mirrors onSignedIn's lock), so a
    // different account can be typed after signing out.
    try {
      var mf = document.querySelector('#rpos-pay [data-email]');
      if (mf) { mf.readOnly = false; mf.value = ''; mf.style.background = ''; mf.style.cursor = ''; mf.title = ''; }
      var sb = document.querySelector('#rpos-pay [data-signin]'); if (sb) sb.style.display = '';
    } catch (e) {}
    try { reflectSignin(); } catch (e) {}
  }
  function removeSignout(nav) {
    try { var el = nav.querySelector('[data-rp-signout]'); if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
  }
  // Add a small "Sign out" link right after the signed-in account name. Guarded
  // so it is added once (a framework re-render clones the nav -> re-added on the
  // next pass). Not picked up as the "sign in" link by reflectSignin's finder
  // (its text is "Sign out" and it carries data-rp-signout, not data-rp-signin).
  function ensureSignout(afterLink) {
    var nav = navEl(); if (!nav) return;
    if (nav.querySelector('[data-rp-signout]')) return;
    var a = document.createElement('a');
    a.setAttribute('data-rp-signout', '1');
    a.href = '#';
    a.textContent = 'Sign out';
    a.title = 'Sign out of this account';
    var s = a.style;
    s.marginLeft = '14px'; s.color = '#8a8a90'; s.fontWeight = '600';
    s.fontSize = '13px'; s.textDecoration = 'none'; s.cursor = 'pointer';
    if (afterLink && afterLink.parentNode) afterLink.parentNode.insertBefore(a, afterLink.nextSibling);
    else nav.appendChild(a);
  }

  function reflectSignin() {
    var nav = navEl(); if (!nav) return;
    var links = nav.querySelectorAll('a'), link = null, i;
    for (i = 0; i < links.length; i++) {
      var t = (links[i].textContent || '').trim().toLowerCase();
      if (t === 'sign in' || links[i].getAttribute('data-rp-signin') != null || links[i].getAttribute('data-rp-signed') != null) { link = links[i]; break; }
    }
    if (!link) return;
    var email = R.pageEmail || '';
    var name = R.pageName || '';
    if (email) {
      // Prefer the Google display name; fall back to the Gmail when unknown.
      // The guard key mixes both so a name that arrives after the email (a
      // sign-in completing later) still refreshes the label.
      var disp = name || email;
      var key = email + '|' + name;
      if (link.getAttribute('data-rp-signed') !== key) {
        // Signed in: drop the pill chrome + icon, show the account as gold text.
        link.textContent = disp.length > 24 ? disp.slice(0, 21) + '...' : disp;
        link.title = name ? ('Signed in as ' + name + ' (' + email + ')') : ('Signed in as ' + email);
        link.className = (link.className || '').replace(/\brp-signin-btn\b/g, '').trim();
        link.removeAttribute('data-rp-btn');
        var so = link.style;
        so.display = ''; so.alignItems = ''; so.gap = ''; so.padding = '';
        so.border = ''; so.borderRadius = ''; so.background = ''; so.boxShadow = '';
        so.lineHeight = '';
        so.color = '#a97400';
        so.fontWeight = '700';
        link.setAttribute('href', '#');
        link.removeAttribute('data-rp-signin');
        link.setAttribute('data-rp-signed', key);
      }
      // Offer a Sign out control beside the account name (re-added after a
      // re-render; the helper is a no-op when it already exists).
      ensureSignout(link);
    } else {
      // Signed out: drop any Sign out control we added.
      removeSignout(nav);
      if (C.GOOGLE_CLIENT_ID) {
        // Sign-in configured: mark it clickable and dress it as a Google
        // sign-in button.
        if (link.getAttribute('data-rp-signin') == null) link.setAttribute('data-rp-signin', '1');
        styleSigninButton(link);
      }
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

  // -------------------------------------------------------------------------
  // Policy popups (Terms / Refund / Privacy) - the footer links are dead "#"
  // anchors in the mockup; open the actual policy text in a modal instead of
  // navigating away. Contact is handled by wire.js (opens Support). Content
  // mirrors terms.html / refund.html / privacy.html. Built with DOM methods
  // (no innerHTML for the copy), so there is no injection surface.
  // -------------------------------------------------------------------------
  function polBiz() { var b = C.BUSINESS_NAME; return (b && !/FILL/i.test(b)) ? b : 'RasidhuPOS'; }
  function polCity() { var c = C.CITY; return (c && !/FILL/i.test(c)) ? c : 'India'; }
  function polEmail() { var e = C.SUPPORT_EMAIL; return (e && !/FILL/i.test(e) && /@/.test(e)) ? e : 'mullairajan2000@gmail.com'; }
  function policyData(kind) {
    var biz = polBiz(), city = polCity(), email = polEmail();
    if (kind === 'refund') {
      return { title: 'Refund Policy', updated: 'Last updated: 10 July 2026', blocks: [
        { p: biz + ' is a digital subscription that we activate after we confirm your payment.' },
        { h: 'When you can request a refund', p: 'If we are unable to activate your account, or you are not satisfied, you can request a refund within 7 days of your payment.' },
        { h: 'How to request', p: 'Email ' + email + ' with your Google account email and your UPI payment reference (UTR). Approved refunds are returned to the same UPI account the payment came from.' }
      ] };
    }
    if (kind === 'privacy') {
      return { title: 'Privacy Policy', updated: 'Last updated: 10 July 2026', blocks: [
        { h: '1. What we collect', p: 'To provide the subscription we collect your Google account email (this is your subscription identity), the UPI payment reference (UTR), the plan and amount you submit, and basic technical details such as the app version and whether the request came from the desktop or Android app.' },
        { h: '2. What we do not collect', p: 'We do not receive or store your card or bank credentials. UPI payments are made directly from your app to our UPI address, so we never see your banking login.' },
        { h: '3. How we use it', p: 'We use this information only to verify your payment and to activate and support your subscription. It is stored in our Google Sheet of subscription requests and in the signed entitlement list that unlocks the app.' },
        { h: '4. Sharing', p: 'We do not sell your data. We share it only where needed to run the service (for example Google, which hosts the form and sheet) or where required by law.' },
        { h: '5. Your choices', p: 'To access or delete your data, contact us at ' + email + '.' }
      ] };
    }
    return { title: 'Terms of Service', updated: 'Last updated: 10 July 2026', blocks: [
      { h: '1. Subscription and account', p: 'Your ' + biz + ' subscription is tied to a single Google account and is valid for 1 year from the date we activate it. You may use it on both the desktop and Android apps when signed in with that Google account.' },
      { h: '2. Plans and caps', p: 'Each plan (Starter, Growth, Business, Enterprise) includes a set number of shops and staff accounts, as shown on the pricing page. Enterprise caps are agreed individually. Caps can be adjusted for your account on request.' },
      { h: '3. Activation', p: 'Activation is manual. After you pay by UPI and submit your payment reference, we verify the payment and then activate your account, normally within one business day. Until activation, the app stays in its current state and no charge is applied by us beyond your UPI payment.' },
      { h: '4. Renewals and no lock-in', p: 'There is no lock-in. A subscription expires at the end of its year unless you renew by paying again. When it expires the app becomes read-only, you can still view your data, and your data stays on your device and in your cloud backup.' },
      { h: '5. Acceptable use', p: 'Do not resell, sublicense or attempt to circumvent the subscription. One subscription is for one business\'s own use within the caps of the chosen plan.' },
      { h: '6. Warranty and liability', p: 'The software is provided "as is", without warranties of any kind. To the extent permitted by law, our total liability is limited to the fees you paid for the current subscription term.' },
      { h: '7. Governing law', p: 'These terms are governed by the laws of India, with courts at ' + city + ' having jurisdiction.' },
      { h: '8. Contact', p: 'Questions about these terms: ' + email + '.' }
    ] };
  }
  var polModal = null;
  function buildPolicy() {
    polModal = document.createElement('div');
    polModal.id = 'rpos-policy';
    polModal.setAttribute('style', 'position:fixed;inset:0;background:rgba(15,15,20,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:20px 12px;z-index:2147483000;font-family:system-ui,Segoe UI,Roboto,sans-serif');
    var card = document.createElement('div');
    card.setAttribute('data-rp-polcard', '1');
    card.setAttribute('style', 'position:relative;background:#fff;max-width:640px;width:100%;margin:auto;border-radius:16px;padding:26px 24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:left');
    var x = document.createElement('button');
    x.setAttribute('data-rp-polx', '1');
    x.setAttribute('style', 'position:absolute;top:8px;right:12px;border:0;background:none;font-size:24px;line-height:1;color:#8a8a90;cursor:pointer');
    x.textContent = '×';
    var h3 = document.createElement('h3');
    h3.setAttribute('data-rp-poltitle', '1');
    h3.setAttribute('style', 'margin:0 6px 4px 0;font-size:20px;color:#19191c');
    var upd = document.createElement('div');
    upd.setAttribute('data-rp-polupd', '1');
    upd.setAttribute('style', 'color:#8a8a90;font-size:12px;margin-bottom:14px');
    var body = document.createElement('div');
    body.setAttribute('data-rp-polbody', '1');
    var foot = document.createElement('div');
    foot.setAttribute('style', 'margin-top:18px;text-align:right');
    var close = document.createElement('button');
    close.setAttribute('data-rp-polclose', '1');
    close.setAttribute('style', 'background:#c99400;color:#19191c;font-weight:800;border:0;padding:11px 22px;border-radius:11px;cursor:pointer;font-size:14px');
    close.textContent = 'Close';
    foot.appendChild(close);
    card.appendChild(x); card.appendChild(h3); card.appendChild(upd); card.appendChild(body); card.appendChild(foot);
    polModal.appendChild(card);
    document.body.appendChild(polModal);
    // No typed input here, so a backdrop click may dismiss (unlike the pay modal).
    polModal.addEventListener('click', function (e) { if (e.target === polModal) hidePolicy(); });
    x.onclick = hidePolicy;
    close.onclick = hidePolicy;
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) && polModal && polModal.style.display !== 'none') hidePolicy();
    });
  }
  function hidePolicy() { if (polModal) polModal.style.display = 'none'; }
  function showPolicy(kind) {
    if (!polModal) buildPolicy();
    var d = policyData(kind);
    polModal.querySelector('[data-rp-poltitle]').textContent = d.title;
    polModal.querySelector('[data-rp-polupd]').textContent = d.updated || '';
    var body = polModal.querySelector('[data-rp-polbody]');
    while (body.firstChild) body.removeChild(body.firstChild);
    for (var i = 0; i < d.blocks.length; i++) {
      var b = d.blocks[i];
      if (b.h) {
        var hh = document.createElement('h4');
        hh.setAttribute('style', 'margin:16px 0 4px;font-size:14.5px;font-weight:700;color:#19191c');
        hh.textContent = b.h; body.appendChild(hh);
      }
      var pp = document.createElement('p');
      pp.setAttribute('style', 'margin:0 0 8px;font-size:13.5px;line-height:1.55;color:#3a3a40');
      pp.textContent = b.p; body.appendChild(pp);
    }
    var card = polModal.querySelector('[data-rp-polcard]'); if (card) card.scrollTop = 0;
    polModal.style.display = 'flex';
  }
  // Map a dead footer link's text to the policy it should open (Contact is left
  // for wire.js's Support handler).
  function policyKindFor(text) {
    var t = (text || '').trim().toLowerCase();
    if (t === 'terms' || t === 'terms & conditions' || t === 'terms and conditions' || t === 'terms of service') return 'terms';
    if (t === 'refund policy' || t === 'refund' || t === 'refunds') return 'refund';
    if (t === 'privacy' || t === 'privacy policy') return 'privacy';
    return '';
  }

  // -------------------------------------------------------------------------
  // "Why choose RasidhuPOS" benefit grid, mounted right after the compare
  // section (before the guarantee band). Self-styled with scoped rpwhy-*
  // classes injected once, so it stays native to the cream/gold theme without
  // touching the mockup markup. Mounted idempotently and re-asserted by pass()
  // like the other injected surfaces. No em-dash in copy (project rule).
  // -------------------------------------------------------------------------
  function whyIcon(name) {
    var o = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    var p = {
      cloud:   '<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 9.2 4 4 0 0 0 6.5 19z"/>',
      phone:   '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
      send:    '<path d="M21 4 3.5 11l7 2.5L13 21z"/><path d="M21 4 10.5 13.5"/>',
      doc:     '<path d="M13.5 3H7v18h10V6.5z"/><path d="M13.5 3v3.5H17"/><path d="M9.5 12h5M9.5 15.5h5"/>',
      chat:    '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v8A1.5 1.5 0 0 1 18.5 15H9l-4 4z"/>',
      monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
      tag:     '<path d="M20 12.5 12.5 20l-8.5-8.5V4H12z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
      shield:  '<path d="M12 3 5 6v5c0 4.2 3 7.4 7 9 4-1.6 7-4.8 7-9V6z"/><path d="M9 12l2 2 4.5-4.5"/>',
      wifi:    '<path d="M5 9.5a11 11 0 0 1 14 0"/><path d="M8.5 13a6 6 0 0 1 7 0"/><path d="M12 16.5h.01"/><path d="M3.5 3.5l17 17"/>',
      store:   '<path d="M3.5 9 5 4.5h14L20.5 9"/><path d="M5 9v10.5h14V9"/><path d="M9.5 19.5V14h5v5.5"/><path d="M3.5 9h17"/>',
      refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4.5V8.5h-4"/>',
      grid:    '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'
    };
    return o + (p[name] || '') + '</svg>';
  }
  var WHY = [
    ['cloud',   'Cloud sync',              'Your bills, items and customers stay backed up and in sync across every device, automatically.'],
    ['phone',   'A real mobile app',       'A full Android app, not a cut-down viewer. Everything you do on the phone reaches the shop.'],
    ['send',    'Bill from anywhere',      'Raise a bill on your phone and it lands in the shop books the moment you are back online.'],
    ['doc',     'Customizable invoices',   'Add your logo, tax details and your own fields, then print or share invoices as PDF.'],
    ['chat',    'Quick support',           'Reach a real person fast. Support is built right into the app for when you need a hand.'],
    ['monitor', 'Runs on low-end PCs',     'Tuned to stay fast on older, low-memory computers, not just the newest machines.'],
    ['tag',     'Cost efficient',          'One flat yearly price with no per-bill charges and no surprise add-ons.'],
    ['shield',  'Your data stays yours',   'Your business data is never sold or shared, not even with us.'],
    ['wifi',    'Works offline',           'Keep billing through power cuts and dropped connections. It syncs the moment you are back.'],
    ['store',   'One account, every shop', 'Sign in with Google and run all your shops and devices under a single subscription.'],
    ['refresh', 'Always up to date',       'Free updates arrive automatically, so you always have the latest features and fixes.'],
    ['grid',    'More than billing',       'Purchases, stock, parties, staff and reports live in one place, not five separate tools.']
  ];
  function ensureWhyStyle() {
    if (document.getElementById('rpwhy-css')) return;
    var s = document.createElement('style');
    s.id = 'rpwhy-css';
    s.textContent =
      '.rpwhy{padding:6px 0 54px}' +
      '.rpwhy-head{text-align:center;max-width:730px;margin:0 auto 34px}' +
      '.rpwhy-eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#b57e00;margin:0 0 10px}' +
      '.rpwhy-title{font-size:32px;line-height:1.12;font-weight:800;letter-spacing:-0.02em;color:#19191c;margin:0 0 10px}' +
      '.rpwhy-lead{font-size:16px;line-height:1.55;color:#6b6b70;margin:0}' +
      '.rpwhy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}' +
      '.rpwhy-card{background:#fff;border:1px solid #ece4d2;border-radius:16px;padding:22px 20px;box-shadow:0 4px 22px rgba(25,25,28,.06);transition:transform .12s ease,box-shadow .18s ease,border-color .18s ease}' +
      '.rpwhy-card:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgba(224,164,18,.18);border-color:#f0d9a0}' +
      '.rpwhy-ic{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#e0a412,#f5c542 55%,#fff3c8);box-shadow:0 4px 12px rgba(224,164,18,.30);margin-bottom:14px}' +
      '.rpwhy-h{font-size:16.5px;font-weight:800;letter-spacing:-0.01em;color:#19191c;margin:0 0 6px}' +
      '.rpwhy-p{font-size:13.8px;line-height:1.55;color:#5f5f66;margin:0}' +
      '@media(max-width:1024px){.rpwhy-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
      '@media(max-width:640px){.rpwhy-grid{grid-template-columns:1fr}}' +
      '@media(prefers-reduced-motion:reduce){.rpwhy-card{transition:none}.rpwhy-card:hover{transform:none}}';
    (document.head || document.documentElement).appendChild(s);
  }
  function mountWhy() {
    var cmp = document.getElementById('compare');
    if (!cmp) return;                                   // not hydrated yet -> a later pass() retries
    if (document.getElementById('rpwhy')) return;       // idempotent (survives re-renders)
    ensureWhyStyle();
    var sec = document.createElement('section');
    sec.id = 'rpwhy';
    sec.className = 'rpwhy';
    sec.setAttribute('data-rp-why', '1');
    var cards = '';
    for (var i = 0; i < WHY.length; i++) {
      var w = WHY[i];
      cards +=
        '<div class="rpwhy-card">' +
          '<div class="rpwhy-ic">' + whyIcon(w[0]) + '</div>' +
          '<h3 class="rpwhy-h">' + w[1] + '</h3>' +
          '<p class="rpwhy-p">' + w[2] + '</p>' +
        '</div>';
    }
    sec.innerHTML =
      '<div class="rpwhy-head">' +
        '<div class="rpwhy-eyebrow">RasidhuPOS vs the rest</div>' +
        '<h2 class="rpwhy-title">Why choose RasidhuPOS over other billing software?</h2>' +
        '<p class="rpwhy-lead">Most billing apps make you trade off price, power or privacy. RasidhuPOS gives you all three, on desktop and mobile.</p>' +
      '</div>' +
      '<div class="rpwhy-grid">' + cards + '</div>';
    cmp.insertAdjacentElement('afterend', sec);
  }

  // ---- click delegation (bubble phase; wire.js handles buy/contact in capture)
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-rp-download]')) { e.preventDefault(); showDownload(); return; }
    if (t.closest('[data-rp-signout]')) { e.preventDefault(); doSignout(); return; }
    if (t.closest('[data-rp-signin]')) { e.preventDefault(); doSignin(); return; }
    // Footer policy links: dead "#" anchors -> open the content in a modal.
    var pa = t.closest('a');
    if (pa && (pa.getAttribute('href') || '') === '#' && !pa.getAttribute('data-rp')) {
      var pk = policyKindFor(pa.textContent);
      if (pk) { e.preventDefault(); showPolicy(pk); return; }
    }
    // A plan/segment toggle can reveal or re-render the Business/Growth card;
    // re-fit + re-inject the selectors shortly after so all bullets stay inside
    // once the retry window has closed.
    setTimeout(function () { try { ensureShops(); } catch (e2) {} try { ensureGrowth(); } catch (e2) {} }, 60);
    setTimeout(function () { try { ensureShops(); } catch (e2) {} try { ensureGrowth(); } catch (e2) {} }, 420);
  });

  // ---- passes: run now, retry through hydration, re-apply on re-render --------
  function pass() {
    try { ensureFavicon(); } catch (e) {}
    try { ensureStepperStyle(); } catch (e) {}
    try { ensureShops(); } catch (e) {}
    try { ensureGrowth(); } catch (e) {}
    try { mountDownload(); } catch (e) {}
    try { mountWhy(); } catch (e) {}
    try { reflectSignin(); } catch (e) {}
  }
  // The Business + Growth prices are re-asserted on a macrotask so they run AFTER
  // the PLANS overlay's synchronous observer (which would otherwise show the flat
  // / single-shop price).
  function deferredAssert() {
    try { setTimeout(function () { try { assertBizPrice(); } catch (e) {} try { assertGrowthPrice(); } catch (e) {} }, 0); } catch (e) {}
  }

  pass();
  try { seedDownloadsFromCache(); } catch (e) {}   // reuse last-known direct links (survives API rate-limits)
  try { resolveLatestDownloads(); } catch (e) {}   // fetch the current latest .exe/.apk up front
  var tries = 0;
  var iv = setInterval(function () { pass(); assertBizPrice(); assertGrowthPrice(); if (++tries > 90) clearInterval(iv); }, 130);   // ~12s of retries
  // Card content wraps differently across widths, so re-measure the fit on resize
  // (clear our overrides first, then let the next pass grow to the new content).
  var _rz;
  try { window.addEventListener('resize', function () { clearTimeout(_rz); _rz = setTimeout(function () { try { clearCardFit(); } catch (e) {} try { ensureShops(); } catch (e) {} try { ensureGrowth(); } catch (e) {} }, 160); }); } catch (e) {}
  // Re-apply on the framework's re-renders. The observer disconnects while it
  // runs and reconnects after, so the DOM writes pass()/deferredAssert() make
  // are never observed by it - a hard guard against a self-feedback loop that
  // would peg the main thread and freeze the page.
  try {
    var mo = new MutationObserver(function () {
      try { mo.disconnect(); } catch (e) {}
      try { pass(); deferredAssert(); } catch (e) {}
      try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
