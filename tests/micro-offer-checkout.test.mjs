import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import checkoutHandler from "../api/micro-offer/checkout.js";
import webhookHandler from "../api/stripe/webhook.js";
import { MICRO_OFFER_BUMPS, MICRO_OFFER_PRODUCT } from "../api/micro-offer/_shared.js";

const TEST_SECRET_KEY = `sk_test_${"a".repeat(48)}`;
const TEST_PUBLISHABLE_KEY = `pk_test_${"b".repeat(48)}`;
const TEST_WEBHOOK_SECRET = `whsec_${"c".repeat(48)}`;
const PAYMENT_INTENT_ID = `pi_${"d".repeat(24)}`;
const CLIENT_SECRET = `${PAYMENT_INTENT_ID}_secret_${"e".repeat(24)}`;
const CONFIRMATION_TOKEN = `ctoken_${"f".repeat(24)}`;
const SLACK_TOKEN = `xoxb-${"1".repeat(12)}-${"a".repeat(24)}`;
const SLACK_CHANNEL = "C0123456789";

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

function postRequest(body, headers = {}) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "www.tiranaoffline.com",
      origin: "https://www.tiranaoffline.com",
      "sec-fetch-site": "same-origin",
      "idempotency-key": "attempt-1234567890",
      ...headers,
    },
    body,
  };
}

function payment(overrides = {}) {
  return {
    fullName: "Mario Rossi",
    email: "Mario.Rossi@example.com",
    bumps: [],
    confirmationTokenId: CONFIRMATION_TOKEN,
    ...overrides,
  };
}

function intentFromForm(form, overrides = {}) {
  return {
    id: PAYMENT_INTENT_ID,
    object: "payment_intent",
    livemode: false,
    status: "succeeded",
    client_secret: CLIENT_SECRET,
    amount: Number(form.get("amount")),
    currency: form.get("currency"),
    receipt_email: form.get("receipt_email"),
    metadata: Object.fromEntries(
      [...form.entries()]
        .filter(([key]) => key.startsWith("metadata["))
        .map(([key, value]) => [key.slice(9, -1), value]),
    ),
    ...overrides,
  };
}

function storedIntent(overrides = {}) {
  return {
    id: PAYMENT_INTENT_ID,
    object: "payment_intent",
    livemode: false,
    status: "succeeded",
    client_secret: CLIENT_SECRET,
    amount: 4195,
    currency: "eur",
    receipt_email: "mario.rossi@example.com",
    metadata: {
      funnel: "micro-offer-os",
      product: "micro-offer-os",
      bumps: "launch-kit",
      customer_name: "Mario Rossi",
      customer_email: "mario.rossi@example.com",
    },
    ...overrides,
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withEnvironment(run, values = {}) {
  const defaults = {
    STRIPE_SECRET_KEY: TEST_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
  };
  const names = [
    ...Object.keys(defaults),
    "SLACK_BOT_TOKEN",
    "SLACK_CHANNEL_ID",
    "MICRO_OFFER_ACCESS_URL",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const previousFetch = global.fetch;
  for (const name of names) delete process.env[name];
  Object.assign(process.env, defaults, values);
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
  }
  global.fetch = async (url) => {
    throw new Error(`fetch inatteso verso ${url}`);
  };
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

test("la configurazione pubblica espone catalogo e chiave pubblicabile, mai la segreta", () =>
  withEnvironment(async () => {
    const res = mockResponse();
    await checkoutHandler({ method: "GET", headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.configured, true);
    assert.equal(res.payload.mode, "test");
    assert.equal(res.payload.publishableKey, TEST_PUBLISHABLE_KEY);
    assert.equal(res.payload.currency, "eur");
    assert.deepEqual(res.payload.product, { id: "micro-offer-os", name: "Micro Offer OS", amountCents: 1495 });
    assert.deepEqual(res.payload.bumps.map((bump) => bump.id), ["launch-kit", "aaw-replay", "launch-kit-replay"]);
    assert.doesNotMatch(JSON.stringify(res.payload), /sk_test_/);
    assert.equal(res.headers["cache-control"], "no-store, max-age=0");
  }));

test("senza chiavi Stripe la pagina riceve il catalogo ma il pagamento resta disattivo", () =>
  withEnvironment(async () => {
    const res = mockResponse();
    await checkoutHandler({ method: "GET", headers: {} }, res);
    assert.equal(res.payload.configured, false);
    assert.equal(res.payload.publishableKey, null);
    assert.equal(res.payload.product.amountCents, 1495);

    const payRes = mockResponse();
    await checkoutHandler(postRequest(payment()), payRes);
    assert.equal(payRes.statusCode, 503);
    assert.equal(payRes.payload.error.code, "STRIPE_NOT_CONFIGURED");
  }, { STRIPE_SECRET_KEY: undefined, STRIPE_PUBLISHABLE_KEY: undefined }));

test("chiavi Stripe di modalità diverse non attivano il pagamento", () =>
  withEnvironment(async () => {
    const res = mockResponse();
    await checkoutHandler({ method: "GET", headers: {} }, res);
    assert.equal(res.payload.configured, false);
  }, { STRIPE_PUBLISHABLE_KEY: `pk_live_${"b".repeat(48)}` }));

test("il pagamento conferma un PaymentIntent con importo calcolato dal server", () =>
  withEnvironment(async () => {
    const requests = [];
    global.fetch = async (url, options) => {
      const form = new URLSearchParams(options.body);
      requests.push({ url, options, form });
      return json(intentFromForm(form));
    };
    const res = mockResponse();
    await checkoutHandler(postRequest(payment({ bumps: ["aaw-replay", "launch-kit"] })), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      status: "succeeded",
      paymentIntentId: PAYMENT_INTENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    assert.equal(requests.length, 1);
    const [{ url, options, form }] = requests;
    assert.equal(url, "https://api.stripe.com/v1/payment_intents");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, `Bearer ${TEST_SECRET_KEY}`);
    assert.equal(options.headers["Idempotency-Key"], "micro-offer-pay-attempt-1234567890");
    assert.equal(form.get("amount"), String(1495 + 2700 + 2700));
    assert.equal(form.get("currency"), "eur");
    assert.equal(form.get("confirm"), "true");
    assert.equal(form.get("confirmation_token"), CONFIRMATION_TOKEN);
    assert.equal(form.get("automatic_payment_methods[enabled]"), "true");
    assert.equal(form.get("return_url"), "https://www.tiranaoffline.com/micro-offer/grazie");
    assert.equal(form.get("receipt_email"), "mario.rossi@example.com");
    assert.equal(form.get("description"), "Micro Offer OS + Kit di Lancio Rapido (accesso a vita) + AI Acceleration Week Replay Pass");
    assert.equal(form.get("metadata[funnel]"), "micro-offer-os");
    assert.equal(form.get("metadata[bumps]"), "launch-kit,aaw-replay");
    assert.equal(form.get("metadata[customer_name]"), "Mario Rossi");
  }));

test("il pacchetto dei due upgrade costa meno dei due presi separatamente", () => {
  const byId = Object.fromEntries(MICRO_OFFER_BUMPS.map((bump) => [bump.id, bump]));
  assert.equal(MICRO_OFFER_PRODUCT.amountCents, 1495);
  assert.equal(byId["launch-kit-replay"].amountCents, 4400);
  assert.equal(byId["launch-kit"].amountCents + byId["aaw-replay"].amountCents - 1000, 4400);
  assert.deepEqual([...byId["launch-kit-replay"].excludes], ["launch-kit", "aaw-replay"]);
});

test("il server rifiuta prezzi inviati dal browser, aggiunte ignote e aggiunte incompatibili", () =>
  withEnvironment(async () => {
    const cases = [
      [payment({ amount: 100 }), 400, "CLIENT_PRICING_REJECTED"],
      [payment({ total: 1 }), 400, "CLIENT_PRICING_REJECTED"],
      [payment({ bumps: ["vip-upgrade"] }), 400, "INVALID_BUMPS"],
      [payment({ bumps: ["launch-kit", "launch-kit"] }), 400, "INVALID_BUMPS"],
      [payment({ bumps: "launch-kit" }), 400, "INVALID_BUMPS"],
      [payment({ bumps: ["launch-kit-replay", "launch-kit"] }), 400, "BUMP_CONFLICT"],
      [payment({ email: "mario@" }), 400, "INVALID_EMAIL"],
      [payment({ fullName: " " }), 400, "INVALID_DATA"],
      [payment({ confirmationTokenId: "pm_123" }), 400, "INVALID_PAYMENT_METHOD"],
    ];
    for (const [body, status, code] of cases) {
      const res = mockResponse();
      await checkoutHandler(postRequest(body), res);
      assert.equal(res.statusCode, status, code);
      assert.equal(res.payload.error.code, code);
    }
  }));

test("il pagamento accetta solo richieste JSON dalla stessa origine", () =>
  withEnvironment(async () => {
    const crossSite = mockResponse();
    await checkoutHandler(postRequest(payment(), {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }), crossSite);
    assert.equal(crossSite.statusCode, 403);

    const form = mockResponse();
    await checkoutHandler(postRequest(payment(), { "content-type": "application/x-www-form-urlencoded" }), form);
    assert.equal(form.statusCode, 415);

    const put = mockResponse();
    await checkoutHandler({ method: "PUT", headers: {} }, put);
    assert.equal(put.statusCode, 405);
    assert.equal(put.headers.allow, "GET, POST");
  }));

test("una carta rifiutata restituisce un messaggio chiaro in italiano", () =>
  withEnvironment(async () => {
    global.fetch = async () => json({
      error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." },
    }, 402);
    const res = mockResponse();
    await checkoutHandler(postRequest(payment()), res);
    assert.equal(res.statusCode, 402);
    assert.equal(res.payload.error.code, "PAYMENT_DECLINED");
    assert.equal(res.payload.error.message, "Fondi insufficienti sulla carta. Prova con un’altra carta.");
  }));

test("con l'autenticazione 3D Secure il browser riceve il client secret per completarla", () =>
  withEnvironment(async () => {
    global.fetch = async (_url, options) => json(intentFromForm(new URLSearchParams(options.body), { status: "requires_action" }));
    const res = mockResponse();
    await checkoutHandler(postRequest(payment()), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.status, "requires_action");
    assert.equal(res.payload.clientSecret, CLIENT_SECRET);
  }));

test("un PaymentIntent con importo diverso da quello atteso viene scartato", () =>
  withEnvironment(async () => {
    global.fetch = async (_url, options) => json(intentFromForm(new URLSearchParams(options.body), { amount: 100 }));
    const res = mockResponse();
    await checkoutHandler(postRequest(payment()), res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.payload.error.code, "STRIPE_INVALID_RESPONSE");
  }));

test("un pagamento riuscito avvisa il team su Slack una sola volta", () =>
  withEnvironment(async () => {
    const outbound = [];
    global.fetch = async (url, options) => {
      outbound.push({ url, options });
      if (url === "https://api.stripe.com/v1/payment_intents") {
        return json(intentFromForm(new URLSearchParams(options.body)));
      }
      if (url === "https://slack.com/api/chat.postMessage") {
        return json({ ok: true, channel: SLACK_CHANNEL, ts: "1700000000.000100" });
      }
      if (url === `https://api.stripe.com/v1/payment_intents/${PAYMENT_INTENT_ID}`) {
        return json(storedIntent({ metadata: { ...storedIntent().metadata, notified_at: "2026-09-26T10:00:00.000Z" } }));
      }
      throw new Error(`fetch inatteso verso ${url}`);
    };
    const res = mockResponse();
    await checkoutHandler(postRequest(payment({ bumps: ["launch-kit-replay"] })), res);
    assert.equal(res.statusCode, 200);

    const slack = outbound.filter(({ url }) => url.startsWith("https://slack.com/"));
    assert.equal(slack.length, 1);
    const message = JSON.parse(slack[0].options.body);
    assert.match(message.text, /Nuovo acquisto Micro Offer OS/);
    assert.match(message.text, /Kit di Lancio Rapido \+ Replay Pass/);
    assert.match(message.text, /€58,95/);
    const marker = outbound.find(({ url }) => url === `https://api.stripe.com/v1/payment_intents/${PAYMENT_INTENT_ID}`);
    assert.match(new URLSearchParams(marker.options.body).get("metadata[notified_at]"), /^\d{4}-\d{2}-\d{2}T/);

    const finalize = mockResponse();
    await checkoutHandler(postRequest({
      action: "finalize",
      paymentIntentId: PAYMENT_INTENT_ID,
      clientSecret: CLIENT_SECRET,
    }), finalize);
    assert.equal(finalize.statusCode, 200);
    assert.equal(outbound.filter(({ url }) => url.startsWith("https://slack.com/")).length, 1);
  }, { SLACK_BOT_TOKEN: SLACK_TOKEN, SLACK_CHANNEL_ID: SLACK_CHANNEL }));

test("se Slack non risponde il cliente vede comunque il pagamento confermato", () =>
  withEnvironment(async () => {
    global.fetch = async (url, options) => {
      if (url === "https://api.stripe.com/v1/payment_intents") {
        return json(intentFromForm(new URLSearchParams(options.body)));
      }
      return json({ ok: false, error: "channel_not_found" });
    };
    const res = mockResponse();
    await checkoutHandler(postRequest(payment()), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.status, "succeeded");
  }, { SLACK_BOT_TOKEN: SLACK_TOKEN, SLACK_CHANNEL_ID: SLACK_CHANNEL }));

test("la pagina di conferma verifica il pagamento con il client secret", () =>
  withEnvironment(async () => {
    global.fetch = async (url) => {
      assert.equal(url, `https://api.stripe.com/v1/payment_intents/${PAYMENT_INTENT_ID}`);
      return json(storedIntent());
    };
    const res = mockResponse();
    await checkoutHandler(postRequest({
      action: "finalize",
      paymentIntentId: PAYMENT_INTENT_ID,
      clientSecret: CLIENT_SECRET,
    }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      status: "succeeded",
      paid: true,
      amountCents: 4195,
      items: ["Micro Offer OS", "Kit di Lancio Rapido (accesso a vita)"],
      firstName: "Mario",
      accessUrl: "https://www.skool.com/esempio",
    });

    const wrongSecret = mockResponse();
    await checkoutHandler(postRequest({
      action: "finalize",
      paymentIntentId: PAYMENT_INTENT_ID,
      clientSecret: `${PAYMENT_INTENT_ID}_secret_${"x".repeat(24)}`,
    }), wrongSecret);
    assert.equal(wrongSecret.statusCode, 404);

    const mismatchedId = mockResponse();
    await checkoutHandler(postRequest({
      action: "finalize",
      paymentIntentId: `pi_${"z".repeat(24)}`,
      clientSecret: CLIENT_SECRET,
    }), mismatchedId);
    assert.equal(mismatchedId.statusCode, 404);
  }, { MICRO_OFFER_ACCESS_URL: "https://www.skool.com/esempio" }));

test("un pagamento non riuscito non espone il link di accesso", () =>
  withEnvironment(async () => {
    global.fetch = async () => json(storedIntent({ status: "requires_payment_method" }));
    const res = mockResponse();
    await checkoutHandler(postRequest({
      action: "finalize",
      paymentIntentId: PAYMENT_INTENT_ID,
      clientSecret: CLIENT_SECRET,
    }), res);
    assert.equal(res.payload.paid, false);
    assert.equal(res.payload.accessUrl, null);
  }, { MICRO_OFFER_ACCESS_URL: "https://www.skool.com/esempio" }));

test("il webhook notifica i pagamenti Micro Offer e ignora gli altri PaymentIntent", () =>
  withEnvironment(async () => {
    const outbound = [];
    global.fetch = async (url) => {
      outbound.push(url);
      if (url === `https://api.stripe.com/v1/payment_intents/${PAYMENT_INTENT_ID}`) {
        return json(storedIntent());
      }
      if (url === "https://slack.com/api/chat.postMessage") {
        return json({ ok: true, channel: SLACK_CHANNEL, ts: "1700000000.000100" });
      }
      throw new Error(`fetch inatteso verso ${url}`);
    };
    const send = async (object) => {
      const rawBody = Buffer.from(JSON.stringify({
        id: `evt_${"h".repeat(24)}`,
        type: "payment_intent.succeeded",
        data: { object },
      }));
      const res = mockResponse();
      await webhookHandler({
        method: "POST",
        headers: { "stripe-signature": signedHeader(rawBody) },
        body: rawBody,
      }, res);
      return res;
    };

    const tirana = await send({ id: `pi_${"t".repeat(24)}`, object: "payment_intent", metadata: {} });
    assert.equal(tirana.statusCode, 200);
    assert.deepEqual(outbound, []);

    const microOffer = await send(storedIntent());
    assert.equal(microOffer.statusCode, 200);
    assert.equal(outbound.filter((url) => url === "https://slack.com/api/chat.postMessage").length, 1);
  }, { SLACK_BOT_TOKEN: SLACK_TOKEN, SLACK_CHANNEL_ID: SLACK_CHANNEL }));
