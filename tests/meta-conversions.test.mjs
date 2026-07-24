import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildMetaPurchaseEvent,
  captureTrackingContext,
  metaPurchaseEventId,
  sendMetaPurchase,
} from "../api/_meta-conversions.js";

const order = {
  orderId: "TIR-ORD-ABCDEF123456",
  plan: {
    id: "solo-full",
    name: "Builder Pass + Solo OS",
    currency: "EUR",
    price: "277.90",
  },
};

const customer = {
  firstName: "Mario",
  lastName: "Rossi",
  email: "Mario.Rossi@Example.com",
  phone: "+39 333 123 4567",
  city: "Milano",
  postalCode: "20121",
  countryCode: "IT",
};

const tracking = {
  consent: { analytics: true, marketing: true },
  fbp: "fb.1.1720000000000.1234567890",
  fbc: "fb.1.1720000000000.AQz-click-id",
  clientIp: "203.0.113.42",
  clientUserAgent: "Mozilla/5.0 Test Browser",
  eventSourceUrl: "https://www.tiranaoffline.com/checkout?utm_source=meta",
};

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

async function withMetaEnvironment(run) {
  const names = [
    "META_CAPI_ACCESS_TOKEN",
    "META_PIXEL_ID",
    "META_GRAPH_API_VERSION",
    "META_TEST_EVENT_CODE",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const previousFetch = global.fetch;
  process.env.META_CAPI_ACCESS_TOKEN = `EAA${"x".repeat(80)}`;
  process.env.META_PIXEL_ID = "2605330299866744";
  process.env.META_GRAPH_API_VERSION = "v23.0";
  delete process.env.META_TEST_EVENT_CODE;
  try {
    await run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    global.fetch = previousFetch;
  }
}

test("costruisce Purchase CAPI con revenue e dati cliente hashati", () => {
  const event = buildMetaPurchaseEvent({
    order,
    customer,
    tracking,
    eventTime: 1_720_000_000_000,
  });
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_time, 1_720_000_000);
  assert.equal(event.event_id, metaPurchaseEventId(order.orderId));
  assert.equal(event.action_source, "website");
  assert.equal(event.event_source_url, tracking.eventSourceUrl);
  assert.equal(event.custom_data.value, 277.9);
  assert.equal(event.custom_data.currency, "EUR");
  assert.deepEqual(event.custom_data.content_ids, ["solo-full"]);
  assert.equal(event.custom_data.order_id, order.orderId);
  assert.deepEqual(event.user_data.em, [sha256("mario.rossi@example.com")]);
  assert.deepEqual(event.user_data.ph, [sha256("393331234567")]);
  assert.deepEqual(event.user_data.fn, [sha256("mario")]);
  assert.deepEqual(event.user_data.ln, [sha256("rossi")]);
  assert.equal(event.user_data.client_ip_address, tracking.clientIp);
  assert.equal(event.user_data.client_user_agent, tracking.clientUserAgent);
  assert.equal(event.user_data.fbp, tracking.fbp);
  assert.equal(event.user_data.fbc, tracking.fbc);
  assert.doesNotMatch(JSON.stringify(event), /Mario\.Rossi@Example\.com|\+39 333|"Mario"|"Rossi"/);
});

test("cattura IP e user agent soltanto dopo il consenso marketing", () => {
  const req = {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
      "user-agent": "Mozilla/5.0 Verified Browser",
    },
  };
  const allowed = captureTrackingContext(req, {
    ...tracking,
    clientIp: "198.51.100.1",
    clientUserAgent: "spoofed",
  });
  assert.equal(allowed.clientIp, "203.0.113.10");
  assert.equal(allowed.clientUserAgent, "Mozilla/5.0 Verified Browser");

  const denied = captureTrackingContext(req, {
    consent: { analytics: true, marketing: false },
    fbp: tracking.fbp,
  });
  assert.deepEqual(denied, { consent: { analytics: true, marketing: false } });
});

test("invia Purchase al Pixel con token server-side e senza PII in chiaro", () =>
  withMetaEnvironment(async () => {
    let request;
    global.fetch = async (url, options) => {
      request = { url: String(url), options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const result = await sendMetaPurchase({ order, customer, tracking });
    assert.equal(result.status, "sent");
    assert.equal(result.eventsReceived, 1);
    assert.equal(
      request.url,
      "https://graph.facebook.com/v23.0/2605330299866744/events",
    );
    assert.match(request.options.headers.Authorization, /^Bearer EAA/);
    assert.equal(request.body.data[0].event_id, metaPurchaseEventId(order.orderId));
    assert.doesNotMatch(JSON.stringify(request.body), /Mario\.Rossi@Example\.com|\+39 333/);
  }));

test("senza consenso marketing non chiama Meta Conversions API", () =>
  withMetaEnvironment(async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error("fetch non previsto");
    };
    const result = await sendMetaPurchase({
      order,
      customer,
      tracking: { consent: { analytics: true, marketing: false } },
    });
    assert.equal(result.status, "skipped-consent");
    assert.equal(fetchCalls, 0);
  }));
