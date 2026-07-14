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
        pr.children[1].textContent = planFmtPrice(p);
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
  function priceOf(p) {
    // Business is priced per shop (enhance.js owns rpos.businessShops + the field).
    if (p === 'business' && R.businessShops) return R.businessShops * shopPer();
    return R.priceOf ? R.priceOf(p) : ((C.PRICES || {})[p] || 0);
  }
  function inr(n) { return 'Rs ' + Number(n || 0).toLocaleString('en-IN'); }

  // ---- pay modal (built lazily, once) ----
  var modal = null, curPlan = '', curOrder = '';
  function build() {
    modal = document.createElement('div');
    modal.id = 'rpos-pay';
    modal.setAttribute('style', 'position:fixed;inset:0;background:rgba(15,15,20,.55);display:none;align-items:center;justify-content:center;z-index:2147483000;font-family:system-ui,Segoe UI,Roboto,sans-serif');
    var inpS = 'width:100%;padding:11px;border:1px solid #d5d5d9;border-radius:9px;margin-bottom:10px;box-sizing:border-box;font-size:14px;font-family:inherit';
    var lblS = 'display:block;text-align:left;font-size:12.5px;font-weight:600;color:#3a3a40;margin:2px 0 5px';
    modal.innerHTML =
      '<div style="position:relative;background:#fff;max-width:430px;width:92%;max-height:92vh;overflow:auto;border-radius:16px;padding:26px 24px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center">' +
      '<button data-x style="position:absolute;top:8px;right:12px;border:0;background:none;font-size:24px;line-height:1;color:#8a8a90;cursor:pointer">&times;</button>' +
      '<h3 data-plan style="margin:0 0 2px;font-size:19px;color:#19191c"></h3>' +
      '<div data-amt style="font-size:30px;font-weight:800;color:#19191c;margin:2px 0 0"></div>' +
      '<div data-amtnote style="color:#a97400;font-size:12px;font-weight:600;min-height:14px"></div>' +
      '<div data-payee style="color:#6b6b70;font-size:12.5px;margin-bottom:14px"></div>' +
      '<div data-qr style="display:flex;justify-content:center;min-height:200px;margin:0 auto 12px"></div>' +
      '<a data-upi href="#" style="display:inline-block;background:linear-gradient(#f5c542,#e6b325);color:#19191c;font-weight:700;padding:11px 20px;border-radius:11px;text-decoration:none;margin-bottom:16px">Pay in UPI app</a>' +
      '<div data-signin style="display:none;justify-content:center;margin-bottom:12px"></div>' +
      '<label style="' + lblS + '">Email (Gmail)</label>' +
      '<input data-email type="email" autocomplete="email" placeholder="you@gmail.com" style="' + inpS + '">' +
      '<label style="' + lblS + '">Full name</label>' +
      '<input data-name autocomplete="name" placeholder="Your name" style="' + inpS + '">' +
      '<label style="' + lblS + '">Contact number</label>' +
      '<input data-contact type="tel" autocomplete="tel" placeholder="10-digit mobile" style="' + inpS + '">' +
      '<label style="' + lblS + '">UPI reference (UTR)</label>' +
      '<input data-utr placeholder="e.g. 4157xxxxxx" style="' + inpS + '">' +
      '<label style="' + lblS + '">Notes (optional)</label>' +
      '<textarea data-notes rows="2" placeholder="Anything we should know" style="' + inpS + ';resize:vertical"></textarea>' +
      '<div data-err style="display:none;text-align:left;color:#c0392b;font-size:12.5px;font-weight:600;margin:2px 0 10px"></div>' +
      '<button data-paid style="width:100%;background:#c99400;color:#19191c;font-weight:800;border:0;padding:13px;border-radius:11px;cursor:pointer;font-size:15px">I have paid</button>' +
      '<div data-thanks style="display:none;color:#1a7f37;font-weight:600;margin-top:14px;line-height:1.45">Thank you. We will confirm your payment and activate your account shortly. Keep RasidhuPOS open, it unlocks automatically.</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) hide(); });
    modal.querySelector('[data-x]').onclick = hide;
    modal.querySelector('[data-paid]').onclick = function () {
      var email = (modal.querySelector('[data-email]').value || '').trim();
      var name = (modal.querySelector('[data-name]').value || '').trim();
      var contact = (modal.querySelector('[data-contact]').value || '').trim();
      var utr = (modal.querySelector('[data-utr]').value || '').trim();
      var notes = (modal.querySelector('[data-notes]').value || '').trim();
      var digits = contact.replace(/[^\d]/g, '');
      var err = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err = 'Please enter a valid email (Gmail).';
      else if (name.length < 2) err = 'Please enter your name.';
      else if (digits.length < 8) err = 'Please enter a valid contact number.';
      var eb = modal.querySelector('[data-err]');
      if (err) { eb.textContent = err; eb.style.display = 'block'; return; }
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
          shops: curPlan === 'business' ? (R.businessShops || '') : ''
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
          thanks.style.display = 'block';
        }
      });
    };
  }
  function hide() { if (modal) modal.style.display = 'none'; }
  function show(plan) {
    if (!modal) build();
    curPlan = plan;
    curOrder = R.orderId ? R.orderId() : ('' + (new Date().getTime())).slice(-6);
    var amt = priceOf(plan);
    var email = R.currentEmail ? R.currentEmail() : (R.pageEmail || '');
    var upi = R.upiString ? R.upiString(plan, curOrder, { amount: amt, email: email }) :
      ('upi://pay?pa=' + encodeURIComponent(C.UPI_VPA || '') + '&pn=' + encodeURIComponent(C.PAYEE_NAME || 'RasidhuPOS') +
       '&am=' + amt + '&cu=INR&tn=' + encodeURIComponent('RPOS-' + plan + '-' + curOrder + (email ? ' ' + email : '')));
    modal.querySelector('[data-plan]').textContent = 'RasidhuPOS ' + (PLAN_NAME[plan] || plan) + ' (yearly)';
    modal.querySelector('[data-amt]').textContent = inr(amt);
    modal.querySelector('[data-amtnote]').textContent =
      (plan === 'business' && R.businessShops)
        ? ('for ' + R.businessShops + ' shops (Rs ' + shopPer().toLocaleString('en-IN') + ' each)') : '';
    modal.querySelector('[data-payee]').textContent = 'via UPI to ' + (C.UPI_VPA || '');
    var qb = modal.querySelector('[data-qr]'); qb.innerHTML = '';
    try { new QRCode(qb, { text: upi, width: 200, height: 200 }); }
    catch (e) { qb.textContent = 'Open the button below on your phone to pay.'; }
    modal.querySelector('[data-upi]').href = upi;
    modal.querySelector('[data-email]').value = email;
    modal.querySelector('[data-name]').value = '';
    modal.querySelector('[data-contact]').value = '';
    modal.querySelector('[data-utr]').value = '';
    modal.querySelector('[data-notes]').value = '';
    var eb = modal.querySelector('[data-err]'); eb.style.display = 'none'; eb.textContent = '';
    var pb = modal.querySelector('[data-paid]'); pb.disabled = false; pb.style.opacity = '1';
    modal.querySelector('[data-thanks]').style.display = 'none';
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

  function contact() {
    if (C.SUPPORT_EMAIL) { window.location.href = 'mailto:' + C.SUPPORT_EMAIL + '?subject=' + encodeURIComponent('RasidhuPOS Enterprise enquiry'); }
    else { window.location.href = 'contact.html'; }
  }

  document.addEventListener('click', function (e) {
    var btn = (e.target && e.target.closest) ? e.target.closest('button, a') : null;
    if (!btn) return;
    var txt = (btn.textContent || '').trim().toLowerCase();
    if (txt === 'buy now') {
      e.preventDefault(); e.stopPropagation();
      var plan = planOf(btn) || 'growth';
      if (plan === 'enterprise') { contact(); return; }
      show(plan);
    } else if (txt === 'contact sales' || txt === 'contact us' || txt === 'contact') {
      e.preventDefault(); e.stopPropagation();
      contact();
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
