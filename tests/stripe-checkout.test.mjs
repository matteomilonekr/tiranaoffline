import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import createCheckoutHandler from "../api/stripe/create-checkout-session.js";
import sessionHandler from "../api/stripe/session.js";
import webhookHandler from "../api/stripe/webhook.js";
import { PURCHASE_TERMS_VERSION } from "../api/_purchase-terms.js";
import {
  decryptStripeContext,
  encryptStripeContext,
  resolvePaidStripeSession,
  verifyStripeWebhookSignature,
} from "../api/stripe/_shared.js";
import { getPlan } from "../api/paypal/_shared.js";

const TEST_SECRET_KEY = `sk_test_${"a".repeat(48)}`;
const TEST_PUBLISHABLE_KEY = `pk_test_${"b".repeat(48)}`;
const TEST_WEBHOOK_SECRET = `whsec_${"c".repeat(48)}`;
const TEST_SESSION_ID = `cs_test_${"d".repeat(32)}`;

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };
}

function customer() {
  return {
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario.rossi@example.com",
    phone: "+39 333 123 4567",
    referral: "Andrea Bianchi",
    companyName: "Rossi SRL",
    address: "Via Roma 1",
    city: "Milano",
    countryCode: "IT",
    postalCode: "20121",
    taxId: "IT12345678901",
  };
}

function purchaseTerms() {
  return { accepted: true, version: PURCHASE_TERMS_VERSION };
}

function postRequest(body, headers = {}) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "www.tiranaoffline.com",
      origin: "https://www.tiranaoffline.com",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body,
  };
}

function withEnvironment(run) {
  const values = {
    STRIPE_SECRET_KEY: TEST_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    TIRANA_FUNNEL_SECRET: "test-funnel-secret-with-at-least-32-characters",
    RESEND_API_KEY: "test-resend-key",
    RESEND_FROM: "Scalers <evento@tiranaoffline.com>",
    RESEND_REPLY_TO: "support@example.com",
    REGISTRATION_NOTIFY_TO: "evento@tiranaoffline.com",
    GOOGLE_SHEETS_WEBHOOK_URL: "https://script.google.com/macros/s/test-deployment/exec",
    GOOGLE_SHEETS_WEBHOOK_SECRET: "test-google-sheets-secret-with-at-least-32-characters",
    GOOGLE_SHEETS_REQUIRED: "true",
  };
  const previous = Object.fromEntries(
    [
      ...Object.keys(values),
      "SLACK_BOT_TOKEN",
      "SLACK_CHANNEL_ID",
      "META_CAPI_ACCESS_TOKEN",
      "META_PIXEL_ID",
      "META_GRAPH_API_VERSION",
      "META_TEST_EVENT_CODE",
    ].map((name) => [name, process.env[name]]),
  );
  const previousFetch = global.fetch;
  Object.assign(process.env, values);
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
  delete process.env.META_CAPI_ACCESS_TOKEN;
  delete process.env.META_PIXEL_ID;
  delete process.env.META_GRAPH_API_VERSION;
  delete process.env.META_TEST_EVENT_CODE;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      global.fetch = previousFetch;
    });
}

function signedHeader(rawBody, timestamp = Math.floor(Date.now() / 1_000)) {
  const signature = createHmac("sha256", TEST_WEBHOOK_SECRET)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function paidSessionFromForm(form) {
  return {
    id: TEST_SESSION_ID,
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: form.get("line_items[0][price_data][currency]"),
    amount_total: Number(form.get("line_items[0][price_data][unit_amount]")),
    client_reference_id: form.get("client_reference_id"),
    customer_email: form.get("customer_email"),
    customer_details: { email: form.get("customer_email") },
    payment_intent: `pi_${"e".repeat(24)}`,
    metadata: Object.fromEntries(
      [...form.entries()]
        .filter(([key]) => key.startsWith("metadata["))
        .map(([key, value]) => [key.slice(9, -1), value]),
    ),
  };
}

test("cifra e autentica il contesto cliente destinato ai metadati Stripe", () =>
  withEnvironment(() => {
    const context = { customer: customer(), planId: "solo-mid" };
    const token = encryptStripeContext(context);
    assert.deepEqual(decryptStripeContext(token), context);
    assert.doesNotMatch(token, /Mario|Rossi|Via Roma|IT12345678901/);
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    assert.throws(
      () => decryptStripeContext(tampered),
      (error) => error.code === "STRIPE_CONTEXT_INVALID",
    );
  }));

test("crea una sessione Stripe con prezzo server-side e contesto cifrato", () =>
  withEnvironment(async () => {
    let stripeRequest;
    global.fetch = async (url, options) => {
      stripeRequest = {
        url: String(url),
        options,
        form: new URLSearchParams(options.body),
      };
      return new Response(JSON.stringify({
        id: TEST_SESSION_ID,
        url: `https://checkout.stripe.com/c/pay/${"f".repeat(24)}`,
        livemode: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    const req = postRequest({
      planId: plan.id,
      expectedPricingStage: plan.pricingStage,
      couponCode: "vip712",
      customer: customer(),
      purchaseTerms: purchaseTerms(),
      tracking: {
        consent: { analytics: true, marketing: true },
        fbp: "fb.1.1720000000000.1234567890",
        fbc: "fb.1.1720000000000.AQz-click-id",
        eventSourceUrl: "https://www.tiranaoffline.com/checkout?utm_source=meta",
      },
    }, {
      "idempotency-key": "stripe-checkout-test-1234",
      "x-vercel-forwarded-for": "203.0.113.42",
      "user-agent": "Mozilla/5.0 Test Browser",
    });
    const res = mockResponse();
    await createCheckoutHandler(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.mode, "test");
    assert.equal(res.payload.sessionId, TEST_SESSION_ID);
    assert.equal(stripeRequest.url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(stripeRequest.options.headers.Authorization, `Bearer ${TEST_SECRET_KEY}`);
    assert.equal(
      stripeRequest.options.headers["Idempotency-Key"],
      "tirana-checkout-stripe-checkout-test-1234",
    );
    assert.equal(stripeRequest.form.get("payment_method_types[0]"), "card");
    assert.equal(stripeRequest.form.get("adaptive_pricing[enabled]"), "false");
    assert.equal(stripeRequest.form.get("line_items[0][price_data][unit_amount]"), "4850");
    assert.equal(stripeRequest.form.get("line_items[0][price_data][currency]"), "eur");
    assert.equal(stripeRequest.form.get("metadata[coupon_code]"), "VIP712");
    assert.equal(
      stripeRequest.form.get("payment_intent_data[metadata][coupon_code]"),
      "VIP712",
    );
    assert.equal(stripeRequest.form.get("customer_email"), customer().email);
    assert.equal(stripeRequest.form.get("success_url").includes("{CHECKOUT_SESSION_ID}"), true);
    assert.equal(stripeRequest.form.get("metadata[purchase_terms_accepted]"), "true");
    assert.equal(stripeRequest.form.get("metadata[purchase_terms_version]"), PURCHASE_TERMS_VERSION);
    assert.equal(
      stripeRequest.form.get("payment_intent_data[metadata][purchase_terms_version]"),
      PURCHASE_TERMS_VERSION,
    );
    assert.match(
      stripeRequest.form.get("custom_text[submit][message]"),
      /https:\/\/www\.tiranaoffline\.com\/refund-policy/,
    );
    const metadata = [...stripeRequest.form.entries()]
      .filter(([key]) => key.startsWith("metadata["))
      .map(([, value]) => value)
      .join("");
    assert.doesNotMatch(metadata, /Mario|Rossi|Via Roma|IT12345678901/);
    assert.doesNotMatch(metadata, /203\.0\.113\.42|Mozilla\/5\.0|fb\.1\./);
    const resolved = resolvePaidStripeSession(paidSessionFromForm(stripeRequest.form));
    assert.equal(resolved.tracking.consent.marketing, true);
    assert.equal(resolved.tracking.clientIp, "203.0.113.42");
    assert.equal(resolved.tracking.clientUserAgent, "Mozilla/5.0 Test Browser");
    assert.equal(resolved.tracking.fbp, "fb.1.1720000000000.1234567890");
  }));

test("rifiuta prezzi inviati dal browser prima di chiamare Stripe", () =>
  withEnvironment(async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error("fetch non previsto");
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    const res = mockResponse();
    await createCheckoutHandler(postRequest({
      planId: plan.id,
      expectedPricingStage: plan.pricingStage,
      amount: 1,
      customer: customer(),
    }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.error.code, "CLIENT_PRICING_NOT_ALLOWED");
    assert.equal(fetchCalls, 0);
  }));

test("rifiuta il pagamento senza accettazione della policy o con versione obsoleta", () =>
  withEnvironment(async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error("fetch non previsto");
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    for (const invalidTerms of [undefined, { accepted: false, version: PURCHASE_TERMS_VERSION }, { accepted: true, version: "old" }]) {
      const res = mockResponse();
      await createCheckoutHandler(postRequest({
        planId: plan.id,
        expectedPricingStage: plan.pricingStage,
        customer: customer(),
        purchaseTerms: invalidTerms,
      }), res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.payload.error.code, "PURCHASE_TERMS_REQUIRED");
    }
    assert.equal(fetchCalls, 0);
  }));

test("verifica firma, importo e webhook prima di registrare il ticket pagato", () =>
  withEnvironment(async () => {
    let checkoutForm;
    global.fetch = async (_url, options) => {
      checkoutForm = new URLSearchParams(options.body);
      return new Response(JSON.stringify({
        id: TEST_SESSION_ID,
        url: `https://checkout.stripe.com/c/pay/${"f".repeat(24)}`,
        livemode: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    const createRes = mockResponse();
    await createCheckoutHandler(postRequest({
      planId: plan.id,
      expectedPricingStage: plan.pricingStage,
      customer: customer(),
      purchaseTerms: purchaseTerms(),
    }, { "idempotency-key": "stripe-webhook-test-1234" }), createRes);
    const session = paidSessionFromForm(checkoutForm);
    assert.equal(resolvePaidStripeSession(session).order.status, "PAID_STRIPE");
    assert.throws(
      () => resolvePaidStripeSession({ ...session, amount_total: session.amount_total - 1 }),
      (error) => error.code === "STRIPE_PAYMENT_NOT_CONFIRMED",
    );

    const outbound = [];
    global.fetch = async (url, options) => {
      const request = { url: String(url), options, body: JSON.parse(options.body) };
      outbound.push(request);
      if (request.url.startsWith("https://script.google.com/")) {
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: request.body.data.registrationId,
          ticketId: request.body.data.ticketId,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: `email_${outbound.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const event = {
      id: `evt_${"g".repeat(24)}`,
      type: "checkout.session.completed",
      data: { object: session },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const webhookRes = mockResponse();
    await webhookHandler({
      method: "POST",
      headers: { "stripe-signature": signedHeader(rawBody) },
      body: rawBody,
    }, webhookRes);

    assert.equal(webhookRes.statusCode, 200);
    assert.deepEqual(webhookRes.payload, { received: true });
    assert.equal(outbound.length, 3);
    assert.equal(outbound[0].body.data.paymentStatus, "PAGATO");
    assert.equal(outbound[0].body.data.paymentMethod, "STRIPE");
    assert.equal(outbound[0].body.data.ticketId, session.client_reference_id);
    assert.equal(outbound[1].options.headers["Idempotency-Key"], `tirana-stripe-internal-${session.client_reference_id}`);
    assert.equal(outbound[2].options.headers["Idempotency-Key"], `tirana-stripe-customer-${session.client_reference_id}`);
    assert.equal(outbound[2].body.to[0], customer().email);
  }));

test("il webhook Stripe invia Purchase CAPI con lo stesso event ID pubblico", () =>
  withEnvironment(async () => {
    process.env.META_CAPI_ACCESS_TOKEN = `EAA${"x".repeat(80)}`;
    process.env.META_PIXEL_ID = "2605330299866744";
    process.env.META_GRAPH_API_VERSION = "v23.0";
    let checkoutForm;
    global.fetch = async (_url, options) => {
      checkoutForm = new URLSearchParams(options.body);
      return new Response(JSON.stringify({
        id: TEST_SESSION_ID,
        url: `https://checkout.stripe.com/c/pay/${"f".repeat(24)}`,
        livemode: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    const createRes = mockResponse();
    await createCheckoutHandler(postRequest({
      planId: plan.id,
      expectedPricingStage: plan.pricingStage,
      customer: customer(),
      purchaseTerms: purchaseTerms(),
      tracking: {
        consent: { analytics: true, marketing: true },
        fbp: "fb.1.1720000000000.1234567890",
        eventSourceUrl: "https://www.tiranaoffline.com/checkout?utm_source=meta",
      },
    }, {
      "idempotency-key": "stripe-capi-test-1234",
      "x-vercel-forwarded-for": "203.0.113.42",
      "user-agent": "Mozilla/5.0 Test Browser",
    }), createRes);
    const session = paidSessionFromForm(checkoutForm);

    const outbound = [];
    global.fetch = async (url, options) => {
      const request = { url: String(url), options, body: JSON.parse(options.body) };
      outbound.push(request);
      if (request.url.startsWith("https://script.google.com/")) {
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: request.body.data.registrationId,
          ticketId: request.body.data.ticketId,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (request.url.startsWith("https://graph.facebook.com/")) {
        return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: `email_${outbound.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const event = {
      id: `evt_${"h".repeat(24)}`,
      type: "checkout.session.completed",
      data: { object: session },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const webhookRes = mockResponse();
    await webhookHandler({
      method: "POST",
      headers: { "stripe-signature": signedHeader(rawBody) },
      body: rawBody,
    }, webhookRes);

    assert.equal(webhookRes.statusCode, 200);
    const capi = outbound.find((request) => request.url.startsWith("https://graph.facebook.com/"));
    assert.ok(capi);
    assert.equal(
      capi.body.data[0].event_id,
      `tirana.purchase.${session.client_reference_id}`,
    );
    assert.equal(capi.body.data[0].custom_data.value, Number(plan.price));
    assert.equal(capi.body.data[0].custom_data.currency, "EUR");
    assert.doesNotMatch(JSON.stringify(capi.body), /mario\.rossi@example\.com|\+39 333/);
  }));

test("un errore CAPI non blocca il webhook né le email del biglietto", () =>
  withEnvironment(async () => {
    process.env.META_CAPI_ACCESS_TOKEN = `EAA${"x".repeat(80)}`;
    process.env.META_PIXEL_ID = "2605330299866744";
    process.env.META_GRAPH_API_VERSION = "v23.0";
    let checkoutForm;
    global.fetch = async (_url, options) => {
      checkoutForm = new URLSearchParams(options.body);
      return new Response(JSON.stringify({
        id: TEST_SESSION_ID,
        url: `https://checkout.stripe.com/c/pay/${"f".repeat(24)}`,
        livemode: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    const createRes = mockResponse();
    await createCheckoutHandler(postRequest({
      planId: plan.id,
      expectedPricingStage: plan.pricingStage,
      customer: customer(),
      purchaseTerms: purchaseTerms(),
      tracking: {
        consent: { analytics: true, marketing: true },
        eventSourceUrl: "https://www.tiranaoffline.com/checkout",
      },
    }, {
      "idempotency-key": "stripe-capi-failure-test-1234",
      "x-vercel-forwarded-for": "203.0.113.42",
      "user-agent": "Mozilla/5.0 Test Browser",
    }), createRes);
    const session = paidSessionFromForm(checkoutForm);

    const outbound = [];
    global.fetch = async (url, options) => {
      const request = { url: String(url), options, body: JSON.parse(options.body) };
      outbound.push(request);
      if (request.url.startsWith("https://script.google.com/")) {
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: request.body.data.registrationId,
          ticketId: request.body.data.ticketId,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (request.url.startsWith("https://graph.facebook.com/")) {
        return new Response(JSON.stringify({
          error: { message: "Errore Meta simulato", code: 1 },
        }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: `email_${outbound.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const warnings = [];
    const previousWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
      const event = {
        id: `evt_${"i".repeat(24)}`,
        type: "checkout.session.completed",
        data: { object: session },
      };
      const rawBody = Buffer.from(JSON.stringify(event));
      const webhookRes = mockResponse();
      await webhookHandler({
        method: "POST",
        headers: { "stripe-signature": signedHeader(rawBody) },
        body: rawBody,
      }, webhookRes);

      assert.equal(webhookRes.statusCode, 200);
      assert.deepEqual(webhookRes.payload, { received: true });
      assert.equal(
        outbound.filter((request) => request.url === "https://api.resend.com/emails").length,
        2,
      );
      assert.equal(
        outbound.filter((request) => request.url.startsWith("https://graph.facebook.com/")).length,
        1,
      );
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0][0], "[tirana] tracking Meta rinviato");
      assert.equal(warnings[0][1].code, "META_CAPI_FAILED");
    } finally {
      console.warn = previousWarn;
    }
  }));

test("la pagina finale recupera soltanto un riepilogo Stripe pagato e sanitizzato", () =>
  withEnvironment(async () => {
    let checkoutForm;
    global.fetch = async (_url, options) => {
      checkoutForm = new URLSearchParams(options.body);
      return new Response(JSON.stringify({
        id: TEST_SESSION_ID,
        url: `https://checkout.stripe.com/c/pay/${"f".repeat(24)}`,
        livemode: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    const createRes = mockResponse();
    await createCheckoutHandler(postRequest({
      planId: plan.id,
      expectedPricingStage: plan.pricingStage,
      customer: customer(),
      purchaseTerms: purchaseTerms(),
    }, { "idempotency-key": "stripe-session-test-1234" }), createRes);
    const session = paidSessionFromForm(checkoutForm);
    global.fetch = async (url) => {
      assert.equal(String(url), `https://api.stripe.com/v1/checkout/sessions/${TEST_SESSION_ID}`);
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const res = mockResponse();
    await sessionHandler({ method: "GET", headers: {}, query: { session_id: TEST_SESSION_ID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.status, "PAID_STRIPE");
    assert.equal(res.payload.orderId, session.client_reference_id);
    assert.equal(res.payload.plan.id, "solo-mid");
    assert.equal(
      res.payload.trackingEventId,
      `tirana.purchase.${session.client_reference_id}`,
    );
    assert.match(res.payload.shareToken, /^v1\./);
    assert.equal(Object.hasOwn(res.payload, "customer"), false);
    assert.equal(Object.hasOwn(res.payload, "tracking"), false);
  }));

test("rifiuta firme webhook errate o fuori tolleranza", () =>
  withEnvironment(() => {
    const rawBody = Buffer.from('{"type":"checkout.session.completed"}');
    assert.equal(verifyStripeWebhookSignature(rawBody, signedHeader(rawBody)), true);
    assert.throws(
      () => verifyStripeWebhookSignature(rawBody, "t=1,v1=deadbeef"),
      (error) => error.code === "STRIPE_SIGNATURE_INVALID",
    );
  }));
