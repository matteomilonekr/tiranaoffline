import assert from "node:assert/strict";
import test from "node:test";

import {
  SlackNotificationError,
  buildLeadSlackMessage,
  buildPaidTicketSlackMessage,
  buildTicketSlackMessage,
  hasSlackNotificationConfig,
  sendSlackNotification,
} from "../api/_slack.js";

const TEST_SLACK_TOKEN = "xoxb-1234567890-test-token";
const TEST_SLACK_CHANNEL = "C12345678";

function withSlackEnvironment(values, run) {
  const names = ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const previousFetch = global.fetch;

  for (const name of names) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
      global.fetch = previousFetch;
    });
}

function pendingOrder(overrides = {}) {
  return {
    orderId: "TIR-ORD-ABCDEF123456",
    registrationId: "TIR-REG-123456ABCDEF",
    status: "PENDING_BANK_TRANSFER",
    price: "277.90",
    reference: "TIRANA OFFLINE TIR-ORD-ABCDEF123456",
    bank: { iban: "IT00 TEST IBAN DA NON INVIARE" },
    plan: {
      id: "solo-full",
      name: "Builder Pass + Solo OS",
      price: "277.90",
      priceFormatted: "€ 277,90",
      coupon: { code: "VIP30", discountPercent: 30 },
    },
    ...overrides,
  };
}

function customer(overrides = {}) {
  return {
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario.rossi@example.com",
    phone: "+39 333 123 4567",
    referral: "Andrea Bianchi",
    companyName: "Rossi SRL DA NON INVIARE",
    address: "Via Segreta 1 DA NON INVIARE",
    city: "Milano DA NON INVIARE",
    taxId: "IT12345678901-DA-NON-INVIARE",
    ...overrides,
  };
}

test("costruisce il payload lead con fallback e soli dati operativi ammessi", () => {
  const message = buildLeadSlackMessage({
    name: "Giulia Verdi",
    email: "giulia@example.com",
    phone: "+39 320 000 0000",
    referral: "LinkedIn",
    source: "home-pre-checkout",
    plan: "solo-mid",
    address: "Via Lead Segreta 9",
    taxId: "TAX-LEAD-SEGRETO",
    iban: "IT00-LEAD-SEGRETO",
  }, "TIR-REG-LEAD123456");
  const serialized = JSON.stringify(message);

  assert.match(message.text, /Nuovo lead Tirana Offline Mode/);
  assert.match(message.text, /FORM COMPILATO/);
  assert.match(serialized, /TIR-REG-LEAD123456/);
  assert.match(serialized, /Giulia Verdi/);
  assert.match(serialized, /giulia@example\.com/);
  assert.match(serialized, /\+39 320 000 0000/);
  assert.match(serialized, /LinkedIn/);
  assert.match(serialized, /home-pre-checkout/);
  assert.match(serialized, /solo-mid/);
  assert.equal(message.blocks[0].type, "header");
  assert.equal(message.blocks[1].fields.length, 8);
  assert.doesNotMatch(serialized, /Via Lead Segreta 9/);
  assert.doesNotMatch(serialized, /TAX-LEAD-SEGRETO/);
  assert.doesNotMatch(serialized, /IT00-LEAD-SEGRETO/);
});

test("costruisce il payload del bonifico pending senza dati fiscali o bancari", () => {
  const message = buildTicketSlackMessage(
    pendingOrder(),
    customer(),
    "https://www.tiranaoffline.com/ticket?token=test-token",
  );
  const serialized = JSON.stringify(message);

  assert.match(message.text, /Bonifico in attesa/);
  assert.match(serialized, /IN ATTESA DI ACCREDITO/);
  assert.match(serialized, /TIR-ORD-ABCDEF123456/);
  assert.match(serialized, /Mario Rossi/);
  assert.match(serialized, /Builder Pass \+ Solo OS/);
  assert.match(serialized, /€ 277,90/);
  assert.match(serialized, /VIP30 \(-30%\)/);
  assert.match(serialized, /https:\/\/www\.tiranaoffline\.com\/ticket\?token=test-token/);
  assert.equal(message.blocks[1].fields.length, 10);
  assert.doesNotMatch(serialized, /TIRANA OFFLINE TIR-ORD-ABCDEF123456/);
  assert.doesNotMatch(serialized, /IT00 TEST IBAN DA NON INVIARE/);
  assert.doesNotMatch(serialized, /Via Segreta 1 DA NON INVIARE/);
  assert.doesNotMatch(serialized, /IT12345678901-DA-NON-INVIARE/);
  assert.doesNotMatch(serialized, /Rossi SRL DA NON INVIARE/);
});

test("distingue un Free Pass confermato dal bonifico pending", () => {
  const order = pendingOrder({
    status: "CONFIRMED_FREE",
    price: "0.00",
    reference: "",
    plan: {
      id: "solo-mid",
      name: "Workshop Pass",
      price: "0.00",
      priceFormatted: "€ 0,00",
      coupon: { code: "SOLOFREEPASS", discountPercent: 100 },
    },
  });
  const message = buildTicketSlackMessage(
    order,
    customer(),
    "https://www.tiranaoffline.com/ticket?token=free-token",
  );
  const serialized = JSON.stringify(message);

  assert.match(message.text, /Free Pass confermato/);
  assert.match(serialized, /BIGLIETTO CONFERMATO/);
  assert.match(serialized, /GRATUITO/);
  assert.match(serialized, /SOLOFREEPASS \(-100%\)/);
  assert.doesNotMatch(serialized, /IN ATTESA DI ACCREDITO/);
});

test("costruisce la notifica Stripe pagata senza dati fiscali", () => {
  const message = buildPaidTicketSlackMessage(
    pendingOrder({ status: "PAID_STRIPE", paymentMethod: "STRIPE" }),
    customer(),
    "https://www.tiranaoffline.com/ticket?token=paid-token",
  );
  const serialized = JSON.stringify(message);
  assert.match(message.text, /Pagamento Stripe confermato/);
  assert.match(serialized, /PAGAMENTO CONFERMATO/);
  assert.match(serialized, /Stripe/);
  assert.match(serialized, /paid-token/);
  assert.doesNotMatch(serialized, /Via Segreta|IT12345678901|Rossi SRL DA NON INVIARE/);
});

test("invia chat.postMessage con configurazione valida e unfurl disattivati", () =>
  withSlackEnvironment(
    {
      SLACK_BOT_TOKEN: TEST_SLACK_TOKEN,
      SLACK_CHANNEL_ID: TEST_SLACK_CHANNEL,
    },
    async () => {
      let outbound;
      global.fetch = async (url, options) => {
        outbound = {
          url: String(url),
          options,
          body: JSON.parse(options.body),
        };
        return new Response(JSON.stringify({
          ok: true,
          channel: TEST_SLACK_CHANNEL,
          ts: "1753106400.123456",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      assert.equal(hasSlackNotificationConfig(), true);
      const result = await sendSlackNotification(
        buildLeadSlackMessage({ name: "Test", email: "test@example.com" }, "TIR-REG-TEST"),
      );

      assert.deepEqual(result, {
        channel: TEST_SLACK_CHANNEL,
        ts: "1753106400.123456",
      });
      assert.equal(outbound.url, "https://slack.com/api/chat.postMessage");
      assert.equal(outbound.options.method, "POST");
      assert.equal(outbound.options.headers.Authorization, `Bearer ${TEST_SLACK_TOKEN}`);
      assert.equal(outbound.options.headers["Content-Type"], "application/json; charset=utf-8");
      assert.equal(outbound.options.signal instanceof AbortSignal, true);
      assert.equal(outbound.body.channel, TEST_SLACK_CHANNEL);
      assert.equal(outbound.body.unfurl_links, false);
      assert.equal(outbound.body.unfurl_media, false);
      assert.equal(typeof outbound.body.text, "string");
      assert.equal(Array.isArray(outbound.body.blocks), true);
      assert.doesNotMatch(JSON.stringify(outbound.body), new RegExp(TEST_SLACK_TOKEN));
    },
  ));

test("config assente, parziale o con token invalido non chiama fetch", async (t) => {
  const message = buildLeadSlackMessage(
    { name: "Test", email: "test@example.com" },
    "TIR-REG-TEST",
  );

  await t.test("entrambe le variabili assenti", () =>
    withSlackEnvironment({}, async () => {
      let fetchCalls = 0;
      global.fetch = async () => {
        fetchCalls += 1;
        throw new Error("fetch non previsto");
      };

      assert.equal(hasSlackNotificationConfig(), false);
      await assert.rejects(
        sendSlackNotification(message),
        (error) =>
          error instanceof SlackNotificationError &&
          error.status === 503 &&
          error.code === "SLACK_NOT_CONFIGURED",
      );
      assert.equal(fetchCalls, 0);
    }));

  await t.test("configurazione parziale", () =>
    withSlackEnvironment(
      { SLACK_CHANNEL_ID: TEST_SLACK_CHANNEL },
      async () => {
        let fetchCalls = 0;
        global.fetch = async () => {
          fetchCalls += 1;
          throw new Error("fetch non previsto");
        };

        assert.equal(hasSlackNotificationConfig(), true);
        await assert.rejects(
          sendSlackNotification(message),
          (error) => error.code === "SLACK_NOT_CONFIGURED",
        );
        assert.equal(fetchCalls, 0);
      },
    ));

  await t.test("token non bot", () =>
    withSlackEnvironment(
      {
        SLACK_BOT_TOKEN: "xoxp-1234567890-test-token",
        SLACK_CHANNEL_ID: TEST_SLACK_CHANNEL,
      },
      async () => {
        let fetchCalls = 0;
        global.fetch = async () => {
          fetchCalls += 1;
          throw new Error("fetch non previsto");
        };

        await assert.rejects(
          sendSlackNotification(message),
          (error) => error.code === "SLACK_NOT_CONFIGURED",
        );
        assert.equal(fetchCalls, 0);
      },
    ));
});

test("sanitizza gli errori HTTP e le risposte Slack ok false", async (t) => {
  const environment = {
    SLACK_BOT_TOKEN: TEST_SLACK_TOKEN,
    SLACK_CHANNEL_ID: TEST_SLACK_CHANNEL,
  };
  const message = buildLeadSlackMessage(
    { name: "Test", email: "test@example.com" },
    "TIR-REG-TEST",
  );

  await t.test("risposta HTTP non riuscita", () =>
    withSlackEnvironment(environment, async () => {
      global.fetch = async () => new Response(JSON.stringify({ ok: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });

      await assert.rejects(
        sendSlackNotification(message),
        (error) =>
          error instanceof SlackNotificationError &&
          error.status === 502 &&
          error.code === "SLACK_UNAVAILABLE",
      );
    }));

  await t.test("risposta applicativa ok false", () =>
    withSlackEnvironment(environment, async () => {
      global.fetch = async () => new Response(JSON.stringify({
        ok: false,
        error: "invalid_auth",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      await assert.rejects(
        sendSlackNotification(message),
        (error) => error.code === "SLACK_UNAVAILABLE",
      );
    }));
});

test("non espone token o dettagli remoti negli errori e non scrive log", () =>
  withSlackEnvironment(
    {
      SLACK_BOT_TOKEN: TEST_SLACK_TOKEN,
      SLACK_CHANNEL_ID: TEST_SLACK_CHANNEL,
    },
    async () => {
      const previousWarn = console.warn;
      const previousError = console.error;
      const logs = [];
      console.warn = (...values) => logs.push(values.join(" "));
      console.error = (...values) => logs.push(values.join(" "));
      global.fetch = async () => new Response(JSON.stringify({
        ok: false,
        error: `remote detail ${TEST_SLACK_TOKEN}`,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      try {
        await assert.rejects(
          sendSlackNotification(
            buildLeadSlackMessage({ name: "Test" }, "TIR-REG-TEST"),
          ),
          (error) => {
            const exposed = [
              String(error),
              error.stack,
              JSON.stringify(error),
              ...logs,
            ].join("\n");
            assert.doesNotMatch(exposed, new RegExp(TEST_SLACK_TOKEN));
            assert.doesNotMatch(exposed, /remote detail/);
            assert.equal(error.code, "SLACK_UNAVAILABLE");
            return true;
          },
        );
        assert.deepEqual(logs, []);
      } finally {
        console.warn = previousWarn;
        console.error = previousError;
      }
    },
  ));
