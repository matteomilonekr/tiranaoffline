import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const analytics = read("../public/tirana/assets/analytics.js");
const offer = read("../public/tirana/offerta/index.html");
const checkout = read("../public/tirana/checkout/index.html");
const thankYou = read("../public/tirana/thank-you/index.html");
const privacy = read("../public/tirana/privacy/index.html");
const vercel = JSON.parse(read("../vercel.json"));

const PLAN_IDS = [
  "solo-mid",
  "solo-full",
  "agency-mid",
  "agency-full",
  "company-mid",
  "company-full",
];

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function analyticsHarness(savedConsent = null, options = {}) {
  const scripts = [];
  const scriptElements = [];
  const localStorage = options.localStorage || storage(savedConsent ? {
    "tirana.analytics.consent.v1": JSON.stringify(savedConsent),
  } : {});
  const sessionStorage = options.sessionStorage || storage();
  const document = {
    readyState: "loading",
    currentScript: { dataset: { analyticsContext: options.context || "generic" } },
    cookie: options.cookie || "",
    head: {
      appendChild(element) {
        if (!element.src) return;
        scripts.push(element.src);
        scriptElements.push(element);
        if (options.autoLoad !== false) element.onload?.();
      },
    },
    createElement(tagName) {
      return { tagName, dataset: {}, async: false, src: "" };
    },
    addEventListener() {},
  };
  const window = {
    localStorage,
    sessionStorage,
    crypto: { randomUUID: () => "flow-uuid" },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    addEventListener() {},
    dispatchEvent() {},
    location: {
      href: options.href || "https://www.tiranaoffline.com/checkout?plan=solo-full",
    },
  };
  vm.runInNewContext(analytics, {
    window,
    document,
    CustomEvent: class CustomEvent {},
    console,
    Date,
    Math,
    JSON,
    Object,
    Number,
    String,
    Boolean,
    Promise,
    URL,
    encodeURIComponent,
    decodeURIComponent,
  });
  return { window, scripts, scriptElements, localStorage, sessionStorage };
}

function calls(queue, name) {
  return (queue || [])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === "event" ? entry[1] === name : entry[0] === "track" && entry[1] === name);
}

const plan = {
  id: "solo-full",
  name: "Builder Pass + Solo OS",
  segment: "solo",
  tier: "full",
  price: "397.00",
  pricingStage: 0,
};

const checkoutPlans = [
  { id: "solo-mid", name: "Workshop Pass", segment: "solo", tier: "mid", price: "97.00", pricingStage: 0 },
  { id: "solo-full", name: "Builder Pass + Solo OS", segment: "solo", tier: "full", price: "397.00", pricingStage: 0 },
  { id: "agency-mid", name: "Workshop Pass + Agency OS", segment: "agency", tier: "mid", price: "597.00", pricingStage: 0 },
  { id: "agency-full", name: "Builder Pass + Agency OS", segment: "agency", tier: "full", price: "997.00", pricingStage: 0 },
  { id: "company-mid", name: "Workshop Pass + Company OS", segment: "company", tier: "mid", price: "997.00", pricingStage: 0 },
  { id: "company-full", name: "Builder Pass + Company OS", segment: "company", tier: "full", price: "1997.00", pricingStage: 0 },
];

test("offerta, checkout e thank you caricano soltanto l'asset analytics locale", () => {
  for (const page of [offer, checkout, thankYou]) {
    assert.match(page, /<script src="\/tirana\/assets\/analytics\.js"[^>]*><\/script>/);
    assert.doesNotMatch(page, /<script[^>]+(?:googletagmanager|connect\.facebook)/i);
  }
  assert.match(offer, /data-analytics-context="offer"/);
  assert.match(checkout, /data-analytics-context="checkout"/);
  assert.match(thankYou, /data-analytics-context="thank-you"/);
});

test("l'asset usa gli identificativi condivisi di Scalers", () => {
  assert.match(analytics, /const GA4_ID = 'G-PEB7DLKTE4'/);
  assert.match(analytics, /const META_PIXEL_ID = '2605330299866744'/);
  assert.match(analytics, /analytics_storage: 'granted'/);
  assert.match(analytics, /ad_storage: 'denied'/);
  assert.match(analytics, /ad_user_data: 'denied'/);
  assert.match(analytics, /ad_personalization: 'denied'/);
  assert.match(analytics, /ads_data_redaction', true/);
});

test("PageView Meta viene emesso una volta su ogni pagina del funnel dopo il consenso marketing", () => {
  for (const context of ["offer", "checkout", "thank-you"]) {
    const harness = analyticsHarness({ analytics: false, marketing: true }, { context });
    const pageViews = calls(harness.window.fbq.queue, "PageView");
    assert.equal(pageViews.length, 1, context);
    assert.deepEqual(harness.scripts, ["https://connect.facebook.net/en_US/fbevents.js"], context);
  }
});

test("senza consenso non parte alcuna richiesta analytics o marketing", async () => {
  const harness = analyticsHarness();
  assert.deepEqual(harness.scripts, []);
  await harness.window.TiranaAnalytics.trackAddToCart(plan);
  assert.deepEqual(harness.scripts, []);
  assert.equal(harness.window.dataLayer, undefined);
  assert.equal(harness.window.fbq, undefined);
  assert.match(harness.sessionStorage.getItem("tirana.analytics.pending.v1"), /add_to_cart/);
});

test("Google add_to_cart resta pending sull'offerta e viene emesso una sola volta nel checkout", async () => {
  const savedConsent = { analytics: true, marketing: false };
  const offerHarness = analyticsHarness(savedConsent, { context: "offer" });
  await offerHarness.window.TiranaAnalytics.trackAddToCart(plan);
  assert.equal(calls(offerHarness.window.dataLayer, "add_to_cart").length, 0);
  const pending = JSON.parse(offerHarness.sessionStorage.getItem("tirana.analytics.pending.v1"));
  const googleAdd = pending.find((entry) => entry.vendor === "google" && entry.eventName === "add_to_cart");
  assert.ok(googleAdd);
  assert.equal(googleAdd.deferUntilCheckout, true);

  const checkoutHarness = analyticsHarness(savedConsent, {
    context: "checkout",
    localStorage: offerHarness.localStorage,
    sessionStorage: offerHarness.sessionStorage,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const events = calls(checkoutHarness.window.dataLayer, "add_to_cart");
  assert.equal(events.length, 1);
  assert.equal(events[0][2].value, 397);
  assert.equal(events[0][2].currency, "EUR");
  assert.equal(events[0][2].items[0].item_id, "solo-full");
  assert.equal(events[0][2].event_id, googleAdd.flowId + ".add_to_cart");

  const reloadHarness = analyticsHarness(savedConsent, {
    context: "checkout",
    localStorage: offerHarness.localStorage,
    sessionStorage: offerHarness.sessionStorage,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls(reloadHarness.window.dataLayer, "add_to_cart").length, 0);
});

test("con uno script lento l'evento resta in coda e non viene marcato prima della readiness", async () => {
  const harness = analyticsHarness({ analytics: true, marketing: false }, { autoLoad: false, context: "checkout" });
  await harness.window.TiranaAnalytics.trackBeginCheckout(plan);
  assert.equal(calls(harness.window.dataLayer, "begin_checkout").length, 0);
  assert.match(harness.sessionStorage.getItem("tirana.analytics.pending.v1"), /begin_checkout/);
  assert.equal(
    [...harness.sessionStorage.values.keys()].some((key) => key.startsWith("tirana.analytics.sent.v1:google:begin_checkout")),
    false,
  );

  harness.scriptElements[0].onload();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls(harness.window.dataLayer, "begin_checkout").length, 1);
  assert.equal(
    [...harness.sessionStorage.values.keys()].some((key) => key.startsWith("tirana.analytics.sent.v1:google:begin_checkout")),
    true,
  );
});

test("il consenso marketing attiva solo Meta e deduplica AddToCart", async () => {
  const harness = analyticsHarness({ analytics: false, marketing: true });
  assert.deepEqual(harness.scripts, ["https://connect.facebook.net/en_US/fbevents.js"]);
  await harness.window.TiranaAnalytics.trackAddToCart(plan);
  await harness.window.TiranaAnalytics.trackAddToCart(plan);
  const events = calls(harness.window.fbq.queue, "AddToCart");
  assert.equal(events.length, 1);
  assert.deepEqual(Array.from(events[0][2].content_ids), ["solo-full"]);
  assert.equal(events[0][2].value, 397);
  assert.equal(events[0][2].currency, "EUR");
  assert.equal(harness.window.dataLayer, undefined);
});

test("begin_checkout e InitiateCheckout condividono piano, valore e flow deduplicato", async () => {
  const harness = analyticsHarness({ analytics: true, marketing: true });
  await harness.window.TiranaAnalytics.trackBeginCheckout(plan);
  await harness.window.TiranaAnalytics.trackBeginCheckout(plan);
  const googleEvents = calls(harness.window.dataLayer, "begin_checkout");
  const metaEvents = calls(harness.window.fbq.queue, "InitiateCheckout");
  assert.equal(googleEvents.length, 1);
  assert.equal(metaEvents.length, 1);
  assert.equal(googleEvents[0][2].value, 397);
  assert.equal(metaEvents[0][2].value, 397);
  assert.match(googleEvents[0][2].event_id, /solo-full/);
  assert.equal(metaEvents[0][3].eventID.endsWith(".InitiateCheckout"), true);
});

test("InitiateCheckout viene emesso per tutte le sei offerte del checkout", async () => {
  assert.deepEqual(checkoutPlans.map(({ id }) => id), PLAN_IDS);

  for (const checkoutPlan of checkoutPlans) {
    const harness = analyticsHarness({ analytics: false, marketing: true }, {
      context: "checkout",
      href: `https://www.tiranaoffline.com/checkout?plan=${checkoutPlan.id}`,
    });
    await harness.window.TiranaAnalytics.trackBeginCheckout(checkoutPlan);
    await new Promise((resolve) => setImmediate(resolve));

    const metaEvents = calls(harness.window.fbq.queue, "InitiateCheckout");
    assert.equal(metaEvents.length, 1, checkoutPlan.id);
    assert.deepEqual(Array.from(metaEvents[0][2].content_ids), [checkoutPlan.id], checkoutPlan.id);
    assert.equal(metaEvents[0][2].value, Number(checkoutPlan.price), checkoutPlan.id);
    assert.equal(metaEvents[0][2].currency, "EUR", checkoutPlan.id);
  }
});

test("add_payment_info usa il totale VIP30 restituito dal server", async () => {
  const harness = analyticsHarness({ analytics: true, marketing: true }, { context: "checkout" });
  const vipPlan = {
    ...plan,
    price: "277.90",
    originalPrice: "397.00",
    discountAmount: "119.10",
    coupon: { code: "VIP30", discountPercent: 30 },
  };

  await harness.window.TiranaAnalytics.trackAddPaymentInfo(vipPlan);
  await new Promise((resolve) => setImmediate(resolve));
  const googleEvent = calls(harness.window.dataLayer, "add_payment_info")[0];
  const metaEvent = calls(harness.window.fbq.queue, "AddPaymentInfo")[0];

  assert.equal(googleEvent[2].value, 277.9);
  assert.equal(googleEvent[2].coupon, "VIP30");
  assert.equal(googleEvent[2].discount, 119.1);
  assert.equal(googleEvent[2].original_price, 397);
  assert.equal(googleEvent[2].payment_type, "bank-transfer");
  assert.equal(googleEvent[2].items[0].coupon, "VIP30");
  assert.equal(metaEvent[2].value, 277.9);
  assert.equal(metaEvent[2].coupon, "VIP30");
  assert.equal(metaEvent[2].discount, 119.1);
  assert.equal(metaEvent[2].original_price, 397);
  assert.equal(metaEvent[2].payment_type, "bank-transfer");
});

test("add_payment_info distingue Stripe dal bonifico", async () => {
  const harness = analyticsHarness({ analytics: true, marketing: true }, { context: "checkout" });
  await harness.window.TiranaAnalytics.trackAddPaymentInfo(plan, "stripe");
  await new Promise((resolve) => setImmediate(resolve));
  const googleEvent = calls(harness.window.dataLayer, "add_payment_info")[0];
  const metaEvent = calls(harness.window.fbq.queue, "AddPaymentInfo")[0];
  assert.equal(googleEvent[2].payment_type, "stripe");
  assert.equal(metaEvent[2].payment_type, "stripe");
});

test("purchase invia revenue verificata a GA4 e Meta con deduplicazione condivisa", async () => {
  const harness = analyticsHarness(
    { analytics: true, marketing: true },
    { context: "thank-you", href: "https://www.tiranaoffline.com/thank-you?payment=stripe" },
  );
  const transactionId = "TIR-ORD-ABCDEF123456";
  const eventId = `tirana.purchase.${transactionId}`;
  await harness.window.TiranaAnalytics.trackPurchase(plan, transactionId, eventId);
  await harness.window.TiranaAnalytics.trackPurchase(plan, transactionId, eventId);

  const googleEvents = calls(harness.window.dataLayer, "purchase");
  const metaEvents = calls(harness.window.fbq.queue, "Purchase");
  assert.equal(googleEvents.length, 1);
  assert.equal(metaEvents.length, 1);
  assert.equal(googleEvents[0][2].transaction_id, transactionId);
  assert.equal(googleEvents[0][2].value, 397);
  assert.equal(googleEvents[0][2].currency, "EUR");
  assert.equal(googleEvents[0][2].items[0].item_id, "solo-full");
  assert.equal(googleEvents[0][2].payment_type, "stripe");
  assert.equal(metaEvents[0][2].order_id, transactionId);
  assert.equal(metaEvents[0][2].payment_type, "stripe");
  assert.equal(metaEvents[0][3].eventID, eventId);
});

test("il checkout inoltra gli identificativi Meta soltanto con consenso marketing", () => {
  const fbp = "fb.1.1720000000000.1234567890";
  const fbc = "fb.1.1720000000000.AQz-click-id";
  const allowed = analyticsHarness(
    { analytics: true, marketing: true },
    {
      cookie: `_fbp=${fbp}; _fbc=${fbc}`,
      href: "https://www.tiranaoffline.com/checkout?plan=solo-full&utm_source=meta",
    },
  ).window.TiranaAnalytics.getCheckoutTracking();
  assert.equal(allowed.consent.analytics, true);
  assert.equal(allowed.consent.marketing, true);
  assert.equal(allowed.fbp, fbp);
  assert.equal(allowed.fbc, fbc);
  assert.match(allowed.eventSourceUrl, /utm_source=meta/);

  const denied = analyticsHarness(
    { analytics: true, marketing: false },
    { cookie: `_fbp=${fbp}; _fbc=${fbc}` },
  ).window.TiranaAnalytics.getCheckoutTracking();
  assert.deepEqual(JSON.parse(JSON.stringify(denied)), {
    consent: { analytics: true, marketing: false },
  });
});

test("il pass gratuito traccia sign_up e CompleteRegistration senza evento di pagamento", async () => {
  const harness = analyticsHarness({ analytics: true, marketing: true }, { context: "checkout" });
  const freePlan = {
    ...plan,
    id: "solo-mid",
    name: "Workshop Pass",
    tier: "workshop",
    price: "0.00",
    originalPrice: "97.00",
    discountAmount: "97.00",
    coupon: { code: "SOLOFREEPASS", discountPercent: 100 },
  };

  await harness.window.TiranaAnalytics.trackCompleteRegistration(freePlan);
  await new Promise((resolve) => setImmediate(resolve));
  const googleEvent = calls(harness.window.dataLayer, "sign_up")[0];
  const metaEvent = calls(harness.window.fbq.queue, "CompleteRegistration")[0];

  assert.equal(googleEvent[2].value, 0);
  assert.equal(googleEvent[2].coupon, "SOLOFREEPASS");
  assert.equal(googleEvent[2].discount, 97);
  assert.equal(googleEvent[2].payment_type, undefined);
  assert.equal(metaEvent[2].value, 0);
  assert.equal(metaEvent[2].coupon, "SOLOFREEPASS");
  assert.equal(metaEvent[2].payment_type, undefined);
  assert.equal(calls(harness.window.dataLayer, "add_payment_info").length, 0);
  assert.equal(calls(harness.window.fbq.queue, "AddPaymentInfo").length, 0);
});

test("tutte le sei CTA risolvono il piano dal catalogo prima di AddToCart", () => {
  for (const planId of PLAN_IDS) {
    assert.match(offer, new RegExp(`href="/checkout\\?plan=${planId}"`));
  }
  assert.match(offer, /resolveTrackingPlan\(planId\)/);
  assert.match(offer, /\/api\/catalog\?plan=/);
  assert.match(offer, /TiranaAnalytics\.trackAddToCart\(plan\)/);
  assert.doesNotMatch(offer, /trackAddToCart\([^)]*textContent/);
});

test("il checkout traccia il piano soltanto dopo la risposta valida del catalogo", () => {
  const validated = checkout.indexOf("state.basePlan = await fetchPlan();");
  const tracked = checkout.indexOf("trackBeginCheckout?.(state.plan)");
  const shown = checkout.indexOf("showCheckout();", tracked);
  const awaited = checkout.indexOf("await Promise.resolve(initiateCheckoutTracking)", shown);
  assert.notEqual(validated, -1);
  assert.notEqual(tracked, -1);
  assert.notEqual(shown, -1);
  assert.notEqual(awaited, -1);
  assert.ok(validated < tracked && tracked < shown && shown < awaited);
  assert.match(checkout, /new URLSearchParams\(\{ plan: planId \}\)/);
  const stripeRegistered = checkout.indexOf("if (!response.ok || !result?.ok || checkoutUrl?.protocol !== 'https:'");
  const stripePaymentInfo = checkout.indexOf("trackAddPaymentInfo?.(state.plan, 'stripe')");
  const registered = checkout.indexOf("if (!response.ok || !result?.ok || !result?.next)");
  const paymentInfo = checkout.indexOf("trackAddPaymentInfo?.(state.plan, 'bank-transfer')", stripePaymentInfo + 1);
  const freeRegistration = checkout.indexOf("trackCompleteRegistration?.(state.plan)");
  assert.ok(stripeRegistered < stripePaymentInfo);
  assert.ok(registered < paymentInfo);
  assert.ok(registered < freeRegistration);
});

test("consenso e Privacy Policy distinguono analisi e marketing", () => {
  assert.match(analytics, /data-consent-analytics/);
  assert.match(analytics, /data-consent-marketing/);
  assert.match(analytics, /data-consent-reject/);
  assert.match(analytics, /data-consent-accept/);
  assert.match(privacy, /Google Analytics 4/);
  assert.match(privacy, /Meta Pixel/);
  assert.match(privacy, /Meta Conversions API/);
  assert.match(privacy, /restano disattivati finché non esprimi una scelta positiva/);
  assert.match(offer, /data-consent-settings/);
  assert.match(checkout, /data-consent-settings/);
});

test("la CSP autorizza solo gli endpoint analytics necessari", () => {
  const routeNames = new Set([
    "/offerta(.*)",
    "/tirana/offerta(.*)",
    "/checkout(.*)",
    "/tirana/checkout(.*)",
    "/thank-you(.*)",
    "/tirana/thank-you(.*)",
  ]);
  const routes = vercel.headers.filter(({ source }) => routeNames.has(source));
  assert.equal(routes.length, routeNames.size);
  for (const route of routes) {
    const csp = route.headers.find(({ key }) => key === "Content-Security-Policy")?.value || "";
    assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    assert.match(csp, /script-src[^;]*https:\/\/connect\.facebook\.net/);
    assert.match(csp, /connect-src[^;]*https:\/\/www\.google-analytics\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/analytics\.google\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/www\.facebook\.com/);
    assert.doesNotMatch(csp, /(?:default-src|script-src|connect-src|img-src)\s+\*/);
  }
});
