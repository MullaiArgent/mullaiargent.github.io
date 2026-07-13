// web/subscription/app.js
(function () {
  var C = window.RPOS_CONFIG || {};
  var rpos = window.rpos = {};

  rpos.qs = function () {
    var o = {}, s = location.search.replace(/^\?/, "").split("&");
    for (var i = 0; i < s.length; i++) {
      if (!s[i]) continue;
      var kv = s[i].split("=");
      o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    }
    return o;
  };

  rpos.priceOf = function (plan) { return (C.PRICES || {})[plan] || 0; };

  rpos.orderId = function () {
    var a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  };

  // The email shown / signed in on the page (set by enhance.js from ?email= or a
  // Google sign-in). Falls back to the query string so app.js stays usable alone.
  rpos.currentEmail = function () {
    return rpos.pageEmail || rpos.qs().email || "";
  };

  // opts: { amount, email }. The amount defaults to the plan's catalogue price;
  // pass it explicitly for per-shop tiers (Business) whose price is dynamic. The
  // buyer's email is folded into the UPI transaction note so it shows in the
  // payer's UPI app and on the vendor's statement (kept short; some apps trim it).
  rpos.upiString = function (plan, orderid, opts) {
    opts = opts || {};
    var amt = (opts.amount != null) ? opts.amount : rpos.priceOf(plan);
    var email = opts.email || rpos.currentEmail();
    var tn = "RPOS-" + plan + "-" + orderid + (email ? " " + email : "");
    return "upi://pay?pa=" + encodeURIComponent(C.UPI_VPA) +
      "&pn=" + encodeURIComponent(C.PAYEE_NAME) +
      "&am=" + amt + "&cu=INR" +
      "&tn=" + encodeURIComponent(tn);
  };

  // Fire-and-forget submit to the Google Form via a hidden iframe (no CORS read,
  // no login). opts: { utr, name, contact, notes, email, amount, shops, orderid }.
  // (A bare string second arg is still accepted as the UTR for older callers.)
  // Returns nothing; the UI shows a thank-you regardless.
  rpos.submitPaid = function (plan, opts, orderid) {
    if (typeof opts === "string") opts = { utr: opts, orderid: orderid };
    opts = opts || {};
    var q = rpos.qs(), F = C.FORM_FIELDS || {};
    var amount = (opts.amount != null) ? opts.amount : rpos.priceOf(plan);
    var pairs = [
      [F.email, opts.email || rpos.currentEmail()],
      [F.plan, plan],
      [F.amount, String(amount)],
      [F.utr, opts.utr || ""],
      [F.orderid, opts.orderid || orderid || ""],
      [F.source, q.src || "web"],
      [F.appversion, q.v || ""],
      [F.client_ts, new Date().toISOString()],
      [F.name, opts.name || ""],
      [F.contact, opts.contact || ""],
      [F.notes, opts.notes || ""],
      [F.shops, (opts.shops != null && opts.shops !== "") ? String(opts.shops) : ""]
    ];

    var iframe = document.createElement("iframe");
    iframe.name = "rpos_sink"; iframe.style.display = "none";
    document.body.appendChild(iframe);
    var form = document.createElement("form");
    form.action = C.FORM_ACTION; form.method = "POST"; form.target = "rpos_sink";
    for (var i = 0; i < pairs.length; i++) {
      var name = pairs[i][0];
      if (!name) continue;                         // field id not configured -> skip
      var inp = document.createElement("input");
      inp.type = "hidden"; inp.name = name; inp.value = pairs[i][1];
      form.appendChild(inp);
    }
    document.body.appendChild(form);
    form.submit();
  };

  // Wire the page after DOM ready (openPay/renderQR defined in index.html inline
  // where the modal DOM lives; app.js exposes the pure helpers above).
  rpos.currentOrder = null;
})();
