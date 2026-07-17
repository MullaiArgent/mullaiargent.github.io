// web/subscription/config.js
// Built-in fallback config. The page fetches config.json (published by the
// sentinel's Storefront tab) at runtime and shallow-merges it OVER these
// values, so the vendor edits UPI / prices / Form ids / contact / download
// links in the sentinel without redeploying this page. See README.md.
window.RPOS_CONFIG = {
  UPI_VPA: "mullairajan@ybl",                // where money lands
  PAYEE_NAME: "RasidhuPOS",
  // INR / year (sentinel config.json overrides). Business is charged per shop:
  // the page shows SHOPS_PRICE_PER x (chosen shops), so business here is the
  // per-shop rate, not the final amount.
  PRICES: { starter: 1500, growth: 2500, business: 1250 },
  // Google Form (RasidhuPOS subscription requests). Editable in the sentinel Storefront tab.
  // name / contact are the mandatory buyer fields; notes + shops are extra columns.
  // Add the matching questions to the Form, then paste their entry.<id> here (or
  // in the sentinel). Leave blank until the question exists: blank = not posted.
  FORM_ACTION: "https://docs.google.com/forms/d/e/1FAIpQLSd22a8xVrUd81lAtZmXp7IDMXwa2sP26C-hKNS7pHJaccb6Rg/formResponse",
  FORM_FIELDS: {
    email: "entry.414386988", plan: "entry.1174638699", amount: "entry.670930799",
    utr: "entry.55718535", orderid: "entry.854898479", source: "entry.1945180516",
    appversion: "entry.378284466", client_ts: "entry.128503365",
    name: "", contact: "", notes: "", shops: ""
  },
  SUPPORT_EMAIL: "FILL@example.com",
  // Customer-support Google Form (separate from the payment Form above). When
  // set, "Contact support" posts the message headlessly to this Form (no Gmail
  // tab) and the "sent" note shows only on success. Requires Google sign-in when
  // GOOGLE_CLIENT_ID is set. Create a support Form, add the questions, and paste
  // SUPPORT_FORM_ACTION + the entry.<id>s here (or in the sentinel Storefront).
  // Leave SUPPORT_FORM_ACTION blank to keep support on the phone/email contacts.
  SUPPORT_FORM_ACTION: "",
  SUPPORT_FIELDS: {
    subject: "", message: "", contact: "", email: "", name: "",
    appversion: "", client_ts: ""
  },
  WHATSAPP: "FILL_91XXXXXXXXXX",             // digits only, country code, no +
  BUSINESS_NAME: "FILL Business Name",
  CITY: "FILL City, India",
  GSTIN: "",                                  // "" = not registered -> GST line hidden

  // Optional "Sign in with Google" on the page (Google Identity Services). Leave
  // blank to keep the plain email field. Set a Google OAuth Client ID whose
  // "Authorised JavaScript origins" include this Pages origin to switch it on.
  // When set, it ALSO gates "Buy now": buyers must complete Google sign-in (in a
  // small popup window) before the pay modal opens. Blank = no gate (buy as before).
  GOOGLE_CLIENT_ID: "",

  // Business tier is priced per shop: price = shops * SHOPS_PRICE_PER, minimum
  // SHOPS_MIN shops, the field starts at SHOPS_DEFAULT. Self-serve tops out at
  // SHOPS_MAX shops; beyond that the card steers the buyer to contact sales and
  // highlights the Enterprise card. (A published PLANS business caps.max_shops,
  // if present, wins over SHOPS_MAX.)
  SHOPS_MIN: 3,
  SHOPS_DEFAULT: 4,
  SHOPS_MAX: 10,
  SHOPS_PRICE_PER: 1250,

  // Download links, sentinel-managed. These point STRAIGHT at the release asset
  // so the Download button downloads the file directly (no GitHub page). The
  // sentinel repoints them at the current .exe / .apk each release so the button
  // always serves the latest build.
  RELEASES_URL: "https://github.com/MullaiArgent/RasidhuPOS-releases/releases/latest",
  DOWNLOAD_WINDOWS_URL: "https://github.com/MullaiArgent/RasidhuPOS-releases/releases/download/v1.5.15/RasidhuPOS-Setup-1.5.15.exe",
  DOWNLOAD_ANDROID_URL: "https://github.com/MullaiArgent/RasidhuPOS-releases/releases/download/v1.5.15/RasidhuPOS-Mobile-1.5.15.apk"
};
