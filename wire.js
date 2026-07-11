// web/subscription/wire.js
// The page IS the vendor's design mockup (a self-unpacking compiled component).
// This layer only WIRES it: pulls the sentinel-published config.json over the
// config.js defaults, and makes the "Buy now" / "Contact" buttons open a UPI +
// Google Form pay flow. Uses event delegation on document, so it keeps working
// across the mockup's segment-flip re-renders. Reuses helpers from app.js
// (window.rpos). Nothing here touches the mockup's markup or its transition.
(function () {
  var C = window.RPOS_CONFIG || (window.RPOS_CONFIG = {});

  // Sentinel-managed config.json (UPI / prices / Form / contact) merged OVER
  // the config.js defaults. Fail-open; aborts after 4s so it never blocks.
  (function () {
    var ctrl = null, t = null;
    try { ctrl = new AbortController(); t = setTimeout(function () { ctrl.abort(); }, 4000); } catch (e) {}
    var opts = ctrl ? { cache: 'no-store', signal: ctrl.signal } : { cache: 'no-store' };
    fetch('config.json', opts)
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) { if (j) { Object.assign(C, j); } })
      .catch(function () {})
      .then(function () { if (t) clearTimeout(t); });
  })();

  var PLAN_ORDER = ['starter', 'growth', 'business', 'enterprise'];
  var PLAN_NAME = { starter: 'Starter', growth: 'Growth', business: 'Business', enterprise: 'Enterprise' };
  var R = window.rpos || {};

  function priceOf(p) { return R.priceOf ? R.priceOf(p) : ((C.PRICES || {})[p] || 0); }
  function inr(n) { return 'Rs ' + Number(n || 0).toLocaleString('en-IN'); }

  // ---- pay modal (built lazily, once) ----
  var modal = null, curPlan = '', curOrder = '';
  function build() {
    modal = document.createElement('div');
    modal.id = 'rpos-pay';
    modal.setAttribute('style', 'position:fixed;inset:0;background:rgba(15,15,20,.55);display:none;align-items:center;justify-content:center;z-index:2147483000;font-family:system-ui,Segoe UI,Roboto,sans-serif');
    modal.innerHTML =
      '<div style="position:relative;background:#fff;max-width:430px;width:92%;border-radius:16px;padding:26px 24px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center">' +
      '<button data-x style="position:absolute;top:8px;right:12px;border:0;background:none;font-size:24px;line-height:1;color:#8a8a90;cursor:pointer">&times;</button>' +
      '<h3 data-plan style="margin:0 0 2px;font-size:19px;color:#19191c"></h3>' +
      '<div data-amt style="font-size:30px;font-weight:800;color:#19191c;margin:2px 0 0"></div>' +
      '<div data-payee style="color:#6b6b70;font-size:12.5px;margin-bottom:16px"></div>' +
      '<div data-qr style="display:flex;justify-content:center;min-height:200px;margin:0 auto 12px"></div>' +
      '<a data-upi href="#" style="display:inline-block;background:linear-gradient(#f5c542,#e6b325);color:#19191c;font-weight:700;padding:11px 20px;border-radius:11px;text-decoration:none;margin-bottom:16px">Pay in UPI app</a>' +
      '<div style="text-align:left;font-size:13px;color:#3a3a40;margin-bottom:6px">After paying, enter your UPI reference (UTR):</div>' +
      '<input data-utr placeholder="e.g. 4157xxxxxx" style="width:100%;padding:11px;border:1px solid #d5d5d9;border-radius:9px;margin-bottom:12px;box-sizing:border-box;font-size:14px">' +
      '<button data-paid style="width:100%;background:#c99400;color:#19191c;font-weight:800;border:0;padding:13px;border-radius:11px;cursor:pointer;font-size:15px">I have paid</button>' +
      '<div data-thanks style="display:none;color:#1a7f37;font-weight:600;margin-top:14px;line-height:1.45">Thank you. We will confirm your payment and activate your account shortly. Keep RasidhuPOS open, it unlocks automatically.</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) hide(); });
    modal.querySelector('[data-x]').onclick = hide;
    modal.querySelector('[data-paid]').onclick = function () {
      var utr = (modal.querySelector('[data-utr]').value || '').trim();
      try { if (R.submitPaid) R.submitPaid(curPlan, utr, curOrder); } catch (e) {}
      modal.querySelector('[data-thanks]').style.display = 'block';
    };
  }
  function hide() { if (modal) modal.style.display = 'none'; }
  function show(plan) {
    if (!modal) build();
    curPlan = plan;
    curOrder = R.orderId ? R.orderId() : ('' + (new Date().getTime())).slice(-6);
    var upi = R.upiString ? R.upiString(plan, curOrder) :
      ('upi://pay?pa=' + encodeURIComponent(C.UPI_VPA || '') + '&pn=' + encodeURIComponent(C.PAYEE_NAME || 'RasidhuPOS') +
       '&am=' + priceOf(plan) + '&cu=INR&tn=' + encodeURIComponent('RPOS-' + plan + '-' + curOrder));
    modal.querySelector('[data-plan]').textContent = 'RasidhuPOS ' + (PLAN_NAME[plan] || plan) + ' (yearly)';
    modal.querySelector('[data-amt]').textContent = inr(priceOf(plan));
    modal.querySelector('[data-payee]').textContent = 'via UPI to ' + (C.UPI_VPA || '');
    var qb = modal.querySelector('[data-qr]'); qb.innerHTML = '';
    try { new QRCode(qb, { text: upi, width: 200, height: 200 }); }
    catch (e) { qb.textContent = 'Open the button below on your phone to pay.'; }
    modal.querySelector('[data-upi]').href = upi;
    modal.querySelector('[data-utr]').value = '';
    modal.querySelector('[data-thanks]').style.display = 'none';
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
