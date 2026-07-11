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

  rpos.upiString = function (plan, orderid) {
    var amt = rpos.priceOf(plan);
    return "upi://pay?pa=" + encodeURIComponent(C.UPI_VPA) +
      "&pn=" + encodeURIComponent(C.PAYEE_NAME) +
      "&am=" + amt + "&cu=INR" +
      "&tn=" + encodeURIComponent("RPOS-" + plan + "-" + orderid);
  };

  // Fire-and-forget submit to the Google Form via a hidden iframe (no CORS read,
  // no login). Returns nothing; the UI shows a thank-you regardless.
  rpos.submitPaid = function (plan, utr, orderid) {
    var q = rpos.qs(), F = C.FORM_FIELDS || {};
    var data = {};
    data[F.email] = q.email || "";
    data[F.plan] = plan;
    data[F.amount] = String(rpos.priceOf(plan));
    data[F.utr] = utr || "";
    data[F.orderid] = orderid || "";
    data[F.source] = q.src || "web";
    data[F.appversion] = q.v || "";
    data[F.client_ts] = new Date().toISOString();

    var iframe = document.createElement("iframe");
    iframe.name = "rpos_sink"; iframe.style.display = "none";
    document.body.appendChild(iframe);
    var form = document.createElement("form");
    form.action = C.FORM_ACTION; form.method = "POST"; form.target = "rpos_sink";
    for (var k in data) {
      if (!k) continue;
      var inp = document.createElement("input");
      inp.type = "hidden"; inp.name = k; inp.value = data[k];
      form.appendChild(inp);
    }
    document.body.appendChild(form);
    form.submit();
  };

  // Wire the page after DOM ready (openPay/renderQR defined in index.html inline
  // where the modal DOM lives; app.js exposes the pure helpers above).
  rpos.currentOrder = null;
})();
