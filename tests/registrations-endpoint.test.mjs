import assert from "node:assert/strict";
import test from "node:test";

import registrationsHandler from "../api/registrations.js";
import registrationSessionHandler from "../api/registration-session.js";

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

function request(body, headers = {}) {
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

function validRegistration(overrides = {}) {
  return {
    name: "  Mario   Rossi  ",
    email: "Mario.Rossi@Example.com",
    phone: "+39 333 123 4567",
    referral: "Andrea Bianchi",
    source: "ticket-gate",
    plan: "solo-full",
    website: "",
    ...overrides,
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
  delete process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  delete process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  process.env.GOOGLE_SHEETS_REQUIRED = "false";
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

function resendResponse(status = 200, payload = { id: "email_123" }) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("invia a Resend una notifica server-side normalizzata e idempotente", () =>
  withEnvironment(async () => {
    let outbound = null;
    global.fetch = async (url, options) => {
      outbound = { url: String(url), options, body: JSON.parse(options.body) };
      return resendResponse();
    };

    const req = request(validRegistration(), {
      "idempotency-key": "registration-test-1234",
    });
    const res = mockResponse();
    await registrationsHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.match(res.payload.registrationId, /^TIR-REG-[A-F0-9]{12}$/);
    assert.equal(res.payload.next, "/offerta");
    assert.equal(res.payload.notification, "sent");
    assert.match(res.headers["set-cookie"], /^tirana_funnel=/);
    assert.match(res.headers["set-cookie"], /HttpOnly; Secure; SameSite=Lax/);
    const sessionRes = mockResponse();
    await registrationSessionHandler(
      { method: "GET", headers: { cookie: res.headers["set-cookie"].split(";", 1)[0] } },
      sessionRes,
    );
    assert.equal(sessionRes.statusCode, 200);
    assert.equal(sessionRes.payload.authenticated, true);
    assert.equal(sessionRes.payload.registrationId, res.payload.registrationId);
    assert.equal(
      outbound.url,
      "https://api.resend.com/emails",
    );
    assert.equal(outbound.options.method, "POST");
    assert.equal(outbound.options.headers.Authorization, "Bearer test-resend-key");
    assert.equal(outbound.options.headers["User-Agent"], "tiranaoffline.com/1.0");
    assert.equal(
      outbound.options.headers["Idempotency-Key"],
      "tirana-registration-registration-test-1234",
    );
    assert.deepEqual(outbound.body.to, [
      "matteo@milonematteo.com",
      "evento@tiranaoffline.com",
    ]);
    assert.equal(outbound.body.from, "Scalers <evento@tiranaoffline.com>");
    assert.equal(outbound.body.reply_to, "support@example.com");
    assert.match(outbound.body.subject, /^\[TIRANA\]\[LEAD\] TIR-REG-[A-F0-9]{12}/);
    assert.match(outbound.body.text, /Nome: Mario Rossi/);
    assert.match(outbound.body.text, /Email: mario\.rossi@example\.com/);
    assert.match(outbound.body.text, /Referral: Andrea Bianchi/);
    assert.match(outbound.body.html, /Mario Rossi/);
    assert.deepEqual(outbound.body.tags, [
      { name: "event", value: "tirana-offline" },
      { name: "record_type", value: "lead" },
      { name: "form_status", value: "completed" },
    ]);
    assert.equal(outbound.body.headers["X-Tirana-Record-Type"], "lead");
    assert.doesNotMatch(outbound.options.headers["Idempotency-Key"], /example|mario/i);
    assert.equal(JSON.stringify(res.payload).includes("mario.rossi@example.com"), false);
  }));

test("invia a Slack la notifica lead dopo la registrazione", () =>
  withEnvironment(async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-slack-token";
    process.env.SLACK_CHANNEL_ID = "C0BJTBFBLR0";
    const outbound = [];
    global.fetch = async (url, options) => {
      const request = { url: String(url), options, body: JSON.parse(options.body) };
      outbound.push(request);
      if (request.url === "https://slack.com/api/chat.postMessage") {
        return new Response(JSON.stringify({
          ok: true,
          channel: "C0BJTBFBLR0",
          ts: "1721577000.000100",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return resendResponse();
    };

    const res = mockResponse();
    await registrationsHandler(
      request(validRegistration(), { "idempotency-key": "registration-slack-1234" }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.notification, "sent");
    const slackRequest = outbound.find(
      ({ url }) => url === "https://slack.com/api/chat.postMessage",
    );
    assert.ok(slackRequest);
    assert.equal(slackRequest.options.method, "POST");
    assert.equal(slackRequest.options.headers.Authorization, "Bearer xoxb-test-slack-token");
    assert.equal(slackRequest.body.channel, "C0BJTBFBLR0");
    assert.match(slackRequest.body.text, /Mario Rossi/);
    assert.match(slackRequest.body.text, /FORM COMPILATO/);
    assert.match(JSON.stringify(slackRequest.body.blocks), /mario\.rossi@example\.com/);
    assert.equal(slackRequest.body.unfurl_links, false);
    assert.equal(slackRequest.body.unfurl_media, false);
    assert.equal(JSON.stringify(res.payload).includes("xoxb-test-slack-token"), false);
  }));

test("un errore Slack non blocca la registrazione e non espone il token", () =>
  withEnvironment(async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-secret-token";
    process.env.SLACK_CHANNEL_ID = "C0BJTBFBLR0";
    const previousWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    global.fetch = async (url) => {
      if (String(url) === "https://slack.com/api/chat.postMessage") {
        return new Response(JSON.stringify({ ok: false, error: "not_in_channel" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return resendResponse();
    };

    try {
      const res = mockResponse();
      await registrationsHandler(request(validRegistration()), res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.payload.ok, true);
      assert.equal(res.payload.notification, "sent");
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0][1].channel, "slack");
      assert.equal(JSON.stringify(warnings).includes("xoxb-test-secret-token"), false);
      assert.equal(JSON.stringify(res.payload).includes("not_in_channel"), false);
    } finally {
      console.warn = previousWarn;
    }
  }));

test("salva il lead nel foglio prima di inviare la notifica Resend", () =>
  withEnvironment(async () => {
    process.env.GOOGLE_SHEETS_WEBHOOK_URL =
      "https://script.google.com/macros/s/test-deployment/exec";
    process.env.GOOGLE_SHEETS_WEBHOOK_SECRET =
      "test-google-sheets-secret-with-at-least-32-characters";
    process.env.GOOGLE_SHEETS_REQUIRED = "true";
    const sequence = [];
    let sheetRequest;

    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (String(url).startsWith("https://script.google.com/")) {
        sequence.push("google-sheets");
        sheetRequest = { url: String(url), options, body };
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: body.data.registrationId,
          ticketId: "",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      sequence.push("resend");
      return resendResponse();
    };

    const res = mockResponse();
    await registrationsHandler(
      request(validRegistration(), { "idempotency-key": "registration-sheet-1234" }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.deepEqual(sequence, ["google-sheets", "resend"]);
    assert.equal(sheetRequest.body.event, "lead_registered");
    assert.equal(sheetRequest.body.data.registrationId, res.payload.registrationId);
    assert.equal(sheetRequest.body.data.ticketId, "");
    assert.equal(sheetRequest.body.data.registrationStatus, "FORM COMPILATO");
    assert.equal(sheetRequest.body.data.email, "mario.rossi@example.com");
    assert.equal(sheetRequest.body.data.firstName, "Mario Rossi");
  }));

test("solo il form ticket-gate abilita l’accesso ai biglietti", () =>
  withEnvironment(async () => {
    global.fetch = async () => resendResponse();
    const res = mockResponse();
    await registrationsHandler(
      request(validRegistration({ source: "home-pre-checkout", plan: "" })),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.next, null);
    assert.equal(res.headers["set-cookie"], undefined);
  }));

test("genera una chiave deterministica quando il client non ne invia una", () =>
  withEnvironment(async () => {
    const keys = [];
    global.fetch = async (_url, options) => {
      keys.push(options.headers["Idempotency-Key"]);
      return resendResponse();
    };

    for (let index = 0; index < 2; index += 1) {
      const res = mockResponse();
      await registrationsHandler(request(validRegistration()), res);
      assert.equal(res.statusCode, 200);
    }

    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.match(keys[0], /^tirana-registration-[a-f0-9]{64}$/);
  }));

test("il campo honeypot risponde con successo senza inviare email", () =>
  withEnvironment(async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      return resendResponse();
    };

    const res = mockResponse();
    await registrationsHandler(
      request({ website: "https://spam.example", name: "Bot", email: "bad" }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true });
    assert.equal(fetchCalls, 0);
  }));

test("rifiuta origine cross-site o assente prima di chiamare Resend", () =>
  withEnvironment(async () => {
    global.fetch = async () => {
      throw new Error("Resend non deve essere chiamato");
    };

    for (const req of [
      request(validRegistration(), {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      }),
      request(validRegistration(), { origin: "" }),
    ]) {
      const res = mockResponse();
      await registrationsHandler(req, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.payload.error.code, "ORIGIN_NOT_ALLOWED");
    }
  }));

test("rifiuta nome, email e chiave di idempotenza non validi", () =>
  withEnvironment(async () => {
    global.fetch = async () => {
      throw new Error("Resend non deve essere chiamato");
    };

    const cases = [
      [request(validRegistration({ name: "1" })), "INVALID_REGISTRATION"],
      [request(validRegistration({ email: "email-non-valida" })), "INVALID_REGISTRATION"],
      [
        request(validRegistration(), { "idempotency-key": "bad key" }),
        "INVALID_IDEMPOTENCY_KEY",
      ],
    ];

    for (const [req, code] of cases) {
      const res = mockResponse();
      await registrationsHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.payload.error.code, code);
    }
  }));

test("applica il limite del body e richiede JSON", () =>
  withEnvironment(async () => {
    global.fetch = async () => {
      throw new Error("Resend non deve essere chiamato");
    };

    const oversized = request(JSON.stringify({ value: "x".repeat(4_096) }));
    const oversizedRes = mockResponse();
    await registrationsHandler(oversized, oversizedRes);
    assert.equal(oversizedRes.statusCode, 413);
    assert.equal(oversizedRes.payload.error.code, "PAYLOAD_TOO_LARGE");

    const wrongType = request(validRegistration(), { "content-type": "text/plain" });
    const wrongTypeRes = mockResponse();
    await registrationsHandler(wrongType, wrongTypeRes);
    assert.equal(wrongTypeRes.statusCode, 415);
    assert.equal(wrongTypeRes.payload.error.code, "JSON_REQUIRED");
  }));

test("registra il lead senza esporre dettagli quando Resend fallisce", () =>
  withEnvironment(async () => {
    const previousWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    global.fetch = async () =>
      resendResponse(500, {
        error: "provider-internal-secret",
        api_key: "do-not-expose",
      });

    try {
      const res = mockResponse();
      await registrationsHandler(request(validRegistration()), res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.payload.ok, true);
      assert.equal(res.payload.next, "/offerta");
      assert.equal(res.payload.notification, "deferred");
      assert.match(res.headers["set-cookie"], /^tirana_funnel=/);
      assert.equal(warnings.length, 1);
      assert.equal(JSON.stringify(res.payload).includes("provider-internal-secret"), false);
      assert.equal(JSON.stringify(res.payload).includes("do-not-expose"), false);
      assert.equal(JSON.stringify(warnings).includes("provider-internal-secret"), false);
      assert.equal(JSON.stringify(warnings).includes("do-not-expose"), false);
    } finally {
      console.warn = previousWarn;
    }
  }));

test("se la configurazione email manca registra comunque il lead", () =>
  withEnvironment(async () => {
    delete process.env.RESEND_FROM;
    const previousWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    global.fetch = async () => {
      throw new Error("Resend non deve essere chiamato");
    };

    try {
      const res = mockResponse();
      await registrationsHandler(request(validRegistration()), res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.payload.ok, true);
      assert.equal(res.payload.notification, "deferred");
      assert.match(res.headers["set-cookie"], /^tirana_funnel=/);
      assert.equal(warnings.length, 1);
      assert.equal(JSON.stringify(res.payload).includes("RESEND"), false);
    } finally {
      console.warn = previousWarn;
    }
  }));

test("accetta solo POST", () =>
  withEnvironment(async () => {
    const req = request(validRegistration());
    req.method = "GET";
    const res = mockResponse();
    await registrationsHandler(req, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, "POST");
    assert.equal(res.payload.error.code, "METHOD_NOT_ALLOWED");
  }));
