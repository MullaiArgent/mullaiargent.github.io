// web/subscription/config.js
// Built-in fallback config. The page fetches config.json (published by the
// sentinel's Storefront tab) at runtime and shallow-merges it OVER these
// values, so the vendor edits UPI / prices / Form ids / contact in the sentinel
// without redeploying this page. See README.md.
window.RPOS_CONFIG = {
  UPI_VPA: "mullairajan@ybl",                // where money lands
  PAYEE_NAME: "FILL Business Name",
  PRICES: { starter: 9990, growth: 17990, business: 79990 }, // INR / year
  // Google Form (RasidhuPOS subscription requests). Editable in the sentinel Storefront tab.
  FORM_ACTION: "https://docs.google.com/forms/d/e/1FAIpQLSd22a8xVrUd81lAtZmXp7IDMXwa2sP26C-hKNS7pHJaccb6Rg/formResponse",
  FORM_FIELDS: {
    email: "entry.414386988", plan: "entry.1174638699", amount: "entry.670930799",
    utr: "entry.55718535", orderid: "entry.854898479", source: "entry.1945180516",
    appversion: "entry.378284466", client_ts: "entry.128503365"
  },
  SUPPORT_EMAIL: "FILL@example.com",
  WHATSAPP: "FILL_91XXXXXXXXXX",             // digits only, country code, no +
  BUSINESS_NAME: "FILL Business Name",
  CITY: "FILL City, India",
  GSTIN: ""                                   // "" = not registered -> GST line hidden
};
