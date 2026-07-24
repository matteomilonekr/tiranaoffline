import assert from "node:assert/strict";
import test from "node:test";

import { applyCouponToPlan, normalizeCouponCode } from "../api/_coupons.js";
import { createBankOrderToken } from "../api/_funnel.js";
import bankOrdersHandler from "../api/bank-orders.js";
import catalogHandler from "../api/catalog.js";
import { getPlan, validateCustomer } from "../api/paypal/_shared.js";

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

function postRequest(body, idempotencyKey = "coupon-order-test-1234") {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "www.tiranaoffline.com",
      origin: "https://www.tiranaoffline.com",
      "sec-fetch-site": "same-origin",
      "idempotency-key": idempotencyKey,
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
    referral: "",
    companyName: "Rossi SRL",
    address: "Via Roma 1",
    city: "Milano",
    countryCode: "IT",
    postalCode: "20121",
    taxId: "IT12345678901",
  };
}

function withEnvironment(run) {
  const names = [
    "RESEND_API_KEY",
    "RESEND_FROM",
    "RESEND_REPLY_TO",
    "REGISTRATION_NOTIFY_TO",
    "TIRANA_FUNNEL_SECRET",
    "GOOGLE_SHEETS_WEBHOOK_URL",
    "GOOGLE_SHEETS_WEBHOOK_SECRET",
    "GOOGLE_SHEETS_REQUIRED",
    "SLACK_BOT_TOKEN",
    "SLACK_CHANNEL_ID",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const previousFetch = global.fetch;
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM = "Scalers <evento@tiranaoffline.com>";
  process.env.RESEND_REPLY_TO = "support@example.com";
  process.env.REGISTRATION_NOTIFY_TO =
    "matteo@milonematteo.com, evento@tiranaoffline.com";
  process.env.TIRANA_FUNNEL_SECRET =
    "test-funnel-secret-with-at-least-32-characters";
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
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
      global.fetch = previousFetch;
    });
}

test("VIP al 50% è disattivato per nuovi utilizzi ma resta leggibile nello storico", () => {
  assert.equal(normalizeCouponCode("  vip  "), "VIP");
  assert.equal(normalizeCouponCode("ＶＩＰ"), "VIP");

  assert.throws(
    () => applyCouponToPlan(getPlan("solo-mid", { stage: 0 }), "VIP"),
    (error) => error.status === 400 && error.code === "INVALID_COUPON",
  );

  const workshop = applyCouponToPlan(
    getPlan("solo-mid", { stage: 0 }),
    " vip ",
    { allowInactive: true },
  );
  const builder = applyCouponToPlan(
    getPlan("solo-full", { stage: 0 }),
    "VIP",
    { allowInactive: true },
  );

  assert.equal(workshop.originalPrice, "97.00");
  assert.equal(workshop.price, "48.50");
  assert.equal(workshop.priceFormatted, "€ 48,50");
  assert.equal(workshop.discountAmount, "48.50");
  assert.deepEqual(workshop.coupon, { code: "VIP", discountPercent: 50 });
  assert.equal(builder.originalPrice, "397.00");
  assert.equal(builder.price, "198.50");
  assert.equal(builder.priceFormatted, "€ 198,50");

});

test("VIP712 applica il 50% soltanto ai ticket individuali", () => {
  assert.equal(normalizeCouponCode("  vip712  "), "VIP712");

  const workshop = applyCouponToPlan(
    getPlan("solo-mid", { stage: 0 }),
    " vip712 ",
  );
  const builder = applyCouponToPlan(
    getPlan("solo-full", { stage: 0 }),
    "VIP712",
  );

  assert.equal(workshop.originalPrice, "97.00");
  assert.equal(workshop.price, "48.50");
  assert.equal(workshop.priceFormatted, "€ 48,50");
  assert.equal(workshop.discountAmount, "48.50");
  assert.deepEqual(workshop.coupon, { code: "VIP712", discountPercent: 50 });
  assert.equal(builder.originalPrice, "397.00");
  assert.equal(builder.price, "198.50");
  assert.equal(builder.priceFormatted, "€ 198,50");

  for (const planId of ["agency-mid", "agency-full", "company-mid", "company-full"]) {
    assert.throws(
      () => applyCouponToPlan(getPlan(planId, { stage: 0 }), "VIP712"),
      (error) => error.status === 409 && error.code === "COUPON_NOT_APPLICABLE",
    );
  }
});

test("VIP30 applica il 30% soltanto a Solo Mid e Solo Full", () => {
  assert.equal(normalizeCouponCode("  vip30  "), "VIP30");

  const workshop = applyCouponToPlan(
    getPlan("solo-mid", { stage: 0 }),
    " vip30 ",
  );
  const builder = applyCouponToPlan(
    getPlan("solo-full", { stage: 0 }),
    "VIP30",
  );

  assert.equal(workshop.originalPrice, "97.00");
  assert.equal(workshop.price, "67.90");
  assert.equal(workshop.priceFormatted, "€ 67,90");
  assert.equal(workshop.discountAmount, "29.10");
  assert.deepEqual(workshop.coupon, { code: "VIP30", discountPercent: 30 });
  assert.equal(builder.originalPrice, "397.00");
  assert.equal(builder.price, "277.90");
  assert.equal(builder.priceFormatted, "€ 277,90");

  for (const planId of ["agency-mid", "agency-full", "company-mid", "company-full"]) {
    assert.throws(
      () => applyCouponToPlan(getPlan(planId, { stage: 0 }), "VIP30"),
      (error) => error.status === 409 && error.code === "COUPON_NOT_APPLICABLE",
    );
  }
});

test("VIP20, VIP10, SOLO10 e SOLO20 applicano sconti separati soltanto ai ticket Solo", () => {
  const cases = [
    {
      code: "VIP20",
      discountPercent: 20,
      workshopPrice: "77.60",
      workshopFormatted: "€ 77,60",
      workshopDiscount: "19.40",
      builderPrice: "317.60",
      builderFormatted: "€ 317,60",
    },
    {
      code: "VIP10",
      discountPercent: 10,
      workshopPrice: "87.30",
      workshopFormatted: "€ 87,30",
      workshopDiscount: "9.70",
      builderPrice: "357.30",
      builderFormatted: "€ 357,30",
    },
    {
      code: "SOLO10",
      discountPercent: 10,
      workshopPrice: "87.30",
      workshopFormatted: "€ 87,30",
      workshopDiscount: "9.70",
      builderPrice: "357.30",
      builderFormatted: "€ 357,30",
    },
    {
      code: "SOLO20",
      discountPercent: 20,
      workshopPrice: "77.60",
      workshopFormatted: "€ 77,60",
      workshopDiscount: "19.40",
      builderPrice: "317.60",
      builderFormatted: "€ 317,60",
    },
  ];

  for (const coupon of cases) {
    assert.equal(
      normalizeCouponCode(`  ${coupon.code.toLowerCase()}  `),
      coupon.code,
    );

    const workshop = applyCouponToPlan(
      getPlan("solo-mid", { stage: 0 }),
      coupon.code,
    );
    const builder = applyCouponToPlan(
      getPlan("solo-full", { stage: 0 }),
      coupon.code,
    );

    assert.equal(workshop.originalPrice, "97.00");
    assert.equal(workshop.price, coupon.workshopPrice);
    assert.equal(workshop.priceFormatted, coupon.workshopFormatted);
    assert.equal(workshop.discountAmount, coupon.workshopDiscount);
    assert.deepEqual(workshop.coupon, {
      code: coupon.code,
      discountPercent: coupon.discountPercent,
    });
    assert.equal(builder.originalPrice, "397.00");
    assert.equal(builder.price, coupon.builderPrice);
    assert.equal(builder.priceFormatted, coupon.builderFormatted);

    for (const planId of ["agency-mid", "agency-full", "company-mid", "company-full"]) {
      assert.throws(
        () => applyCouponToPlan(getPlan(planId, { stage: 0 }), coupon.code),
        (error) => error.status === 409 && error.code === "COUPON_NOT_APPLICABLE",
      );
    }
  }
});

test("SOLOFREEPASS rende gratuito soltanto il Workshop Pass", () => {
  assert.equal(normalizeCouponCode("  solofreepass  "), "SOLOFREEPASS");

  const workshop = applyCouponToPlan(
    getPlan("solo-mid", { stage: 0 }),
    "SOLOFREEPASS",
  );
  assert.equal(workshop.originalPrice, "97.00");
  assert.equal(workshop.originalPriceFormatted, "€ 97");
  assert.equal(workshop.price, "0.00");
  assert.equal(workshop.priceFormatted, "€ 0,00");
  assert.equal(workshop.discountAmount, "97.00");
  assert.equal(workshop.discountAmountFormatted, "€ 97,00");
  assert.deepEqual(workshop.coupon, {
    code: "SOLOFREEPASS",
    discountPercent: 100,
  });

  for (const planId of [
    "solo-full",
    "agency-mid",
    "agency-full",
    "company-mid",
    "company-full",
  ]) {
    assert.throws(
      () => applyCouponToPlan(getPlan(planId, { stage: 0 }), "SOLOFREEPASS"),
      (error) =>
        error.status === 409 &&
        error.code === "COUPON_NOT_APPLICABLE" &&
        /solo per il Workshop Pass/.test(error.message),
    );
  }
});

test("i dati fiscali restano obbligatori, mentre la ragione sociale dipende dal tipo di acquirente", () => {
  const coreCustomer = {
    firstName: " Mario ",
    lastName: " Rossi ",
    email: "MARIO.ROSSI@EXAMPLE.COM",
    phone: "+39 333 123 4567",
  };

  assert.throws(
    () => validateCustomer(coreCustomer),
    (error) => error.status === 400 && error.code === "INVALID_CUSTOMER",
  );

  assert.deepEqual(validateCustomer(coreCustomer, { requireBilling: false }), {
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario.rossi@example.com",
    phone: "+39 333 123 4567",
    referral: "",
    customerType: "private",
    companyName: "",
    address: "",
    city: "",
    countryCode: "",
    postalCode: "",
    taxId: "",
  });

  const billing = {
    address: "Via Roma 1",
    city: "Milano",
    countryCode: "IT",
    postalCode: "20121",
    taxId: "RSSMRA80A01F205X",
  };
  const privateCustomer = validateCustomer({
    ...coreCustomer,
    ...billing,
    customerType: "private",
    companyName: "Questo valore non deve essere conservato",
  });
  assert.equal(privateCustomer.customerType, "private");
  assert.equal(privateCustomer.companyName, "");

  assert.throws(
    () => validateCustomer({ ...coreCustomer, ...billing, customerType: "company" }),
    (error) => error.status === 400 && error.code === "INVALID_CUSTOMER" && /ragione sociale/.test(error.message),
  );
  const companyCustomer = validateCustomer({
    ...coreCustomer,
    ...billing,
    customerType: "company",
    companyName: "Rossi SRL",
  });
  assert.equal(companyCustomer.customerType, "company");
  assert.equal(companyCustomer.companyName, "Rossi SRL");

  assert.throws(
    () => validateCustomer({ ...coreCustomer, ...billing, customerType: "altro" }),
    (error) => error.status === 400 && error.code === "INVALID_CUSTOMER" && /Privato oppure Azienda/.test(error.message),
  );
});

test("VIP30 si applica al prezzo della fase corrente senza contaminare il piano base", () => {
  const earlyBase = getPlan("solo-mid", { stage: 1 });
  const earlyVip = applyCouponToPlan(earlyBase, "VIP30");
  const finalVip = applyCouponToPlan(getPlan("solo-full", { stage: 5 }), "VIP30");

  assert.equal(earlyBase.price, "137.00");
  assert.equal(earlyBase.coupon, undefined);
  assert.equal(earlyVip.price, "95.90");
  assert.equal(earlyVip.pricingStage, earlyBase.pricingStage);
  assert.equal(earlyVip.priceValidUntil, earlyBase.priceValidUntil);
  assert.equal(finalVip.originalPrice, "897.00");
  assert.equal(finalVip.price, "627.90");
});

test("il catalogo rifiuta VIP al 50% e restituisce soltanto i coupon attivi", async () => {
  const disabled = mockResponse();
  await catalogHandler(
    { method: "GET", headers: {}, query: { plan: "solo-mid", coupon: " vip " } },
    disabled,
  );
  assert.equal(disabled.statusCode, 400);
  assert.equal(disabled.payload.error.code, "INVALID_COUPON");

  for (const expected of [
    { code: "VIP712", discountPercent: 50, price: "198.50" },
    { code: "VIP30", discountPercent: 30, price: "277.90" },
    { code: "VIP20", discountPercent: 20, price: "317.60" },
    { code: "VIP10", discountPercent: 10, price: "357.30" },
    { code: "SOLO10", discountPercent: 10, price: "357.30" },
    { code: "SOLO20", discountPercent: 20, price: "317.60" },
  ]) {
    const response = mockResponse();
    await catalogHandler(
      {
        method: "GET",
        headers: {},
        query: { plan: "solo-full", coupon: expected.code.toLowerCase() },
      },
      response,
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.plan.price, expected.price);
    assert.equal(response.payload.plan.originalPrice, "397.00");
    assert.deepEqual(response.payload.plan.coupon, {
      code: expected.code,
      discountPercent: expected.discountPercent,
    });
  }

  const freePass = mockResponse();
  await catalogHandler(
    {
      method: "GET",
      headers: {},
      query: { plan: "solo-mid", coupon: "solofreepass" },
    },
    freePass,
  );
  assert.equal(freePass.statusCode, 200);
  assert.equal(freePass.payload.plan.price, "0.00");
  assert.equal(freePass.payload.plan.originalPrice, "97.00");
  assert.deepEqual(freePass.payload.plan.coupon, {
    code: "SOLOFREEPASS",
    discountPercent: 100,
  });

  const freeBuilder = mockResponse();
  await catalogHandler(
    {
      method: "GET",
      headers: {},
      query: { plan: "solo-full", coupon: "SOLOFREEPASS" },
    },
    freeBuilder,
  );
  assert.equal(freeBuilder.statusCode, 409);
  assert.equal(freeBuilder.payload.error.code, "COUPON_NOT_APPLICABLE");

  const invalid = mockResponse();
  await catalogHandler(
    { method: "GET", headers: {}, query: { plan: "solo-mid", coupon: "NOPE" } },
    invalid,
  );
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.error.code, "INVALID_COUPON");

  const notApplicable = mockResponse();
  await catalogHandler(
    { method: "GET", headers: {}, query: { plan: "agency-full", coupon: "VIP30" } },
    notApplicable,
  );
  assert.equal(notApplicable.statusCode, 409);
  assert.equal(notApplicable.payload.error.code, "COUPON_NOT_APPLICABLE");
});

test("il bonifico ricalcola VIP30, firma il coupon e conserva il totale nel GET", () =>
  withEnvironment(async () => {
    const outbound = [];
    let sheetPayload = null;
    global.fetch = async (url, options) => {
      const request = { url: String(url), body: JSON.parse(options.body) };
      if (request.url.startsWith("https://script.google.com/")) {
        sheetPayload = request.body;
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: request.body.data.registrationId,
          ticketId: request.body.data.ticketId,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      outbound.push(request);
      return new Response(JSON.stringify({ id: `email_${outbound.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const basePlan = getPlan("solo-mid");
    const res = mockResponse();
    await bankOrdersHandler(
      postRequest({
        planId: "solo-mid",
        expectedPricingStage: basePlan.pricingStage,
        couponCode: " vip30 ",
        customer: customer(),
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(sheetPayload.data.amount, "€ 67,90");
    assert.equal(outbound.length, 2);
    assert.match(outbound[0].body.text, /Importo finale: € 67,90/);
    assert.match(outbound[1].body.text, /Importo finale: € 67,90/);
    for (const email of outbound) {
      assert.match(email.body.text, /Coupon: VIP30 \(-30%\)/);
      assert.match(email.body.text, /Prezzo originale: € 97/);
      assert.match(email.body.text, /Importo finale: € 67,90/);
    }
    assert.match(outbound[1].body.html, /Coupon/);
    assert.match(outbound[1].body.html, /VIP30 \(-30%\)/);
    assert.match(outbound[1].body.html, /Prezzo originale/);

    const tokenPayload = JSON.parse(
      Buffer.from(res.payload.token.split(".")[1], "base64url").toString("utf8"),
    );
    assert.equal(tokenPayload.coupon, "VIP30");
    assert.equal(tokenPayload.price, "67.90");

    const details = mockResponse();
    await bankOrdersHandler(
      { method: "GET", headers: {}, query: { token: res.payload.token } },
      details,
    );
    assert.equal(details.statusCode, 200);
    assert.equal(details.payload.plan.price, "67.90");
    assert.equal(details.payload.plan.coupon.code, "VIP30");
    assert.equal(details.payload.plan.originalPrice, "97.00");
  }));

test("il bonifico conserva separatamente VIP712, VIP20, VIP10, SOLO10 e SOLO20 in ticket ed email", () =>
  withEnvironment(async () => {
    const outbound = [];
    const sheetAmounts = [];
    global.fetch = async (url, options) => {
      const request = { url: String(url), body: JSON.parse(options.body) };
      if (request.url.startsWith("https://script.google.com/")) {
        sheetAmounts.push(request.body.data.amount);
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: request.body.data.registrationId,
          ticketId: request.body.data.ticketId,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      outbound.push(request);
      return new Response(JSON.stringify({ id: `email_${outbound.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const basePlan = getPlan("solo-mid");
    for (const expected of [
      { code: "VIP712", discountPercent: 50, price: "48.50", formatted: "€ 48,50" },
      { code: "VIP20", discountPercent: 20, price: "77.60", formatted: "€ 77,60" },
      { code: "VIP10", discountPercent: 10, price: "87.30", formatted: "€ 87,30" },
      { code: "SOLO10", discountPercent: 10, price: "87.30", formatted: "€ 87,30" },
      { code: "SOLO20", discountPercent: 20, price: "77.60", formatted: "€ 77,60" },
    ]) {
      const emailOffset = outbound.length;
      const res = mockResponse();
      await bankOrdersHandler(
        postRequest({
          planId: "solo-mid",
          expectedPricingStage: basePlan.pricingStage,
          couponCode: expected.code.toLowerCase(),
          customer: customer(),
        }, `coupon-order-${expected.code.toLowerCase()}-1234`),
        res,
      );

      assert.equal(res.statusCode, 201);
      assert.equal(sheetAmounts.at(-1), expected.formatted);
      const emails = outbound.slice(emailOffset);
      assert.equal(emails.length, 2);
      for (const email of emails) {
        assert.match(
          email.body.text,
          new RegExp(`Coupon: ${expected.code} \\(-${expected.discountPercent}%\\)`),
        );
        assert.match(email.body.text, new RegExp(`Importo finale: ${expected.formatted}`));
      }

      const tokenPayload = JSON.parse(
        Buffer.from(res.payload.token.split(".")[1], "base64url").toString("utf8"),
      );
      assert.equal(tokenPayload.coupon, expected.code);
      assert.equal(tokenPayload.price, expected.price);

      const details = mockResponse();
      await bankOrdersHandler(
        { method: "GET", headers: {}, query: { token: res.payload.token } },
        details,
      );
      assert.equal(details.statusCode, 200);
      assert.equal(details.payload.plan.price, expected.price);
      assert.equal(details.payload.plan.coupon.code, expected.code);
    }
  }));

test("SOLOFREEPASS conferma il ticket senza bonifico e conserva ticket e condivisione", () =>
  withEnvironment(async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-slack-token";
    process.env.SLACK_CHANNEL_ID = "C0BJTBFBLR0";
    const outbound = [];
    let sheetPayload = null;
    let slackPayload = null;
    global.fetch = async (url, options) => {
      const request = { url: String(url), body: JSON.parse(options.body) };
      if (request.url.startsWith("https://script.google.com/")) {
        sheetPayload = request.body;
        return new Response(JSON.stringify({
          ok: true,
          result: "appended",
          registrationId: request.body.data.registrationId,
          ticketId: request.body.data.ticketId,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (request.url === "https://slack.com/api/chat.postMessage") {
        slackPayload = request.body;
        return new Response(JSON.stringify({
          ok: true,
          channel: "C0BJTBFBLR0",
          ts: "1721577000.000300",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      outbound.push(request);
      return new Response(JSON.stringify({ id: `email_${outbound.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const basePlan = getPlan("solo-mid");
    const res = mockResponse();
    await bankOrdersHandler(
      postRequest({
        planId: "solo-mid",
        expectedPricingStage: basePlan.pricingStage,
        couponCode: " solofreepass ",
        customer: {
          firstName: "Mario",
          lastName: "Rossi",
          email: "mario.rossi@example.com",
          phone: "+39 333 123 4567",
        },
      }, "coupon-order-solofreepass-1234"),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.status, "CONFIRMED_FREE");
    assert.match(res.payload.next, /^\/thank-you\?payment=free&token=.*&share=/);
    assert.match(res.payload.shareToken, /^v1\./);
    assert.match(res.payload.shareUrl, /^https:\/\/www\.tiranaoffline\.com\/ticket\?token=/);
    assert.deepEqual(res.payload.notifications, {
      internal: "sent",
      customer: "sent",
    });

    assert.ok(sheetPayload);
    assert.equal(sheetPayload.data.registrationStatus, "BIGLIETTO CONFERMATO");
    assert.equal(sheetPayload.data.paymentStatus, "PAGAMENTO NON RICHIESTO");
    assert.equal(sheetPayload.data.paymentMethod, "GRATUITO");
    assert.equal(sheetPayload.data.amount, "€ 0,00");
    assert.equal(sheetPayload.data.reference, "");
    for (const field of [
      "companyName",
      "taxId",
      "address",
      "city",
      "countryCode",
      "postalCode",
    ]) {
      assert.equal(sheetPayload.data[field], "");
    }

    assert.equal(outbound.length, 2);
    assert.ok(slackPayload);
    assert.equal(slackPayload.channel, "C0BJTBFBLR0");
    assert.match(slackPayload.text, /Mario Rossi/);
    assert.match(slackPayload.text, /BIGLIETTO CONFERMATO/);
    assert.match(slackPayload.text, /GRATUITO/);
    assert.doesNotMatch(JSON.stringify(slackPayload), /IBAN|causale|accredito|bonifico/i);
    assert.match(outbound[0].body.subject, /^\[TIRANA\]\[FREE PASS\]/);
    assert.equal(
      outbound[1].body.subject,
      "Tirana Offline Mode | Il tuo Free Pass è confermato",
    );
    assert.deepEqual(outbound[0].body.tags, [
      { name: "event", value: "tirana-offline" },
      { name: "record_type", value: "free-ticket" },
      { name: "payment_status", value: "confirmed-free" },
    ]);
    assert.deepEqual(outbound[1].body.tags, [
      { name: "event", value: "tirana-offline" },
      { name: "record_type", value: "free-ticket" },
    ]);
    for (const email of outbound) {
      assert.doesNotMatch(email.body.text, /IBAN|causale|accredito|bonifico/i);
      assert.doesNotMatch(email.body.html, /IBAN|causale|accredito|bonifico/i);
      assert.match(email.body.text, /BIGLIETTO CONFERMATO|Free Pass confermato/i);
    }
    assert.match(outbound[1].body.text, /PAGAMENTO: NON RICHIESTO/);
    assert.match(outbound[1].body.text, /Importo finale: GRATUITO/);
    assert.match(outbound[1].body.html, /data-email-ticket="personalized"/);
    assert.match(outbound[1].body.html, /data-share="open"/);
    assert.match(outbound[1].body.html, /Pagamento non richiesto/);
    assert.equal(
      outbound[1].body.headers["X-Tirana-Payment-Status"],
      "confirmed-free",
    );

    const tokenPayload = JSON.parse(
      Buffer.from(res.payload.token.split(".")[1], "base64url").toString("utf8"),
    );
    assert.equal(tokenPayload.price, "0.00");
    assert.equal(tokenPayload.coupon, "SOLOFREEPASS");

    const details = mockResponse();
    await bankOrdersHandler(
      { method: "GET", headers: {}, query: { token: res.payload.token } },
      details,
    );
    assert.equal(details.statusCode, 200);
    assert.equal(details.payload.status, "CONFIRMED_FREE");
    assert.equal(details.payload.plan.price, "0.00");
    assert.equal(details.payload.plan.coupon.code, "SOLOFREEPASS");
    assert.equal(Object.hasOwn(details.payload, "bank"), false);
    assert.equal(Object.hasOwn(details.payload, "reference"), false);
  }));

test("il server rifiuta coupon errati e campi prezzo controllati dal client", () =>
  withEnvironment(async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error("fetch non previsto");
    };
    const basePlan = getPlan("solo-mid");

    const invalidCoupon = mockResponse();
    await bankOrdersHandler(
      postRequest({
        planId: "solo-mid",
        expectedPricingStage: basePlan.pricingStage,
        couponCode: "NOPE",
        customer: customer(),
      }),
      invalidCoupon,
    );
    assert.equal(invalidCoupon.statusCode, 400);
    assert.equal(invalidCoupon.payload.error.code, "INVALID_COUPON");

    const injectedPrice = mockResponse();
    await bankOrdersHandler(
      postRequest({
        planId: "solo-mid",
        expectedPricingStage: basePlan.pricingStage,
        couponCode: "VIP30",
        price: "0.01",
        discountPercent: 99,
        customer: customer(),
      }),
      injectedPrice,
    );
    assert.equal(injectedPrice.statusCode, 400);
    assert.equal(injectedPrice.payload.error.code, "CLIENT_PRICING_NOT_ALLOWED");
    assert.equal(fetchCalls, 0);
  }));

test("i token bancari senza coupon restano compatibili", () =>
  withEnvironment(async () => {
    const basePlan = getPlan("solo-mid", { stage: 0 });
    const token = createBankOrderToken({
      orderId: "TIR-ORD-ABCDEF123456",
      registrationId: "TIR-REG-123456ABCDEF",
      planId: basePlan.id,
      pricingStage: basePlan.pricingStage,
      price: basePlan.price,
      couponCode: "",
    });
    const details = mockResponse();
    await bankOrdersHandler(
      { method: "GET", headers: {}, query: { token } },
      details,
    );
    assert.equal(details.statusCode, 200);
    assert.equal(details.payload.plan.price, "97.00");
    assert.equal(details.payload.plan.coupon, undefined);
  }));

test("i token bancari già firmati con VIP al 50% restano leggibili", () =>
  withEnvironment(async () => {
    const basePlan = getPlan("solo-mid", { stage: 0 });
    const token = createBankOrderToken({
      orderId: "TIR-ORD-A1B2C3D4E5F6",
      registrationId: "TIR-REG-F6E5D4C3B2A1",
      planId: basePlan.id,
      pricingStage: basePlan.pricingStage,
      price: "48.50",
      couponCode: "VIP",
    });
    const details = mockResponse();
    await bankOrdersHandler(
      { method: "GET", headers: {}, query: { token } },
      details,
    );
    assert.equal(details.statusCode, 200);
    assert.equal(details.payload.plan.price, "48.50");
    assert.deepEqual(details.payload.plan.coupon, {
      code: "VIP",
      discountPercent: 50,
    });
  }));
