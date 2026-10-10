import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import callApplicationsHandler, {
  CALL_BOTTLENECKS,
  CALL_READINESS,
  CALL_REVENUE,
  CALL_SEGMENTS,
  CALL_TEAM,
  qualifyCallApplication,
  validateCallApplication,
} from "../api/call-applications.js";
import { buildCallApplicationSlackMessage } from "../api/_slack.js";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM",
  "RESEND_REPLY_TO",
  "REGISTRATION_NOTIFY_TO",
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "CALL_BOOKING_URL",
  "CALL_FUNNEL_WEBHOOK_URL",
  "CALL_FUNNEL_WEBHOOK_SECRET",
];

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
      "idempotency-key": "call-test-application-1",
      ...headers,
    },
    body,
  };
}

function validApplication(overrides = {}) {
  return {
    segment: "agenzia",
    revenue: "10-30k",
    team: "2-5",
    bottlenecks: ["delivery", "vendita", "delivery"],
    challenge: "  Passo 15 ore a settimana   sui report  ",
    readiness: "ready",
    firstName: "  Mario ",
    lastName: "Rossi",
    email: "Mario.Rossi@Example.com",
    phone: "+39 333 123 4567",
    link: "@mariorossi",
    website: "",
    privacy: true,
    tracking: { utm_source: "meta", utm_campaign: "agenzie-vsl", per: "agenzie", ignored: "x" },
    ...overrides,
  };
}

async function withEnvironment(env, run) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const previousFetch = global.fetch;
  const calls = [];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true, id: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await run(calls);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = previousFetch;
  }
}

test("normalizza una candidatura valida", () => {
  const application = validateCallApplication(validApplication());
  assert.equal(application.spam, false);
  assert.equal(application.firstName, "Mario");
  assert.equal(application.email, "mario.rossi@example.com");
  assert.equal(application.challenge, "Passo 15 ore a settimana sui report");
  assert.deepEqual(application.bottlenecks, ["delivery", "vendita"]);
  assert.deepEqual(application.tracking, {
    utm_source: "meta",
    utm_campaign: "agenzie-vsl",
    per: "agenzie",
  });
});

test("rifiuta dati mancanti o fuori elenco", () => {
  for (const overrides of [
    { email: "non-una-email" },
    { phone: "123" },
    { privacy: false },
    { segment: "influencer" },
    { revenue: "1m" },
    { bottlenecks: [] },
    { bottlenecks: ["delivery", "golf"] },
    { readiness: "" },
    { firstName: "" },
  ]) {
    assert.throws(
      () => validateCallApplication(validApplication(overrides)),
      (error) => error.status === 400 && error.code === "INVALID_DATA",
      JSON.stringify(overrides),
    );
  }
});

test("qualifica solo chi ha fatturato e budget", () => {
  const base = validateCallApplication(validApplication());
  assert.deepEqual(qualifyCallApplication(base), { qualified: true, priority: "A", reasons: [] });
  assert.equal(qualifyCallApplication({ ...base, revenue: "3-10k" }).priority, "B");
  assert.equal(qualifyCallApplication({ ...base, readiness: "partner" }).priority, "B");
  assert.deepEqual(qualifyCallApplication({ ...base, revenue: "lt-3k" }).reasons, ["revenue"]);
  assert.deepEqual(
    qualifyCallApplication({ ...base, revenue: "lt-3k", readiness: "no-budget" }).reasons,
    ["revenue", "budget"],
  );
});

test("al lead qualificato restituisce il calendario Calendly precompilato", () =>
  withEnvironment({ CALL_BOOKING_URL: "https://calendly.com/scalers/ai-os-call" }, async () => {
    const res = mockResponse();
    await callApplicationsHandler(request(validApplication()), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.qualified, true);
    assert.match(res.payload.applicationId, /^CALL-APP-[A-F0-9]{12}$/);
    assert.equal(res.payload.booking.provider, "calendly");
    const url = new URL(res.payload.booking.url);
    assert.equal(url.origin + url.pathname, "https://calendly.com/scalers/ai-os-call");
    assert.equal(url.searchParams.get("name"), "Mario Rossi");
    assert.equal(url.searchParams.get("email"), "mario.rossi@example.com");
    assert.equal(url.searchParams.get("embed_domain"), "www.tiranaoffline.com");
    assert.equal(url.searchParams.get("embed_type"), "Inline");
  }));

test("il lead non idoneo non riceve il calendario", () =>
  withEnvironment({ CALL_BOOKING_URL: "https://cal.com/scalers/ai-os" }, async () => {
    const res = mockResponse();
    await callApplicationsHandler(request(validApplication({ readiness: "no-budget" })), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.qualified, false);
    assert.equal(res.payload.next, "/call/non-idoneo");
    assert.equal(res.payload.booking, undefined);
    assert.doesNotMatch(JSON.stringify(res.payload), /cal\.com/);
  }));

test("ignora calendari su host non ammessi", () =>
  withEnvironment({ CALL_BOOKING_URL: "https://evil.example.com/booking" }, async () => {
    const res = mockResponse();
    await callApplicationsHandler(request(validApplication()), res);
    assert.equal(res.payload.qualified, true);
    assert.equal(res.payload.booking, null);
  }));

test("il campo trappola chiude la richiesta senza notifiche", () =>
  withEnvironment({ CALL_FUNNEL_WEBHOOK_URL: "https://hooks.example.com/call" }, async (calls) => {
    const res = mockResponse();
    await callApplicationsHandler(request(validApplication({ website: "https://spam.example" })), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.qualified, false);
    assert.equal(calls.length, 0);
  }));

test("rifiuta richieste da un'altra origine", async () => {
  const res = mockResponse();
  await callApplicationsHandler(
    request(validApplication(), { origin: "https://evil.example.com", "sec-fetch-site": "cross-site" }),
    res,
  );
  assert.equal(res.statusCode, 403);
});

test("invia email interna, Slack e webhook firmato", () =>
  withEnvironment(
    {
      RESEND_API_KEY: "test-resend-key",
      RESEND_FROM: "Scalers <evento@tiranaoffline.com>",
      REGISTRATION_NOTIFY_TO: "matteo@milonematteo.com",
      SLACK_BOT_TOKEN: "xoxb-test-token-1234567890",
      SLACK_CHANNEL_ID: "C0123456789",
      CALL_FUNNEL_WEBHOOK_URL: "https://hooks.example.com/call",
      CALL_FUNNEL_WEBHOOK_SECRET: "webhook-secret-with-at-least-32-characters",
    },
    async (calls) => {
      const res = mockResponse();
      await callApplicationsHandler(request(validApplication()), res);
      assert.equal(res.statusCode, 200);

      const email = calls.find((call) => call.url === "https://api.resend.com/emails");
      const slack = calls.find((call) => call.url === "https://slack.com/api/chat.postMessage");
      const webhook = calls.find((call) => call.url === "https://hooks.example.com/call");
      assert.ok(email && slack && webhook);

      const emailBody = JSON.parse(email.options.body);
      assert.match(emailBody.subject, /^\[CALL\]\[QUALIFICATO-A\] Mario Rossi · Agenzia/);
      assert.deepEqual(emailBody.to, ["matteo@milonematteo.com"]);

      const signature = webhook.options.headers["X-Call-Funnel-Signature"];
      const expected = createHmac("sha256", "webhook-secret-with-at-least-32-characters")
        .update(webhook.options.body)
        .digest("hex");
      assert.equal(signature, `sha256=${expected}`);
      const payload = JSON.parse(webhook.options.body);
      assert.equal(payload.event, "call_application");
      assert.equal(payload.applicationId, res.payload.applicationId);
      assert.equal(payload.qualification.qualified, true);
    },
  ));

test("il messaggio Slack rispetta il limite di 10 campi per sezione", () => {
  const rows = Array.from({ length: 13 }, (_, index) => [`Campo ${index}`, `Valore ${index}`]);
  rows[0] = ["Esito", "QUALIFICATO (A)"];
  const message = buildCallApplicationSlackMessage(rows);
  const sections = message.blocks.filter((block) => block.type === "section");
  assert.ok(sections.every((block) => !block.fields || block.fields.length <= 10));
  assert.match(message.blocks[0].text.text, /qualificata/);
  assert.match(message.text, /Campo 12: Valore 12/);
});

test("il form usa esattamente le opzioni accettate dall'API", async () => {
  const page = await read("public/call/index.html");
  const groups = {
    segment: CALL_SEGMENTS,
    revenue: CALL_REVENUE,
    team: CALL_TEAM,
    bottlenecks: CALL_BOTTLENECKS,
    readiness: CALL_READINESS,
  };
  for (const [name, options] of Object.entries(groups)) {
    const values = [...page.matchAll(new RegExp(`name="${name}" value="([^"]+)"`, "g"))].map((m) => m[1]);
    assert.deepEqual(values.sort(), Object.keys(options).sort(), name);
  }
  for (const field of ["firstName", "lastName", "email", "phone", "link", "website", "privacy", "challenge"]) {
    assert.match(page, new RegExp(`name="${field}"`), field);
  }
});

test("routing e CSP del funnel sono coerenti con gli host del calendario", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  const api = await read("api/call-applications.js");
  const script = await read("public/call/assets/call-funnel.js");

  for (const path of ["/call", "/call/confermata", "/call/non-idoneo"]) {
    const rewrite = vercel.rewrites.find((entry) => entry.source === path);
    assert.equal(rewrite?.destination, `${path}/index.html`, path);
  }
  const catchAll = vercel.rewrites.at(-1);
  assert.equal(catchAll.destination, "/index.html");
  assert.match(catchAll.source, /\|call\)/);

  const apiHosts = [...api.matchAll(/\["([a-z.]+)", "(?:calendly|cal|leadconnector)"\]/g)].map((m) => m[1]);
  const scriptHosts = JSON.parse(script.match(/BOOKING_HOSTS = (\[[^\]]+\])/)[1].replaceAll("'", '"'));
  assert.deepEqual(scriptHosts.sort(), apiHosts.sort());

  const csp = (source) =>
    vercel.headers
      .find((entry) => entry.source === source)
      .headers.find((header) => header.key === "Content-Security-Policy").value;
  const landingCsp = csp("/call((?!/confermata).*)");
  const confirmedCsp = csp("/call/confermata(.*)");
  for (const host of apiHosts) {
    assert.match(landingCsp, new RegExp(`frame-src[^;]*https://${host.replaceAll(".", "\\.")}( |;)`), host);
    assert.match(confirmedCsp, new RegExp(`frame-ancestors[^;]*https://${host.replaceAll(".", "\\.")}( |;)`), host);
  }
  assert.match(landingCsp, /frame-ancestors 'none'/);
});

test("le pagine del funnel caricano analytics, stile e script condivisi", async () => {
  for (const [file, page] of [
    ["public/call/index.html", "landing"],
    ["public/call/confermata/index.html", "confirmed"],
    ["public/call/non-idoneo/index.html", "disqualified"],
  ]) {
    const html = await read(file);
    assert.match(html, new RegExp(`data-page="${page}"`), file);
    assert.match(html, /\/tirana\/assets\/analytics\.js/, file);
    assert.match(html, /\/call\/assets\/call-funnel\.css/, file);
    assert.match(html, /\/call\/assets\/call-funnel\.js/, file);
  }
  const analytics = await read("public/tirana/assets/analytics.js");
  assert.match(analytics, /trackLead: \(options\) => trackFunnelStep\('generate_lead', 'Lead'/);
  assert.match(analytics, /trackSchedule: \(options\) => trackFunnelStep\('book_appointment', 'Schedule'/);
});
