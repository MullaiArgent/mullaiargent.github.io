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
    // Guard the payee name: a stale "FILL..." placeholder in config makes some UPI
    // apps reject the pn=, so fall back to a valid name.
    var pn = (C.PAYEE_NAME && !/FILL/i.test(C.PAYEE_NAME)) ? C.PAYEE_NAME : "RasidhuPOS";
    return "upi://pay?pa=" + encodeURIComponent(C.UPI_VPA) +
      "&pn=" + encodeURIComponent(pn) +
      "&am=" + amt + "&cu=INR" +
      "&tn=" + encodeURIComponent(tn);
  };

  // Coerce any Google Form link to its POST submit endpoint (.../formResponse).
  // The sentinel-published FORM_ACTION can carry the VIEW link
  // (.../viewform?usp=...) or an /edit link; a response POSTed there records
  // NOTHING (Google serves the form page instead) so the responses sheet stays
  // empty while this modal still shows a thank-you - the #1 reason a paid click
  // never lands. Rebuild the canonical submit URL from the form id, dropping any
  // /u/N segment, path and query. Non-Form input is left unchanged.
  rpos.formAction = function (u) {
    u = String(u || "").trim();
    var m = /docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9\-_]+)/i.exec(u);
    if (!m) return u;
    return "https://docs.google.com/forms/d/" + (m[1] ? "e/" : "") + m[2] + "/formResponse";
  };

  // Submit the paid-subscription request to the Google Form. opts: { utr, name,
  // contact, notes, email, amount, shops, orderid }. (A bare string second arg is
  // still accepted as the UTR for older callers.)
  //
  // Returns a Promise<boolean>. Tries three transports in order: a no-cors fetch
  // (primary, and the ONLY one that can DETECT a block - it rejects when an ad /
  // privacy extension kills the cross-site request), then navigator.sendBeacon,
  // then the classic hidden-iframe form POST. Resolves true when a transport
  // dispatched, and false only when every detectable transport was refused, so
  // the caller can show honest feedback instead of a false thank-you (a blocker
  // silently eating the request is a real reason a customer's paid click never
  // lands - it worked in incognito, where extensions are off). The vendor dedupes
  // by orderid, so the belt-and-suspenders double send on the blocked path is
  // harmless.
  // Low-level: POST form-encoded pairs ([[fieldId, value], ...]) to a Google
  // Form, skipping any pair whose field id is blank (not configured). Three
  // transports in order - a no-cors fetch (primary, and the ONLY one that can
  // DETECT a block, since it rejects when an ad / privacy extension kills the
  // cross-site request), then navigator.sendBeacon, then the classic
  // hidden-iframe form POST. Returns Promise<boolean>: true when a transport
  // dispatched, false only when every detectable transport was refused, so the
  // caller can show honest feedback instead of a false thank-you. Shared by
  // submitPaid and submitSupport (the vendor dedupes, so the belt-and-suspenders
  // double send on the blocked path is harmless).
  rpos.submitForm = function (action, pairs) {
    action = rpos.formAction(action);
    var used = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      if (pairs[i] && pairs[i][0]) used.push(pairs[i]);   // field id not configured -> skip
    }
    var parts = [];
    for (var k = 0; k < used.length; k++) {
      parts.push(encodeURIComponent(used[k][0]) + "=" + encodeURIComponent(used[k][1]));
    }
    var bodyStr = parts.join("&");

    function iframePost() {                          // last resort; cannot confirm
      try {
        var iframe = document.createElement("iframe");
        iframe.name = "rpos_sink"; iframe.style.display = "none";
        document.body.appendChild(iframe);
        var form = document.createElement("form");
        form.action = action; form.method = "POST"; form.target = "rpos_sink";
        for (var j = 0; j < used.length; j++) {
          var inp = document.createElement("input");
          inp.type = "hidden"; inp.name = used[j][0]; inp.value = used[j][1];
          form.appendChild(inp);
        }
        document.body.appendChild(form);
        form.submit();
        return true;
      } catch (e) { return false; }
    }
    function beaconPost() {
      try {
        if (!navigator.sendBeacon) return false;
        var blob = new Blob([bodyStr], { type: "application/x-www-form-urlencoded;charset=UTF-8" });
        return !!navigator.sendBeacon(action, blob);
      } catch (e) { return false; }
    }

    return new Promise(function (resolve) {
      var settled = false;
      function done(ok) { if (!settled) { settled = true; resolve(ok); } }
      if (window.fetch) {
        try {
          fetch(action, {
            method: "POST", mode: "no-cors", keepalive: true,
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: bodyStr
          }).then(function () { done(true); })
            .catch(function () {                     // blocked -> try the rest, then be honest
              var ok = beaconPost();
              iframePost();
              done(ok);
            });
          return;
        } catch (e) { /* fetch threw synchronously -> fall through */ }
      }
      if (beaconPost()) { done(true); return; }
      done(iframePost());
    });
  };

  // Submit the paid-subscription request to the Google Form. opts: { utr, name,
  // contact, notes, email, amount, shops, orderid }. (A bare string second arg
  // is still accepted as the UTR for older callers.) Returns Promise<boolean>.
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
    return rpos.submitForm(C.FORM_ACTION, pairs);
  };

  // Submit a support message to the (separate) support Google Form. opts:
  // { subject, message, contact, email, name }. Returns Promise<boolean>. When
  // no support form is configured (SUPPORT_FORM_ACTION / SUPPORT_FIELDS blank),
  // resolves FALSE so the caller shows an honest fallback (use the phone / email
  // contacts) rather than a false "message sent".
  rpos.submitSupport = function (opts) {
    opts = opts || {};
    var action = C.SUPPORT_FORM_ACTION || "";
    var S = C.SUPPORT_FIELDS || {};
    if (!action) return Promise.resolve(false);
    var q = rpos.qs();
    var pairs = [
      [S.subject, opts.subject || ""],
      [S.message, opts.message || ""],
      [S.contact, opts.contact || ""],
      [S.email, opts.email || rpos.currentEmail()],
      [S.name, opts.name || rpos.pageName || ""],
      [S.appversion, q.v || ""],
      [S.client_ts, new Date().toISOString()]
    ];
    var any = false;
    for (var i = 0; i < pairs.length; i++) { if (pairs[i][0]) { any = true; break; } }
    if (!any) return Promise.resolve(false);
    return rpos.submitForm(action, pairs);
  };

  // Wire the page after DOM ready (openPay/renderQR defined in index.html inline
  // where the modal DOM lives; app.js exposes the pure helpers above).
  rpos.currentOrder = null;
})();
