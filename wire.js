// web/subscription/wire.js
// The page IS the vendor's design mockup (a self-unpacking compiled component).
// This layer only WIRES it: pulls the sentinel-published config.json over the
// config.js defaults, and makes the "Buy now" / "Contact" buttons open a UPI +
// Google Form pay flow. Uses event delegation on document, so it keeps working
// across the mockup's segment-flip re-renders. Reuses helpers from app.js
// (window.rpos). Nothing here touches the mockup's markup or its transition.
(function () {
  var C = window.RPOS_CONFIG || (window.RPOS_CONFIG = {});

  // Observe childList changes on the whole document and re-run `fn` on each,
  // but DISCONNECT while `fn` runs and reconnect after. That makes the observer
  // blind to any DOM writes `fn` itself performs, so a re-application pass can
  // never observe its own mutation and re-fire - the guard that keeps a stray
  // unguarded write from turning into an infinite feedback loop that pegs the
  // main thread and freezes the page. Late/framework re-renders still fire it.
  function observeChildList(fn) {
    try {
      var mo = new MutationObserver(function () {
        try { mo.disconnect(); } catch (e) {}
        try { fn(); } catch (e) {}
        try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  // Sentinel-managed config.json (UPI / prices / Form / contact) merged OVER
  // the config.js defaults. Fail-open; aborts after 4s so it never blocks.
  (function () {
    var ctrl = null, t = null;
    try { ctrl = new AbortController(); t = setTimeout(function () { ctrl.abort(); }, 4000); } catch (e) {}
    var opts = ctrl ? { cache: 'no-store', signal: ctrl.signal } : { cache: 'no-store' };
    // Plain config.json (no per-load cache-buster): the GitHub Pages CDN edge
    // serves it with max-age=600, so a fresh sentinel publish shows within ~10
    // min. A unique ?v= per load would bypass the edge and hit origin on every
    // view, which is what broke the page - so we rely on the 10-min edge cache.
    fetch('config.json', opts)
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (j) { Object.assign(C, j); }
        // Derive the pay-modal PRICES from the published PLANS so the charged
        // amount always matches the displayed price; then paint the catalogue.
        if (C.PLANS && C.PLANS.length) {
          var pr = {};
          for (var i = 0; i < C.PLANS.length; i++) {
            var pp = C.PLANS[i];
            if (!pp.contact && pp.price != null && pp.price !== '' && !isNaN(Number(pp.price))) pr[pp.code] = Number(pp.price);
          }
          if (Object.keys(pr).length) C.PRICES = Object.assign({}, C.PRICES || {}, pr);
          startPlanOverlay();
        }
      })
      .catch(function () {})
      .then(function () { if (t) clearTimeout(t); });
  })();

  // ---- data-driven Plans overlay ------------------------------------------
  // The mockup bakes plan names / prices / features / the compare table into its
  // inline data. When the sentinel publishes a PLANS (+ COMPARE) block in
  // config.json, rewrite the rendered cards + compare rows from it so the live
  // page shows the vendor's current catalogue (design unchanged). Idempotent via
  // a per-node signature, and re-applied on the framework's re-renders. No PLANS
  // in config -> no-op, so the baked mockup shows unchanged. Verified against the
  // hydrated DOM (cards + real <table> compare grid).
  var PLAN_N2C = { Starter: 'starter', Growth: 'growth', Business: 'business', Enterprise: 'enterprise' };

  function planFmtPrice(p) {
    if (p.contact || p.price == null || p.price === '') return (p.price == null || p.price === '') ? 'Custom' : String(p.price);
    var n = Number(p.price);
    return isNaN(n) ? String(p.price) : n.toLocaleString('en-IN');
  }

  // The card price = the plan's per-shop rate x its shop count (planShops is
  // hoisted from below). Contact/Custom tiers keep their label. Business is
  // re-asserted dynamically by enhance.js as its spinner changes; this writes
  // the correct total on first paint so there is no flat-price flash.
  function planCardAmount(p) {
    if (p.contact || p.price == null || p.price === '' || isNaN(Number(p.price))) return planFmtPrice(p);
    return (Number(p.price) * planShops(p.code)).toLocaleString('en-IN');
  }

  function applyPlanCards(plans) {
    var by = {}, i;
    for (i = 0; i < plans.length; i++) by[plans[i].code] = plans[i];
    var faces = document.querySelectorAll('.card-face');
    for (var k = 0; k < faces.length; k++) {
      var face = faces[k], wrap = null, ch = face.children, c;
      for (c = 0; c < ch.length; c++) { if (ch[c].tagName === 'DIV' && ch[c].style && ch[c].style.zIndex === '1') { wrap = ch[c]; break; } }
      if (!wrap) continue;
      var nameEl = wrap.children[0]; if (!nameEl) continue;
      var p = by[PLAN_N2C[(nameEl.textContent || '').trim()]];
      if (!p) continue;                       // already applied (custom name) or unknown -> skip
      var sig = [p.name, p.shops, p.currency, p.price, p.per, p.cta, (p.features || []).join('|')].join('~');
      if (face.getAttribute('data-rp-plan') === sig) continue;   // idempotent
      nameEl.textContent = p.name;
      if (wrap.children[1]) wrap.children[1].textContent = p.shops || '';
      var pr = wrap.children[2];
      if (pr && pr.children.length >= 3) {
        pr.children[0].textContent = p.contact ? '' : (p.currency || '₹');
        pr.children[1].textContent = planCardAmount(p);
        pr.children[2].textContent = p.per || '';
      }
      var tg = wrap.querySelector('p'); if (tg && p.tagline) tg.textContent = p.tagline;
      var bt = wrap.querySelector('button'); if (bt && p.cta) bt.textContent = p.cta;
      var ul = wrap.querySelector('ul');
      if (ul && p.features && p.features.length) {
        var t = ul.querySelector('li');
        if (t) {
          var ls = t.getAttribute('style') || '', ic = t.children[0],
              is = ic ? ic.getAttribute('style') : '', it = ic ? ic.textContent : '✓',
              xs = t.children[1] ? t.children[1].getAttribute('style') : '';
          while (ul.firstChild) ul.removeChild(ul.firstChild);   // clear (no innerHTML: no injection surface)
          for (var fi = 0; fi < p.features.length; fi++) {
            var li = document.createElement('li'); if (ls) li.setAttribute('style', ls);
            var a = document.createElement('span'); if (is) a.setAttribute('style', is); a.textContent = it;
            var b = document.createElement('span'); if (xs) b.setAttribute('style', xs); b.textContent = p.features[fi];
            li.appendChild(a); li.appendChild(b); ul.appendChild(li);
          }
        }
      }
      face.setAttribute('data-rp-plan', sig);
    }
  }

  function applyCompare(plans, rows) {
    var table = document.querySelector('table.ctable') || document.querySelector('.ctable') || document.querySelector('table');
    if (!table) return;
    var ths = table.querySelectorAll('thead th'), h, n;
    for (h = 1; h < ths.length && (h - 1) < plans.length; h++) {    // skip the "Feature" column
      var th = ths[h], pl = plans[h - 1];
      for (n = 0; n < th.childNodes.length; n++) {
        var nd = th.childNodes[n];
        // Write ONLY when the value actually differs. This runs inside the
        // MutationObserver below; assigning textContent replaces child nodes
        // (a childList mutation) EVEN when the string is unchanged, which would
        // re-trigger the observer on every pass -> an infinite feedback loop
        // that pegs the main thread and freezes the page. The !== guard keeps
        // the header idempotent so the observer settles.
        if (nd.nodeType === 3 && nd.textContent.trim()) { if (nd.textContent !== pl.name) nd.textContent = pl.name; break; }
      }
      var sub = th.querySelector('div');                 // the "N shops" sub-label under the name
      if (sub && pl.shops && sub.textContent !== pl.shops) sub.textContent = pl.shops;
    }
    if (!rows || !rows.length) return;
    var tb = table.querySelector('tbody'); if (!tb) return;
    var trs = [], kids = tb.children, i;
    for (i = 0; i < kids.length; i++) if (kids[i].tagName === 'TR') trs.push(kids[i]);
    var data = [], trail = [], r;
    for (r = 0; r < trs.length; r++) { var c0 = trs[r].querySelector('td'); if (c0 && c0.textContent.trim() !== '') data.push(trs[r]); else trail.push(trs[r]); }
    var sig = rows.length + '::' + (rows[0] ? rows[0].label : '');
    if (table.getAttribute('data-rp-compare') === sig && data.length === rows.length) return;  // idempotent
    if (!data.length) return;
    var tmpl = data[0].cloneNode(true), d;
    for (d = 0; d < data.length; d++) data[d].parentNode.removeChild(data[d]);
    var anchor = trail.length ? trail[0] : null;
    for (var ri = 0; ri < rows.length; ri++) {
      var tr = tmpl.cloneNode(true), td = tr.children, row = rows[ri], cc;
      if (td[0]) td[0].textContent = row.label || '';
      var v = row.values || [];
      for (cc = 0; cc < 4; cc++) if (td[cc + 1]) td[cc + 1].textContent = (v[cc] != null ? v[cc] : '');
      tr.setAttribute('style', 'border-bottom:1px solid #f0f0f2' + ((ri % 2) ? ';background:#fafafb' : ''));
      if (anchor) tb.insertBefore(tr, anchor); else tb.appendChild(tr);
    }
    table.setAttribute('data-rp-compare', sig);
  }

  function applyPlans() {
    try {
      var plans = C.PLANS;
      if (!plans || !plans.length) return;    // no published catalogue -> leave the baked mockup
      applyPlanCards(plans);
      applyCompare(plans, C.COMPARE || []);
    } catch (e) { /* never break the page */ }
  }

  function startPlanOverlay() {
    // Keep the pay-modal's plan detection + titles in step with any renames.
    try {
      if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) {
        var p = C.PLANS[i]; if (p && p.code && p.name) PLAN_NAME[p.code] = p.name;
      }
    } catch (e) {}
    applyPlans();
    var tries = 0;
    var iv = setInterval(function () { applyPlans(); if (++tries > 80) clearInterval(iv); }, 150);  // ~12s of retries for late hydration
    // Re-apply on the framework's re-renders. The observer DISCONNECTS while it
    // runs applyPlans and reconnects after, so the DOM writes applyPlans makes
    // are never seen by this observer - a hard guard against self-feedback loops
    // (a single unguarded textContent write here would otherwise peg the main
    // thread and freeze the whole page).
    observeChildList(function () { applyPlans(); });
  }

  var PLAN_ORDER = ['starter', 'growth', 'business', 'enterprise'];
  var PLAN_NAME = { starter: 'Starter', growth: 'Growth', business: 'Business', enterprise: 'Enterprise' };
  var R = window.rpos || {};

  function shopPer() { var v = Number(C.SHOPS_PRICE_PER); return isFinite(v) && v > 0 ? v : 1250; }
  // Every plan's Price is a PER-SHOP rate; the displayed/charged amount is that
  // rate x the plan's shop count. Fixed tiers (Starter, Growth) use their
  // caps.max_shops (1, 2); Business uses the count the buyer picks in the
  // enhance.js spinner (rpos.businessShops). So Growth 2500 shows 5000 (x2) and
  // Business 2000 x 10 = 20000. All shop counts come from the sentinel-published
  // PLANS[].caps.max_shops, so the model is fully sentinel-driven.
  function planMaxShops(code) {
    try {
      if (C.PLANS) for (var i = 0; i < C.PLANS.length; i++) {
        var p = C.PLANS[i];
        if ((p.code || '') === code) {
          var m = p.caps && Number(p.caps.max_shops);
          return isFinite(m) && m > 0 ? m : 1;
        }
      }
    } catch (e) {}
    return 1;
  }
  function planShops(code) {
    if (code === 'business') {
      var b = Number(R.businessShops);
      return (isFinite(b) && b > 0) ? b : planMaxShops('business');
    }
    return planMaxShops(code);
  }
  function perShopRate(code) {
    return (code === 'business') ? shopPer() : (Number((C.PRICES || {})[code]) || 0);
  }
  function priceOf(p) { return perShopRate(p) * planShops(p); }
  function inr(n) { return 'Rs ' + Number(n || 0).toLocaleString('en-IN'); }

  // Phones only: the "Pay in UPI app" upi:// deep link has no handler on a
  // laptop, so we hide the button on desktop and lean on the QR there.
  function isMobile() {
    try {
      if (/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent || '')) return true;
      return ('ontouchstart' in window) && !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    } catch (e) { return false; }
  }

  // Accept a real mobile number. With a leading + treat it as E.164 (10-15
  // digits incl. country code); otherwise require a 10-digit Indian mobile
  // (6-9 leading), or 91 + such a number. Rejects junk like 1234567895658.
  function validPhone(raw) {
    var s = String(raw || '').replace(/[()\s\-]/g, '');
    if (s.charAt(0) === '+') {
      var d = s.slice(1).replace(/\D/g, '');
      return d.length >= 10 && d.length <= 15;
    }
    var n = s.replace(/\D/g, '');
    return (n.length === 10 && /^[6-9]/.test(n)) || (n.length === 12 && /^91[6-9]/.test(n));
  }

  // A stale "FILL..." payee placeholder makes some UPI apps reject the QR.
  function payeeName() {
    var pn = C.PAYEE_NAME;
    return (pn && !/FILL/i.test(pn)) ? pn : 'RasidhuPOS';
  }

  // ---- pay-modal contact: country code + inline per-field validation --------
  // Country code select (India default). The number field is national digits
  // only, capped at 10; the submitted contact is code + digits.
  var CC_LIST = [
    ['+91', 'India +91'], ['+1', 'USA/Canada +1'], ['+44', 'UK +44'],
    ['+61', 'Australia +61'], ['+971', 'UAE +971'], ['+65', 'Singapore +65'],
    ['+60', 'Malaysia +60'], ['+94', 'Sri Lanka +94'], ['+977', 'Nepal +977']
  ];
  function ccOptionsHtml() {
    var out = '';
    for (var i = 0; i < CC_LIST.length; i++) {
      out += '<option value="' + CC_LIST[i][0] + '"'
        + (CC_LIST[i][0] === '+91' ? ' selected' : '') + '>' + CC_LIST[i][1] + '</option>';
    }
    return out;
  }
  // 10-digit cap: India needs a 10-digit mobile (6-9 leading); other codes
  // accept 6-10 national digits. The code itself comes from the select.
  function validLocalPhone(cc, digits) {
    if (cc === '+91') return /^[6-9]\d{9}$/.test(digits);
    return digits.length >= 6 && digits.length <= 10;
  }
  // Errors render RED directly above the offending field (not a shared line by
  // the submit button) and turn the input border red; cleared as it's fixed.
  function setFieldError(field, msg) {
    if (!modal) return null;
    var e = modal.querySelector('[data-err-' + field + ']');
    var inp = modal.querySelector('[data-' + field + ']');
    if (e) { e.textContent = msg; e.style.display = 'block'; }
    if (inp) inp.style.borderColor = '#c0392b';
    return inp || null;
  }
  function clearFieldError(field) {
    if (!modal) return;
    var e = modal.querySelector('[data-err-' + field + ']');
    var inp = modal.querySelector('[data-' + field + ']');
    if (e) { e.style.display = 'none'; e.textContent = ''; }
    if (inp) inp.style.borderColor = '#d5d5d9';
  }
  function clearFieldErrors() { clearFieldError('email'); clearFieldError('name'); clearFieldError('contact'); }

  // ---- pay modal (built lazily, once) ----
  var modal = null, curPlan = '', curOrder = '';

  // ---- Item 4: pending-request notice (localStorage only) -----------------
  var LS_PENDING = 'rpos_pending_v1';
  function pendingMap() { try { return JSON.parse(localStorage.getItem(LS_PENDING) || '{}') || {}; } catch (e) { return {}; } }
  function isPending(email) { var e = (email || '').trim().toLowerCase(); return !!(e && pendingMap()[e]); }
  function markPending(email) {
    var e = (email || '').trim().toLowerCase(); if (!e) return;
    try { var m = pendingMap(); m[e] = 1; localStorage.setItem(LS_PENDING, JSON.stringify(m)); } catch (ex) {}
  }
  function refreshNotice() {
    if (!modal) return;
    var email = (modal.querySelector('[data-email]').value || '').trim();
    var nb = modal.querySelector('[data-notice]');
    if (!nb) return;
    nb.style.display = 'none'; nb.innerHTML = '';
    if (email && isPending(email)) {
      nb.innerHTML =
        'We already have your request for this email and it is being processed - '
        + 'keep RasidhuPOS open and it unlocks automatically. '
        + 'If it has been a while, or you need help, please '
        + '<a href="#" data-notice-support style="color:#7a5b00;font-weight:700;'
        + 'text-decoration:underline">contact support</a>.';
      var sb = nb.querySelector('[data-notice-support]');
      if (sb) sb.onclick = function (e) { e.preventDefault(); showSupport(); };
      nb.style.display = 'block';
    }
  }

  function build() {
    modal = document.createElement('div');
    modal.id = 'rpos-pay';
    modal.setAttribute('style', 'position:fixed;inset:0;background:rgba(15,15,20,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:20px 12px;z-index:2147483000;font-family:system-ui,Segoe UI,Roboto,sans-serif');
    var inpS = 'width:100%;padding:11px;border:1px solid #d5d5d9;border-radius:9px;margin-bottom:10px;box-sizing:border-box;font-size:14px;font-family:inherit';
    var lblS = 'display:block;text-align:left;font-size:12.5px;font-weight:600;color:#3a3a40;margin:2px 0 5px';
    var reqS = '<span style="color:#c0392b;margin-left:2px">*</span>';   // mandatory-field marker
    // Inline per-field error line (sits directly above its input, red). The
    // country-code select flanks the contact input.
    var errS = 'display:none;text-align:left;color:#c0392b;font-size:11.5px;font-weight:600;margin:-4px 0 6px';
    var selS = 'padding:11px 8px;border:1px solid #d5d5d9;border-radius:9px;box-sizing:border-box;font-size:14px;font-family:inherit;background:#fff;flex:0 0 auto';
    modal.innerHTML =
      '<div style="position:relative;background:#fff;max-width:640px;width:100%;margin:auto;border-radius:16px;padding:26px 24px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center">' +
      '<button data-x style="position:absolute;top:8px;right:12px;border:0;background:none;font-size:24px;line-height:1;color:#8a8a90;cursor:pointer">&times;</button>' +
      '<h3 data-plan style="margin:0 0 2px;font-size:19px;color:#19191c"></h3>' +
      '<div data-amt style="font-size:30px;font-weight:800;color:#19191c;margin:2px 0 0"></div>' +
      '<div data-amtnote style="color:#a97400;font-size:12px;font-weight:600;min-height:14px"></div>' +
      '<div data-payee style="color:#6b6b70;font-size:12.5px;margin-bottom:14px"></div>' +
      '<div data-notice style="display:none;text-align:center;background:#fff8e1;border:1px solid #f0d98a;color:#7a5b00;font-size:13px;font-weight:600;border-radius:10px;padding:10px 12px;margin:0 0 14px;line-height:1.4"></div>' +
      '<div data-qr style="display:flex;justify-content:center;min-height:200px;margin:0 auto 12px"></div>' +
      '<div data-qrhint style="color:#6b6b70;font-size:12px;line-height:1.4;margin:0 auto 12px;max-width:360px"></div>' +
      '<a data-upi href="#" style="display:inline-block;background:linear-gradient(#f5c542,#e6b325);color:#19191c;font-weight:700;padding:11px 20px;border-radius:11px;text-decoration:none;margin-bottom:16px">Pay in UPI app</a>' +
      '<div data-signin style="display:none;justify-content:center;margin-bottom:12px"></div>' +
      '<div data-fields style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));column-gap:16px;text-align:left">' +
      '<div><label style="' + lblS + '">Email (Gmail)' + reqS + '</label>' +
      '<div data-err-email style="' + errS + '"></div>' +
      '<input data-email type="email" autocomplete="email" placeholder="you@gmail.com" style="' + inpS + '"></div>' +
      '<div><label style="' + lblS + '">Full name' + reqS + '</label>' +
      '<div data-err-name style="' + errS + '"></div>' +
      '<input data-name autocomplete="name" placeholder="Your name" style="' + inpS + '"></div>' +
      '<div><label style="' + lblS + '">Contact number' + reqS + '</label>' +
      '<div data-err-contact style="' + errS + '"></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px">' +
      '<select data-cc style="' + selS + '">' + ccOptionsHtml() + '</select>' +
      '<input data-contact type="tel" inputmode="numeric" autocomplete="tel" maxlength="10" placeholder="10-digit mobile" style="' + inpS + ';flex:1;margin-bottom:0"></div></div>' +
      '<div><label style="' + lblS + '">UPI reference (UTR)</label>' +
      '<input data-utr placeholder="e.g. 4157xxxxxx" style="' + inpS + '"></div>' +
      '<div style="grid-column:1 / -1"><label style="' + lblS + '">Notes (optional)</label>' +
      '<textarea data-notes rows="2" placeholder="Anything we should know" style="' + inpS + ';resize:vertical"></textarea></div>' +
      '</div>' +
      '<div style="text-align:left;font-size:11.5px;color:#8a8a90;margin:0 0 8px">' + reqS + ' required fields</div>' +
      '<div data-err style="display:none;text-align:left;color:#c0392b;font-size:12.5px;font-weight:600;margin:2px 0 10px"></div>' +
      '<button data-paid style="width:100%;background:#c99400;color:#19191c;font-weight:800;border:0;padding:13px;border-radius:11px;cursor:pointer;font-size:15px">I have paid</button>' +
      '<div data-thanks style="display:none;color:#1a7f37;font-weight:600;margin-top:14px;line-height:1.45">Thank you. We will confirm your payment and activate your account shortly. Keep RasidhuPOS open, it unlocks automatically.</div>' +
      '</div>';
    document.body.appendChild(modal);
    // Intentionally NO backdrop/outside-click dismiss: a stray click outside must
    // not discard a half-filled pay form. Close only via the X button or Escape.
    modal.querySelector('[data-x]').onclick = hide;
    // Escape closes, but ONLY while THIS modal is open (display flips to 'none'
    // on hide, 'flex' on show). Registered once (build() runs lazily once).
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27)
          && modal && modal.style.display !== 'none') { hide(); }
    });
    modal.querySelector('[data-paid]').onclick = function () {
      var email = (modal.querySelector('[data-email]').value || '').trim();
      var name = (modal.querySelector('[data-name]').value || '').trim();
      var ccEl = modal.querySelector('[data-cc]');
      var cc = (ccEl && ccEl.value) || '+91';
      var digits = (modal.querySelector('[data-contact]').value || '').replace(/\D/g, '');
      var contact = cc + digits;                       // full number sent to us
      var utr = (modal.querySelector('[data-utr]').value || '').trim();
      var notes = (modal.querySelector('[data-notes]').value || '').trim();
      // Validate every required field locally BEFORE sending; show each error
      // in red above its own field and focus the first bad one. setFieldError
      // is always called (so all errors show); firstBad captures only the first.
      clearFieldErrors();
      var firstBad = null, el;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        el = setFieldError('email', 'Enter a valid email (Gmail).'); firstBad = firstBad || el;
      }
      if (name.length < 2) {
        el = setFieldError('name', 'Enter your name.'); firstBad = firstBad || el;
      }
      if (!validLocalPhone(cc, digits)) {
        el = setFieldError('contact', cc === '+91'
          ? 'Enter a valid 10-digit mobile number.'
          : 'Enter a valid phone number.'); firstBad = firstBad || el;
      }
      var eb = modal.querySelector('[data-err]');
      if (firstBad) { try { firstBad.focus(); } catch (e) {} return; }
      eb.style.display = 'none';
      try { R.pageEmail = email; } catch (e) {}
      var pb = modal.querySelector('[data-paid]');
      var thanks = modal.querySelector('[data-thanks]');
      var label = pb.textContent;
      pb.disabled = true; pb.style.opacity = '.6'; pb.textContent = 'Sending...';
      var sent;
      try {
        sent = R.submitPaid ? R.submitPaid(curPlan, {
          utr: utr, name: name, contact: contact, notes: notes, email: email,
          orderid: curOrder, amount: priceOf(curPlan),
          shops: planShops(curPlan) > 1 ? String(planShops(curPlan)) : ''
        }) : false;
      } catch (e) { sent = false; }
      // Show the thank-you only once a transport actually dispatched. A false
      // result means every send was refused (almost always an ad / privacy
      // blocker on the cross-site request), so tell the buyer honestly instead
      // of a thank-you that hides a lost request.
      Promise.resolve(sent).then(function (ok) {
        pb.textContent = label;
        if (ok === false) {
          eb.textContent = 'We could not send your confirmation. A browser blocker may be preventing it. '
            + 'Please try again in a private / incognito window, or email '
            + (C.SUPPORT_EMAIL || 'support') + ' with your UPI reference (UTR). Your payment is safe.';
          eb.style.display = 'block';
          pb.disabled = false; pb.style.opacity = '1';
        } else {
          markPending(email);
          thanks.style.display = 'block';
        }
      });
    };
    modal.querySelector('[data-email]').addEventListener('input', function () { refreshNotice(); clearFieldError('email'); });
    modal.querySelector('[data-name]').addEventListener('input', function () { clearFieldError('name'); });
    // Contact is national digits only, capped at 10 (the country code is the
    // separate select). Clears its inline error as the buyer corrects it.
    modal.querySelector('[data-contact]').addEventListener('input', function () {
      var s = this.value.replace(/\D/g, '').slice(0, 10);
      if (s !== this.value) this.value = s;
      clearFieldError('contact');
    });
    var ccEl = modal.querySelector('[data-cc]');
    if (ccEl) ccEl.addEventListener('change', function () { clearFieldError('contact'); });
  }
  function hide() { if (modal) modal.style.display = 'none'; }
  function show(plan) {
    if (!modal) build();
    curPlan = plan;
    curOrder = R.orderId ? R.orderId() : ('' + (new Date().getTime())).slice(-6);
    var amt = priceOf(plan);
    var email = R.currentEmail ? R.currentEmail() : (R.pageEmail || '');
    var upi = R.upiString ? R.upiString(plan, curOrder, { amount: amt, email: email }) :
      ('upi://pay?pa=' + encodeURIComponent(C.UPI_VPA || '') + '&pn=' + encodeURIComponent(payeeName()) +
       '&am=' + amt + '&cu=INR&tn=' + encodeURIComponent('RPOS-' + plan + '-' + curOrder + (email ? ' ' + email : '')));
    modal.querySelector('[data-plan]').textContent = 'RasidhuPOS ' + (PLAN_NAME[plan] || plan) + ' (yearly)';
    modal.querySelector('[data-amt]').textContent = inr(amt);
    var noteShops = planShops(plan), noteRate = perShopRate(plan);
    modal.querySelector('[data-amtnote]').textContent =
      (noteShops > 1 && noteRate > 0)
        ? ('for ' + noteShops + ' shops (Rs ' + noteRate.toLocaleString('en-IN') + ' each)') : '';
    modal.querySelector('[data-payee]').textContent = 'via UPI to ' + (C.UPI_VPA || '');
    var qb = modal.querySelector('[data-qr]'); qb.innerHTML = '';
    try { new QRCode(qb, { text: upi, width: 200, height: 200 }); }
    catch (e) { qb.textContent = 'Scan the QR with any UPI app on your phone to pay.'; }
    modal.querySelector('[data-upi]').href = upi;
    // "Pay in UPI app" is a upi:// deep link with no handler on a laptop, so it is
    // phone-only; on desktop we hide it and steer the buyer to scan the QR.
    var mob = isMobile();
    modal.querySelector('[data-upi]').style.display = mob ? 'inline-block' : 'none';
    modal.querySelector('[data-qrhint]').textContent = mob
      ? 'Tap the button to pay, or scan the QR with any UPI app.'
      : 'Scan this QR with any UPI app on your phone (GPay / PhonePe / Paytm). If your phone camera does not open it, use the scan option inside the app.';
    modal.querySelector('[data-email]').value = email;
    modal.querySelector('[data-name]').value = '';
    modal.querySelector('[data-contact]').value = '';
    var ccEl = modal.querySelector('[data-cc]'); if (ccEl) ccEl.value = '+91';
    modal.querySelector('[data-utr]').value = '';
    modal.querySelector('[data-notes]').value = '';
    clearFieldErrors();
    var eb = modal.querySelector('[data-err]'); eb.style.display = 'none'; eb.textContent = '';
    var pb = modal.querySelector('[data-paid]'); pb.disabled = false; pb.style.opacity = '1';
    modal.querySelector('[data-thanks]').style.display = 'none';
    refreshNotice();
    // Optional Google sign-in in the modal: only when no email yet and a client
    // id is configured. Rendered by enhance.js; never blocks the manual field.
    try {
      var sb = modal.querySelector('[data-signin]');
      if (!email && R.mountGoogleSignin && C.GOOGLE_CLIENT_ID) {
        sb.style.display = 'flex'; sb.innerHTML = '';
        R.mountGoogleSignin(sb, function (em) {
          if (!em) return;
          try { R.pageEmail = em; } catch (e) {}
          modal.querySelector('[data-email]').value = em;
          refreshNotice();
          sb.style.display = 'none';
        });
      } else { sb.style.display = 'none'; }
    } catch (e) {}
    modal.style.display = 'flex';
  }

  // ---- which plan does a clicked button belong to ----
  function nameHits(t) {
    var hits = [];
    for (var i = 0; i < PLAN_ORDER.length; i++) {
      var n = PLAN_NAME[PLAN_ORDER[i]];
      if (new RegExp('(^|[^A-Za-z])' + n + '([^A-Za-z]|$)').test(t)) hits.push(PLAN_ORDER[i]);
    }
    return hits;
  }
  function planOf(btn) {
    // compare-table cell -> by column index (cell 0 is the feature label)
    var td = btn.closest ? btn.closest('sc-raw-td, td, th') : null;
    if (td && td.parentElement) {
      var cells = [].slice.call(td.parentElement.children).filter(function (c) { return /sc-raw-td|td|th/i.test(c.tagName); });
      var idx = cells.indexOf(td);
      if (idx >= 1 && idx - 1 < PLAN_ORDER.length) return PLAN_ORDER[idx - 1];
    }
    // tier card -> nearest ancestor holding a plan name
    var el = btn;
    for (var i = 0; i < 8 && el; i++) {
      var hits = nameHits(el.textContent || '');
      if (hits.length >= 1) return hits[0];
      el = el.parentElement;
    }
    return '';
  }

  // ---- Customer Support popup -------------------------------------------------
  // Mirrors the desktop app's "Need Support" (Customer Support) dialog
  // (rasidhupos/widgets/support_dialog.py): the same three contacts + copy, and a
  // Subject / contact / Message form whose Send opens a prefilled email compose.
  var sModal = null;
  var SUPPORT_CONTACTS = [
    { label: 'Thillai Rajan', value: '+91 7010704136', href: 'tel:+917010704136' },
    { label: 'Mullai Rajan',  value: '+91 7010139747', href: 'tel:+917010139747' }
  ];
  function supportEmail() {
    var e = C.SUPPORT_EMAIL;
    return (e && !/FILL/i.test(e) && /@/.test(e)) ? e : 'mullairajan2000@gmail.com';
  }
  function supportToast(msg) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.setAttribute('style', 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);background:#19191c;color:#fff;font:600 13px system-ui,Segoe UI,Roboto,sans-serif;padding:9px 16px;border-radius:9px;z-index:2147483001;box-shadow:0 6px 20px rgba(0,0,0,.3)');
      document.body.appendChild(t);
      setTimeout(function () { try { document.body.removeChild(t); } catch (e) {} }, 1600);
    } catch (e) {}
  }
  function copyText(v, kind) {
    function toast() { supportToast(kind + ' copied'); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(v).then(toast, function () {}); return; }
    } catch (e) {}
    try {
      var ta = document.createElement('textarea'); ta.value = v;
      ta.setAttribute('style', 'position:fixed;top:0;left:0;opacity:0');
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta); toast();
    } catch (e) {}
  }
  // Built with DOM methods (no innerHTML): the values come from config, so this
  // keeps the injection surface at zero, matching applyPlanCards above.
  function contactRow(label, value, href, kind) {
    var row = document.createElement('div');
    row.setAttribute('style', 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f2');
    var l = document.createElement('span');
    l.setAttribute('style', 'text-align:left;color:#3a3a40;font-size:13.5px'); l.textContent = label;
    var right = document.createElement('span');
    right.setAttribute('style', 'display:flex;align-items:center;gap:8px');
    var a = document.createElement('a');
    a.setAttribute('href', href);
    a.setAttribute('style', 'color:#19191c;font-weight:600;font-size:13.5px;text-decoration:none'); a.textContent = value;
    var cp = document.createElement('button');
    cp.setAttribute('style', 'border:0;background:#f0f0f2;border-radius:7px;padding:5px 9px;cursor:pointer;font-size:12px;color:#3a3a40');
    cp.textContent = 'Copy';
    cp.onclick = function () { copyText(value, kind); };
    right.appendChild(a); right.appendChild(cp);
    row.appendChild(l); row.appendChild(right);
    return row;
  }
  function buildSupport() {
    sModal = document.createElement('div');
    sModal.id = 'rpos-support';
    sModal.setAttribute('style', 'position:fixed;inset:0;background:rgba(15,15,20,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:20px 12px;z-index:2147483000;font-family:system-ui,Segoe UI,Roboto,sans-serif');
    var inpS = 'width:100%;padding:11px;border:1px solid #d5d5d9;border-radius:9px;margin-bottom:10px;box-sizing:border-box;font-size:14px;font-family:inherit';
    var lblS = 'display:block;text-align:left;font-size:12.5px;font-weight:600;color:#3a3a40;margin:2px 0 5px';
    // Static shell only (no interpolation) - dynamic contacts appended below.
    sModal.innerHTML =
      '<div style="position:relative;background:#fff;max-width:560px;width:100%;margin:auto;border-radius:16px;padding:26px 24px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center">' +
      '<button data-sx style="position:absolute;top:8px;right:12px;border:0;background:none;font-size:24px;line-height:1;color:#8a8a90;cursor:pointer">&times;</button>' +
      '<h3 style="margin:0 0 6px;font-size:19px;color:#19191c">Customer Support</h3>' +
      '<div style="color:#6b6b70;font-size:13px;margin-bottom:14px;line-height:1.45">Reach us by phone or email, or send us a message and we\'ll get back to you.</div>' +
      '<div data-scontacts style="margin-bottom:16px"></div>' +
      '<div style="text-align:left">' +
      '<label style="' + lblS + '">Subject</label>' +
      '<input data-ssubject placeholder="Brief description of your issue" style="' + inpS + '">' +
      '<label style="' + lblS + '">Your contact details (optional)</label>' +
      '<input data-scontact placeholder="Phone or email so we can reach you" style="' + inpS + '">' +
      '<label style="' + lblS + '">Message</label>' +
      '<textarea data-smessage rows="3" placeholder="Describe your issue in detail..." style="' + inpS + ';resize:vertical"></textarea>' +
      '</div>' +
      '<div data-serr style="display:none;text-align:left;color:#c0392b;font-size:12.5px;font-weight:600;margin:2px 0 10px"></div>' +
      '<div style="display:flex;gap:10px;margin-top:6px">' +
      '<button data-scancel style="flex:1;background:#f0f0f2;color:#3a3a40;font-weight:700;border:0;padding:12px;border-radius:11px;cursor:pointer;font-size:14px">Close</button>' +
      '<button data-ssend style="flex:2;background:#c99400;color:#19191c;font-weight:800;border:0;padding:12px;border-radius:11px;cursor:pointer;font-size:15px">Send</button>' +
      '</div>' +
      '<div data-sok style="display:none;color:#1a7f37;font-weight:600;margin-top:14px;line-height:1.45">Message sent. We\'ll get back to you soon.</div>' +
      '</div>';
    document.body.appendChild(sModal);
    var cbox = sModal.querySelector('[data-scontacts]');
    for (var i = 0; i < SUPPORT_CONTACTS.length; i++) {
      var c = SUPPORT_CONTACTS[i];
      cbox.appendChild(contactRow(c.label, c.value, c.href, 'Phone number'));
    }
    var em = supportEmail();
    cbox.appendChild(contactRow('Email', em, 'mailto:' + em, 'Email'));
    // No outside-click dismiss (a stray click must not discard a typed message);
    // close only via the X, Cancel, or Escape - matching the pay modal.
    sModal.querySelector('[data-sx]').onclick = hideSupport;
    sModal.querySelector('[data-scancel]').onclick = hideSupport;
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27)
          && sModal && sModal.style.display !== 'none') { hideSupport(); }
    });
    sModal.querySelector('[data-ssend]').onclick = function () {
      var subject = (sModal.querySelector('[data-ssubject]').value || '').trim();
      var contactInfo = (sModal.querySelector('[data-scontact]').value || '').trim();
      var message = (sModal.querySelector('[data-smessage]').value || '').trim();
      var eb = sModal.querySelector('[data-serr]');
      if (!subject) { eb.textContent = 'Please enter a subject.'; eb.style.display = 'block'; return; }
      if (!message) { eb.textContent = 'Please enter a message.'; eb.style.display = 'block'; return; }
      eb.style.display = 'none';
      var body = message + (contactInfo ? ('\n\nContact details: ' + contactInfo) : '');
      // Open Gmail compose in a NEW TAB - never hand off to the machine's email
      // application (matches the desktop app's browser-compose fallback).
      var url = 'https://mail.google.com/mail/?view=cm&fs=1'
        + '&to=' + encodeURIComponent(supportEmail())
        + '&su=' + encodeURIComponent('[Support] ' + subject)
        + '&body=' + encodeURIComponent(body);
      try { window.open(url, '_blank', 'noopener'); } catch (e) {}
      sModal.querySelector('[data-sok]').style.display = 'block';
    };
  }
  function hideSupport() { if (sModal) sModal.style.display = 'none'; }
  function showSupport() {
    if (!sModal) buildSupport();
    sModal.querySelector('[data-ssubject]').value = '';
    sModal.querySelector('[data-scontact]').value = '';
    sModal.querySelector('[data-smessage]').value = '';
    var eb = sModal.querySelector('[data-serr]'); eb.style.display = 'none'; eb.textContent = '';
    sModal.querySelector('[data-sok]').style.display = 'none';
    sModal.style.display = 'flex';
  }
  // Enterprise "Contact sales" / "Buy now" route here too (the app has one unified
  // support surface). Kept as contact() so existing callers stay unchanged.
  function contact() { showSupport(); }

  document.addEventListener('click', function (e) {
    var btn = (e.target && e.target.closest) ? e.target.closest('button, a') : null;
    if (!btn) return;
    var txt = (btn.textContent || '').trim().toLowerCase();
    if (txt === 'buy now') {
      e.preventDefault(); e.stopPropagation();
      var plan = planOf(btn) || 'growth';
      if (plan === 'enterprise') { contact(); return; }
      // Gate Buy now behind Google sign-in ONLY when a Client ID is configured.
      // If it is not set, buying works exactly as before (never blocked by
      // missing config). The sign-in opens Google's own small popup window; the
      // pay modal opens only once a signed-in email comes back.
      var signedIn = R.currentEmail && R.currentEmail();
      if (C.GOOGLE_CLIENT_ID && !signedIn && R.requireSignIn) {
        R.requireSignIn(function (em) { if (em) show(plan); });
        return;
      }
      show(plan);
    } else if (txt === 'support' || txt === 'contact sales' || txt === 'contact us' || txt === 'contact') {
      e.preventDefault(); e.stopPropagation();
      showSupport();
    }
  }, true);
})();

// ---- Smoothness pass -----------------------------------------------------
// The mockup leans on paint-bound CSS animations that stutter on weaker GPUs:
//   * the header logo uses a drop-shadow blur pulse + a background-position
//     sweep (both repaint every frame);
//   * a full-page watermark trident continuously animates background-position
//     (a large repaint) while sitting at ~6% opacity, i.e. near invisible;
//   * ~20 sparkles animate transform/opacity but each carries a drop-shadow
//     filter and none are layer-promoted, so every frame repaints them.
// This pass swaps the logo effect for compositor-only transform/opacity (driven
// by the Web Animations API so a stylesheet re-render can't wipe it), silences
// the invisible watermark repaint, and promotes the sparkles to their own GPU
// layers. Net: the same look, far less per-frame paint, so shimmer + scrolling
// stay smooth. Everything is idempotent and re-applied when the framework
// re-renders. Fully guarded, so a failure just leaves the mockup as-is.
(function () {
  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

  function el(tag, css) { var e = document.createElement(tag); if (css) e.style.cssText = css; e.setAttribute('aria-hidden', 'true'); return e; }
  function running(node) { return !!(node && node.getAnimations && node.getAnimations().length); }

  // ---- header logo: smooth shimmer ----
  function patchLogo() {
    var img = document.querySelector('img[alt="Rasidhu"]');
    if (!img || !img.parentElement) return;
    var box = img.parentElement;                 // 40x40 logo container
    var glow = box.querySelector('[data-rp="glow"]');
    var band = box.querySelector('[data-rp="band"]');
    // already live -> nothing to do (guard on a real running animation, not a
    // marker attribute: the framework clones the box and cloneNode() drops WAAPI
    // animations while keeping our nodes + markers).
    if (glow && band && running(glow) && running(band)) return;
    try {
      box.style.animation = 'none';              // drop the drop-shadow blur pulse
      if (!box.style.position) box.style.position = 'relative';
      if (!glow || !band) {
        // fresh (or original mockup) box: strip the mockup's paint-bound shine
        // overlay and any stale nodes we left, then rebuild ours.
        var kids = box.querySelectorAll('span');
        for (var i = 0; i < kids.length; i++) {
          var s = kids[i].getAttribute('style') || '';
          if (kids[i].getAttribute('data-rp') || s.indexOf('mix-blend-mode') >= 0 || s.indexOf('rpSweep') >= 0) kids[i].remove();
        }
        glow = el('span', 'position:absolute;inset:-5px;z-index:0;border-radius:50%;background:radial-gradient(circle,rgba(245,197,66,.75),rgba(245,197,66,0) 68%);filter:blur(5px);pointer-events:none;opacity:.4;will-change:opacity,transform');
        glow.setAttribute('data-rp', 'glow');
        box.insertBefore(glow, box.firstChild);
        img.style.position = 'relative';
        img.style.zIndex = '1';
        var wrap = el('span', 'position:absolute;inset:0;z-index:2;overflow:hidden;border-radius:8px;pointer-events:none');
        band = el('span', 'position:absolute;top:-25%;left:0;width:42%;height:150%;background:linear-gradient(115deg,transparent,rgba(255,255,255,.9) 45%,rgba(255,244,205,.9) 55%,transparent);mix-blend-mode:screen;will-change:transform');
        band.setAttribute('data-rp', 'band');
        wrap.appendChild(band);
        box.appendChild(wrap);
      }
      if (reduce) { band.style.opacity = '0'; return; }   // no motion: hide the streak
      if (!glow.animate) return;
      glow.getAnimations().forEach(function (a) { a.cancel(); });
      band.getAnimations().forEach(function (a) { a.cancel(); });
      glow.animate(
        [{ opacity: 0.28, transform: 'scale(0.9)' },
         { opacity: 0.82, transform: 'scale(1.06)' },
         { opacity: 0.28, transform: 'scale(0.9)' }],
        { duration: 4000, iterations: Infinity, easing: 'ease-in-out' });
      band.animate(
        [{ transform: 'translateX(-160%)' },
         { transform: 'translateX(-160%)', offset: 0.18 },
         { transform: 'translateX(340%)', offset: 0.6 },
         { transform: 'translateX(340%)' }],
        { duration: 3600, iterations: Infinity, easing: 'ease-in-out' });
    } catch (e) {}
  }

  // ---- background: cut per-frame paint that competes with scrolling ----
  function tuneScene() {
    try {
      // silence the near-invisible watermark's continuous background-position
      // repaint (opacity ~6%, the sweep is imperceptible anyway)
      var sweeps = document.querySelectorAll('span[style*="rpSweep"]');
      for (var i = 0; i < sweeps.length; i++) {
        if (sweeps[i].getAttribute('data-rp') === 'band') continue;   // our logo band
        if (!sweeps[i].getAttribute('data-rp-tuned')) {
          sweeps[i].style.animation = 'none';
          sweeps[i].setAttribute('data-rp-tuned', '1');
        }
      }
      // promote sparkles to their own GPU layers so their transform/opacity
      // animation stops repainting the drop-shadow every frame (keeps the look)
      var sp = document.querySelectorAll('#rp-sparkles > div');
      for (var j = 0; j < sp.length; j++) {
        if (!sp[j].getAttribute('data-rp-tuned')) {
          sp[j].style.willChange = 'transform, opacity';
          sp[j].setAttribute('data-rp-tuned', '1');
        }
      }
    } catch (e) {}
  }

  function pass() { patchLogo(); tuneScene(); }

  pass();
  var tries = 0;
  var iv = setInterval(function () { pass(); if (++tries > 60) clearInterval(iv); }, 100);
  // re-apply if the framework re-renders. Watch childList only, so the page's
  // constant mousemove inline-style churn never triggers this. The observer
  // disconnects while pass() runs and reconnects after, so pass()'s own DOM
  // writes are never observed - no self-feedback loop can freeze the page.
  try {
    var mo = new MutationObserver(function () {
      try { mo.disconnect(); } catch (e) {}
      try { pass(); } catch (e) {}
      try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
