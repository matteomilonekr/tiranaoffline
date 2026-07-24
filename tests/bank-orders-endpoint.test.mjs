import assert from "node:assert/strict";
import test from "node:test";

import bankOrdersHandler from "../api/bank-orders.js";
import catalogHandler from "../api/catalog.js";
import sharedTicketHandler from "../api/shared-ticket.js";
import { getPlan } from "../api/paypal/_shared.js";

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
      ...headers,
    },
    body,
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

function withEnvironment(run) {
  const previous = {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM,
    replyTo: process.env.RESEND_REPLY_TO,
    notifyTo: process.env.REGISTRATION_NOTIFY_TO,
    funnelSecret: process.env.TIRANA_FUNNEL_SECRET,
    sheetsUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL,
    sheetsSecret: process.env.GOOGLE_SHEETS_WEBHOOK_SECRET,
    sheetsRequired: process.env.GOOGLE_SHEETS_REQUIRED,
    slackToken: process.env.SLACK_BOT_TOKEN,
    slackChannel: process.env.SLACK_CHANNEL_ID,
    fetch: global.fetch,
  };
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM = "Scalers <evento@tiranaoffline.com>";
  process.env.RESEND_REPLY_TO = "support@example.com";
  process.env.REGISTRATION_NOTIFY_TO =
    "matteo@milonematteo.com, evento@tiranaoffline.com";
  process.env.TIRANA_FUNNEL_SECRET = "test-funnel-secret-with-at-least-32-characters";
  process.env.GOOGLE_SHEETS_WEBHOOK_URL =
    "https://script.google.com/macros/s/test-deployment/exec";
  process.env.GOOGLE_SHEETS_WEBHOOK_SECRET =
    "test-google-sheets-secret-with-at-least-32-characters";
  process.env.GOOGLE_SHEETS_REQUIRED = "true";
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [name, value] of [
        ["RESEND_API_KEY", previous.apiKey],
        ["RESEND_FROM", previous.from],
        ["RESEND_REPLY_TO", previous.replyTo],
        ["REGISTRATION_NOTIFY_TO", previous.notifyTo],
        ["TIRANA_FUNNEL_SECRET", previous.funnelSecret],
        ["GOOGLE_SHEETS_WEBHOOK_URL", previous.sheetsUrl],
        ["GOOGLE_SHEETS_WEBHOOK_SECRET", previous.sheetsSecret],
        ["GOOGLE_SHEETS_REQUIRED", previous.sheetsRequired],
        ["SLACK_BOT_TOKEN", previous.slackToken],
        ["SLACK_CHANNEL_ID", previous.slackChannel],
      ]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      global.fetch = previous.fetch;
    });
}

test("il catalogo pubblico espone i sei ticket con Stripe e bonifico", async () => {
  const res = mockResponse();
  await catalogHandler({ method: "GET", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.paymentMethod, "stripe");
  assert.deepEqual(res.payload.paymentMethods, ["stripe", "bank-transfer"]);
  assert.deepEqual(
    res.payload.plans.map(({ id }) => id),
    ["solo-mid", "solo-full", "agency-mid", "agency-full", "company-mid", "company-full"],
  );
});

test("registra il biglietto nel foglio e invia due email Resend più Slack", () =>
  withEnvironment(async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-slack-token";
    process.env.SLACK_CHANNEL_ID = "C0BJTBFBLR0";
    const outbound = [];
    let sheetOutbound = null;
    let slackOutbound = null;
    const sequence = [];
    global.fetch = async (url, options) => {
      const request = { url: String(url), options, body: JSON.parse(options.body) };
      if (request.url.startsWith("https://script.google.com/")) {
        sequence.push("google-sheets");
        sheetOutbound = request;
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: request.body.data.registrationId,
          ticketId: request.body.data.ticketId,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (request.url === "https://slack.com/api/chat.postMessage") {
        sequence.push("slack");
        slackOutbound = request;
        return new Response(JSON.stringify({
          ok: true,
          channel: "C0BJTBFBLR0",
          ts: "1721577000.000200",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      sequence.push("resend");
      outbound.push(request);
      return new Response(JSON.stringify({ id: `email_${outbound.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const plan = getPlan("solo-mid", { allowLegacy: true });
    assert.equal(plan.name, "Workshop Pass");
    assert.doesNotMatch(plan.description, /Solo OS/i);
    const req = postRequest(
      {
        planId: plan.id,
        expectedPricingStage: plan.pricingStage,
        customer: customer(),
      },
      { "idempotency-key": "bank-order-test-1234" },
    );
    const res = mockResponse();
    await bankOrdersHandler(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.ok, true);
    assert.match(res.payload.orderId, /^TIR-ORD-[A-F0-9]{12}$/);
    assert.equal(res.payload.status, "PENDING_BANK_TRANSFER");
    assert.match(res.payload.token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.match(res.payload.shareToken, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.match(res.payload.shareUrl, /^https:\/\/www\.tiranaoffline\.com\/ticket\?token=/);
    assert.deepEqual(res.payload.notifications, {
      internal: "sent",
      customer: "sent",
    });
    assert.match(res.payload.next, /^\/thank-you\?payment=bank&token=.*&share=/);
    assert.equal(res.payload.next.includes("mario"), false);
    assert.ok(sheetOutbound);
    assert.equal(
      sheetOutbound.url,
      "https://script.google.com/macros/s/test-deployment/exec",
    );
    assert.equal(sheetOutbound.options.method, "POST");
    assert.equal(sheetOutbound.options.headers["Content-Type"], "application/json");
    assert.equal(sheetOutbound.body.schemaVersion, 1);
    assert.equal(sheetOutbound.body.event, "ticket_registered");
    assert.equal(
      sheetOutbound.body.secret,
      "test-google-sheets-secret-with-at-least-32-characters",
    );
    assert.equal(sheetOutbound.body.data.ticketId, res.payload.orderId);
    assert.match(sheetOutbound.body.data.registrationId, /^TIR-REG-[A-F0-9]{12}$/);
    assert.equal(sheetOutbound.body.data.paymentStatus, "IN ATTESA DI ACCREDITO");
    assert.equal(sheetOutbound.body.data.paymentMethod, "BONIFICO");
    assert.equal(sheetOutbound.body.data.planId, "solo-mid");
    assert.equal(sheetOutbound.body.data.firstName, "Mario");
    assert.equal(sheetOutbound.body.data.lastName, "Rossi");
    assert.equal(sheetOutbound.body.data.email, "mario.rossi@example.com");
    assert.equal(sheetOutbound.body.data.ticketUrl, res.payload.shareUrl);
    assert.deepEqual(sequence, ["google-sheets", "resend", "resend", "slack"]);
    assert.equal(outbound.length, 2);
    assert.deepEqual(outbound.map(({ url }) => url), [
      "https://api.resend.com/emails",
      "https://api.resend.com/emails",
    ]);
    assert.equal(outbound[0].options.headers.Authorization, "Bearer test-resend-key");
    assert.ok(slackOutbound);
    assert.equal(slackOutbound.options.method, "POST");
    assert.equal(slackOutbound.options.headers.Authorization, "Bearer xoxb-test-slack-token");
    assert.equal(slackOutbound.body.channel, "C0BJTBFBLR0");
    assert.match(slackOutbound.body.text, /Mario Rossi/);
    assert.match(slackOutbound.body.text, /IN ATTESA DI ACCREDITO/);
    assert.match(slackOutbound.body.text, /Workshop Pass/);
    assert.match(slackOutbound.body.text, /€ 97/);
    assert.match(JSON.stringify(slackOutbound.body.blocks), /mario\.rossi@example\.com/);
    assert.doesNotMatch(JSON.stringify(slackOutbound.body), /AL662021|IT12345678901|Via Roma 1/);
    assert.equal(outbound[0].body.from, "Scalers <evento@tiranaoffline.com>");
    assert.deepEqual(outbound[0].body.to, [
      "matteo@milonematteo.com",
      "evento@tiranaoffline.com",
    ]);
    assert.equal(outbound[0].body.reply_to, "support@example.com");
    assert.deepEqual(outbound[0].body.tags, [
      { name: "event", value: "tirana-offline" },
      { name: "record_type", value: "bank-order" },
      { name: "payment_status", value: "pending" },
    ]);
    assert.match(outbound[0].body.subject, /^\[TIRANA\]\[BONIFICO\]/);
    assert.match(outbound[0].body.text, /Registrazione: TIR-REG-[A-F0-9]{12}/);
    assert.deepEqual(outbound[1].body.to, ["mario.rossi@example.com"]);
    assert.deepEqual(outbound[1].body.tags, [
      { name: "event", value: "tirana-offline" },
      { name: "record_type", value: "bank-instructions" },
    ]);
    assert.notEqual(
      outbound[0].options.headers["Idempotency-Key"],
      outbound[1].options.headers["Idempotency-Key"],
    );
    assert.equal(
      outbound[1].body.subject,
      "Tirana Offline Mode | Il tuo biglietto è registrato",
    );
    assert.doesNotMatch(outbound[1].body.subject, /ordine/i);
    assert.doesNotMatch(outbound[1].body.text, /ordine/i);
    assert.doesNotMatch(outbound[1].body.html, /ordine/i);
    assert.doesNotMatch(outbound[1].body.text, /Solo OS/i);
    assert.match(outbound[1].body.text, /STATO: IN ATTESA DI ACCREDITO/);
    assert.match(outbound[1].body.text, /Nominativo: Mario Rossi/);
    assert.match(outbound[1].body.text, /Accessi: 1 partecipante · Workshop Pass/);
    assert.match(outbound[1].body.text, /Apri il biglietto personalizzato: https:\/\/www\.tiranaoffline\.com\/ticket\?token=/);
    assert.match(outbound[1].body.text, /Condividi su WhatsApp:/);
    assert.match(outbound[1].body.text, /Condividi su LinkedIn:/);
    assert.match(outbound[1].body.text, /GRUPPO WHATSAPP WORKSHOP \+ BUILDER PASS/);
    assert.match(outbound[1].body.text, /https:\/\/chat\.whatsapp\.com\/INqwNswve0XB5PENoWuUX9\?s=cl&p=i&ilr=0&amv=0/);
    assert.match(outbound[1].body.text, /4 e 5 settembre 2026/);
    assert.match(outbound[1].body.text, /Piramide di Tirana, Albania/);
    assert.match(outbound[1].body.text, /SCALERS SHPK/);
    assert.match(
      outbound[1].body.text,
      /RR 4 DESHMORET PALLATI NR 10 DYQ 6, TIRANE, ALBANIA/,
    );
    assert.match(outbound[1].body.text, /Raiffeisen Bank Sha/);
    assert.match(outbound[1].body.text, /AL66202111850000000011988925/);
    assert.match(outbound[1].body.text, /CAUSALE OBBLIGATORIA DA INSERIRE NEL BONIFICO/);
    assert.match(outbound[1].body.text, new RegExp(`TIRANA OFFLINE ${res.payload.orderId}`));
    assert.match(outbound[1].body.text, /Contatta l’assistenza: evento@tiranaoffline\.com/);
    assert.match(outbound[1].body.html, /Causale obbligatoria da inserire nel bonifico/);
    assert.match(outbound[1].body.html, new RegExp(`TIRANA OFFLINE ${res.payload.orderId}`));
    assert.match(outbound[1].body.html, /data-email-ticket="personalized"/);
    assert.match(outbound[1].body.html, />BOOTCAMP<\/td>/);
    assert.doesNotMatch(outbound[1].body.html, />ACCELERATION<\/td>/);
    assert.match(outbound[1].body.html, /Mario Rossi/);
    assert.match(outbound[1].body.html, /1 partecipante · Workshop Pass/);
    assert.match(outbound[1].body.html, /#9B6CFF/);
    assert.match(outbound[1].body.html, /#7C3CFF/);
    assert.match(outbound[1].body.html, /#D8C9FF/);
    assert.match(outbound[1].body.html, /#F8F6FF/);
    assert.match(outbound[1].body.html, /background:#050507/);
    assert.doesNotMatch(outbound[1].body.html, /#FFD93D|#FF6B6B/);
    assert.match(outbound[1].body.html, /SCALERS \/ OFFLINE MODE/);
    assert.match(outbound[1].body.html, /Biglietto registrato\./);
    assert.match(outbound[1].body.html, /abbiamo registrato il tuo biglietto/);
    assert.match(outbound[1].body.html, /TICKET REGISTRATO · CONFERMA DOPO ACCREDITO/);
    assert.match(outbound[1].body.html, /02 \/ Coordinate bonifico/);
    assert.match(outbound[1].body.html, /<meta name="color-scheme" content="dark">/);
    assert.match(outbound[1].body.html, /ASSISTENZA WHATSAPP/);
    assert.match(outbound[1].body.html, /data-share="open"/);
    assert.match(outbound[1].body.html, /data-share="whatsapp"/);
    assert.match(outbound[1].body.html, /data-share="linkedin"/);
    assert.match(outbound[1].body.html, /data-email-group="workshop-builder-pass"/);
    assert.match(outbound[1].body.html, /data-group-cta="whatsapp"/);
    assert.match(outbound[1].body.html, /https:\/\/www\.tiranaoffline\.com\/tirana\/assets\/workshop-builder-pass-whatsapp\.jpg/);
    assert.match(outbound[1].body.html, /Anteprima del gruppo WhatsApp Workshop \+ Builder PASS/);
    assert.match(outbound[1].body.html, /https:\/\/chat\.whatsapp\.com\/INqwNswve0XB5PENoWuUX9\?s=cl&amp;p=i&amp;ilr=0&amp;amv=0/);
    assert.match(outbound[1].body.html, /https:\/\/www\.tiranaoffline\.com\/ticket\?token=/);
    assert.match(outbound[1].body.html, /mailto:evento@tiranaoffline\.com/);
    assert.equal(
      outbound[1].body.headers["X-Tirana-Payment-Status"],
      "pending",
    );

    const sharePayload = JSON.parse(
      Buffer.from(res.payload.shareToken.split(".")[1], "base64url").toString("utf8"),
    );
    assert.equal(sharePayload.typ, "ticket-share");
    assert.equal(sharePayload.dn, "Mario R.");
    assert.equal(sharePayload.pid, "solo-mid");
    for (const sensitiveField of ["oid", "rid", "price", "email", "reference", "iban"]) {
      assert.equal(Object.hasOwn(sharePayload, sensitiveField), false);
    }

    const sharedRes = mockResponse();
    await sharedTicketHandler(
      { method: "GET", headers: {}, query: { token: res.payload.shareToken } },
      sharedRes,
    );
    assert.equal(sharedRes.statusCode, 200);
    assert.deepEqual(sharedRes.payload, {
      displayName: "Mario R.",
      expiresAt: sharePayload.exp,
      plan: {
        id: "solo-mid",
        name: plan.name,
        participantCount: plan.participantCount,
        builderSlots: plan.builderSlots,
      },
    });
    assert.equal(JSON.stringify(sharedRes.payload).includes("iban"), false);
    assert.equal(JSON.stringify(sharedRes.payload).includes(res.payload.orderId), false);

    const privateTokenRes = mockResponse();
    await sharedTicketHandler(
      { method: "GET", headers: {}, query: { token: res.payload.token } },
      privateTokenRes,
    );
    assert.equal(privateTokenRes.statusCode, 401);

    const detailsRes = mockResponse();
    await bankOrdersHandler(
      { method: "GET", headers: {}, query: { token: res.payload.token } },
      detailsRes,
    );
    assert.equal(detailsRes.statusCode, 200);
    assert.equal(detailsRes.payload.orderId, res.payload.orderId);
    assert.equal(detailsRes.payload.status, "PENDING_BANK_TRANSFER");
    assert.equal(detailsRes.payload.plan.id, "solo-mid");
    assert.equal(detailsRes.payload.bank.beneficiary, "SCALERS SHPK");
    assert.equal(
      detailsRes.payload.bank.address,
      "RR 4 DESHMORET PALLATI NR 10 DYQ 6, TIRANE, ALBANIA",
    );
    assert.equal(detailsRes.payload.bank.bank, "Raiffeisen Bank Sha");
    assert.equal(detailsRes.payload.bank.iban, "AL66202111850000000011988925");
    assert.equal(detailsRes.payload.bank.swift, "SGSBALTXXX");
    assert.equal(detailsRes.payload.reference, `TIRANA OFFLINE ${res.payload.orderId}`);
  }));

test("restituisce comunque il biglietto quando Resend non è disponibile", () =>
  withEnvironment(async () => {
    delete process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    delete process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
    process.env.GOOGLE_SHEETS_REQUIRED = "false";
    const previousWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    global.fetch = async () =>
      new Response(JSON.stringify({ message: "provider unavailable" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const plan = getPlan("solo-mid", { allowLegacy: true });
      const res = mockResponse();
      await bankOrdersHandler(
        postRequest(
          {
            planId: plan.id,
            expectedPricingStage: plan.pricingStage,
            customer: customer(),
          },
          { "idempotency-key": "bank-order-resend-failure-1234" },
        ),
        res,
      );

      assert.equal(res.statusCode, 201);
      assert.equal(res.payload.ok, true);
      assert.match(res.payload.orderId, /^TIR-ORD-[A-F0-9]{12}$/);
      assert.match(res.payload.token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      assert.deepEqual(res.payload.notifications, {
        internal: "deferred",
        customer: "deferred",
      });
      assert.equal(warnings.length, 2);
      assert.equal(JSON.stringify(warnings).includes("provider unavailable"), false);
      assert.equal(JSON.stringify(res.payload).includes("provider unavailable"), false);
    } finally {
      console.warn = previousWarn;
    }
  }));

test("non invia email né restituisce il ticket se Google Sheets non salva la riga", () =>
  withEnvironment(async () => {
    let fetchCalls = 0;
    global.fetch = async (url) => {
      fetchCalls += 1;
      assert.match(String(url), /^https:\/\/script\.google\.com\//);
      return new Response(JSON.stringify({ ok: false, error: "INTERNAL_ERROR" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const plan = getPlan("solo-mid", { allowLegacy: true });
    const res = mockResponse();
    await bankOrdersHandler(
      postRequest(
        {
          planId: plan.id,
          expectedPricingStage: plan.pricingStage,
          customer: customer(),
        },
        { "idempotency-key": "bank-order-sheet-failure-1234" },
      ),
      res,
    );

    assert.equal(fetchCalls, 1);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.payload, {
      error: {
        code: "SHEET_UNAVAILABLE",
        message: "Non è stato possibile registrare il biglietto. Riprova tra poco.",
      },
    });
    assert.equal(JSON.stringify(res.payload).includes("secret"), false);
    assert.equal(JSON.stringify(res.payload).includes("script.google.com"), false);
  }));
