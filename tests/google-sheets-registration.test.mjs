import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  leadSheetRecord,
  paidTicketSheetRecord,
  syncTicketToGoogleSheets,
  ticketSheetRecord,
} from "../api/_google-sheets.js";

const appsScript = readFileSync(
  new URL("../google-apps-script/Code.gs", import.meta.url),
  "utf8",
);

function order() {
  return {
    orderId: "TIR-ORD-ABCDEF123456",
    registrationId: "TIR-REG-123456ABCDEF",
    pricingStage: "founder",
    price: "397.00",
    reference: "TIRANA OFFLINE TIR-ORD-ABCDEF123456",
    plan: {
      id: "solo-full",
      name: "Builder Pass + Solo OS",
      priceFormatted: "€397",
      currency: "EUR",
      participantCount: 1,
      builderSlots: 1,
    },
  };
}

function customer(overrides = {}) {
  return {
    firstName: "Mario",
    lastName: "Rossi",
    email: "Mario.Rossi@Example.com",
    phone: "+39 333 123 4567",
    referral: "Andrea Bianchi",
    companyName: "Rossi SRL",
    address: "Via Roma 1",
    city: "Milano",
    countryCode: "IT",
    postalCode: "20121",
    taxId: "IT12345678901",
    ...overrides,
  };
}

function withSheetsEnvironment(values, run) {
  const names = [
    "GOOGLE_SHEETS_WEBHOOK_URL",
    "GOOGLE_SHEETS_WEBHOOK_SECRET",
    "GOOGLE_SHEETS_REQUIRED",
  ];
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

const configuredEnvironment = {
  GOOGLE_SHEETS_WEBHOOK_URL:
    "https://script.google.com/macros/s/test-deployment/exec",
  GOOGLE_SHEETS_WEBHOOK_SECRET:
    "test-google-sheets-secret-with-at-least-32-characters",
  GOOGLE_SHEETS_REQUIRED: "true",
};

test("normalizza il record e neutralizza le formule nei dati del cliente", () => {
  const record = ticketSheetRecord(
    order(),
    customer({
      phone: "+39 333 123 4567",
      referral: "=IMPORTXML(\"https://example.com\")",
      companyName: "@azienda",
    }),
    "https://www.tiranaoffline.com/ticket?token=abc",
    new Date("2026-07-18T12:00:00.000Z"),
  );

  assert.equal(record.createdAt, "2026-07-18T12:00:00.000Z");
  assert.equal(record.email, "mario.rossi@example.com");
  assert.equal(record.phone, "'+39 333 123 4567");
  assert.equal(record.referral, "'=IMPORTXML(\"https://example.com\")");
  assert.equal(record.companyName, "'@azienda");
  assert.equal(record.ticketId, "TIR-ORD-ABCDEF123456");
  assert.equal(record.registrationId, "TIR-REG-123456ABCDEF");
});

test("registra un pagamento Stripe come pagato e confermato", () => {
  const record = paidTicketSheetRecord(
    {
      ...order(),
      status: "PAID_STRIPE",
      stripeSessionId: "cs_live_test",
      reference: "pi_test",
    },
    customer(),
    "https://www.tiranaoffline.com/ticket?token=paid",
    new Date("2026-07-22T12:00:00.000Z"),
  );
  assert.equal(record.registrationStatus, "BIGLIETTO CONFERMATO");
  assert.equal(record.paymentStatus, "PAGATO");
  assert.equal(record.paymentMethod, "STRIPE");
  assert.equal(record.reference, "pi_test");
});

test("invia il biglietto al webhook e accetta una conferma coerente", () =>
  withSheetsEnvironment(configuredEnvironment, async () => {
    let outbound;
    global.fetch = async (url, options) => {
      outbound = { url: String(url), options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        ok: true,
        result: "appended",
        registrationId: outbound.body.data.registrationId,
        ticketId: outbound.body.data.ticketId,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await syncTicketToGoogleSheets(
      order(),
      customer(),
      "https://www.tiranaoffline.com/ticket?token=abc",
    );

    assert.equal(result.ok, true);
    assert.equal(outbound.url, configuredEnvironment.GOOGLE_SHEETS_WEBHOOK_URL);
    assert.equal(outbound.options.method, "POST");
    assert.equal(outbound.options.headers["User-Agent"], "tiranaoffline.com/1.0");
    assert.equal(outbound.body.event, "ticket_registered");
    assert.equal(outbound.body.data.email, "mario.rossi@example.com");
  }));

test("fallisce in modo chiuso se il foglio non conferma lo stesso biglietto", () =>
  withSheetsEnvironment(configuredEnvironment, async () => {
    global.fetch = async () => new Response(JSON.stringify({
      ok: true,
      result: "appended",
      registrationId: "TIR-REG-FFFFFFFFFFFF",
      ticketId: "TIR-ORD-FFFFFFFFFFFF",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    await assert.rejects(
      syncTicketToGoogleSheets(
        order(),
        customer(),
        "https://www.tiranaoffline.com/ticket?token=abc",
      ),
      (error) => error.status === 502 && error.code === "SHEET_UNAVAILABLE",
    );
  }));

test("blocca il checkout quando il registro è obbligatorio ma non configurato", () =>
  withSheetsEnvironment(
    { GOOGLE_SHEETS_REQUIRED: "true" },
    async () => {
      let fetchCalls = 0;
      global.fetch = async () => {
        fetchCalls += 1;
        throw new Error("fetch non previsto");
      };

      await assert.rejects(
        syncTicketToGoogleSheets(
          order(),
          customer(),
          "https://www.tiranaoffline.com/ticket?token=abc",
        ),
        (error) => error.status === 503 && error.code === "SHEET_NOT_CONFIGURED",
      );
      assert.equal(fetchCalls, 0);
    },
  ));

test("rifiuta URL webhook esterni a Google Apps Script", () =>
  withSheetsEnvironment(
    {
      ...configuredEnvironment,
      GOOGLE_SHEETS_WEBHOOK_URL: "https://attacker.example/webhook",
    },
    async () => {
      await assert.rejects(
        syncTicketToGoogleSheets(
          order(),
          customer(),
          "https://www.tiranaoffline.com/ticket?token=abc",
        ),
        (error) => error.status === 503 && error.code === "SHEET_NOT_CONFIGURED",
      );
    },
  ));

test("il ricevitore Apps Script usa segreto, lock e upsert per ID biglietto", () => {
  assert.match(appsScript, /CONFIG_SHEET_NAME = "_Config"/);
  assert.match(appsScript, /LockService\.getScriptLock\(\)/);
  assert.match(appsScript, /lock\.tryLock\(10000\)/);
  assert.match(
    appsScript,
    /findRecordRow\(sheet, ticketId, registrationId, email\)/,
  );
  assert.match(appsScript, /existingRow \? "updated" : "appended"/);
  assert.match(appsScript, /target\.setNumberFormat\("@"\)/);
  assert.doesNotMatch(appsScript, /test-google-sheets-secret/);
});

test("il ticket aggiorna il lead e i retry mantengono una sola riga", () => {
  const rows = [new Array(28).fill("header")];
  const webhookSecret = "runtime-test-secret-with-at-least-32-characters";

  function range(row, column, rowCount = 1, columnCount = 1) {
    return {
      getDisplayValue() {
        return webhookSecret;
      },
      getDisplayValues() {
        return Array.from({ length: rowCount }, (_, rowOffset) => {
          const source = rows[row - 1 + rowOffset] || [];
          return source.slice(column - 1, column - 1 + columnCount);
        });
      },
      setNumberFormat() {
        return this;
      },
      setValues(values) {
        for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
          const targetIndex = row - 1 + rowOffset;
          if (!rows[targetIndex]) rows[targetIndex] = new Array(28).fill("");
          for (let columnOffset = 0; columnOffset < values[rowOffset].length; columnOffset += 1) {
            rows[targetIndex][column - 1 + columnOffset] = values[rowOffset][columnOffset];
          }
        }
        return this;
      },
    };
  }

  const dataSheet = {
    getLastRow: () => rows.length,
    getRange: range,
  };
  const configSheet = { getRange: () => range(1, 1) };
  const spreadsheet = {
    getSheetByName(name) {
      if (name === "Iscritti") return dataSheet;
      if (name === "_Config") return configSheet;
      return null;
    },
  };
  let lockReleases = 0;
  const context = {
    console,
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return {
          text,
          setMimeType() {
            return this;
          },
        };
      },
    },
    SpreadsheetApp: { openById: () => spreadsheet },
    LockService: {
      getScriptLock() {
        return {
          tryLock: () => true,
          releaseLock: () => {
            lockReleases += 1;
          },
        };
      },
    },
  };
  runInNewContext(appsScript, context);

  const leadData = leadSheetRecord(
    {
      name: "Mario Rossi",
      email: "mario.rossi@example.com",
      phone: "+39 333 123 4567",
      referral: "Andrea Bianchi",
      source: "ticket-gate",
      plan: "solo",
    },
    "TIR-REG-AAAAAAAAAAAA",
    new Date("2026-07-18T11:55:00.000Z"),
  );
  const ticketData = ticketSheetRecord(
    order(),
    customer(),
    "https://www.tiranaoffline.com/ticket?token=abc",
    new Date("2026-07-18T12:00:00.000Z"),
  );
  const leadEvent = {
    postData: {
      contents: JSON.stringify({
        schemaVersion: 1,
        secret: webhookSecret,
        event: "lead_registered",
        data: leadData,
      }),
    },
  };
  const ticketEvent = {
    postData: {
      contents: JSON.stringify({
        schemaVersion: 1,
        secret: webhookSecret,
        event: "ticket_registered",
        data: ticketData,
      }),
    },
  };

  const leadResult = JSON.parse(context.doPost(leadEvent).text);
  const ticketResult = JSON.parse(context.doPost(ticketEvent).text);
  const replayResult = JSON.parse(context.doPost(ticketEvent).text);

  assert.equal(leadResult.result, "appended");
  assert.equal(ticketResult.result, "updated");
  assert.equal(replayResult.result, "updated");
  assert.equal(leadResult.row, 2);
  assert.equal(ticketResult.row, 2);
  assert.equal(replayResult.row, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][2], "TIR-ORD-ABCDEF123456");
  assert.equal(rows[1][15], "mario.rossi@example.com");
  assert.equal(lockReleases, 3);
});
