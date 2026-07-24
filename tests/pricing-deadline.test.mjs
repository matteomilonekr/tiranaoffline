import assert from "node:assert/strict";
import test from "node:test";

import { getPlan, getPlans } from "../api/paypal/_shared.js";

const assignedInventory = {
  configured: true,
  mode: "manual",
  total: { capacity: 150, assigned: 25, remaining: 125 },
  builder: { capacity: 60, assigned: 10, remaining: 50 },
};

test("i posti assegnati non anticipano i prezzi Founder", () => {
  const plans = getPlans({
    now: new Date("2026-07-18T12:00:00+02:00"),
    inventory: assignedInventory,
  });

  assert.deepEqual(
    plans.map(({ id, price, pricingPhase }) => ({ id, price, pricingPhase })),
    [
      { id: "solo-mid", price: "97.00", pricingPhase: "Founder" },
      { id: "solo-full", price: "397.00", pricingPhase: "Founder" },
      { id: "agency-mid", price: "597.00", pricingPhase: "Founder" },
      { id: "agency-full", price: "997.00", pricingPhase: "Founder" },
      { id: "company-mid", price: "997.00", pricingPhase: "Founder" },
      { id: "company-full", price: "1997.00", pricingPhase: "Founder" },
    ],
  );
  assert.ok(plans.every((plan) => plan.nextSlotThreshold === null));
  assert.ok(plans.every((plan) => plan.priceValidUntil === "2026-07-31T23:59:59+02:00"));
});

test("il primo aumento scatta dopo il 31 luglio alle 23:59", () => {
  const founder = getPlan("solo-mid", {
    now: new Date("2026-07-31T23:59:59+02:00"),
    inventory: assignedInventory,
  });
  const early = getPlan("solo-mid", {
    now: new Date("2026-08-01T00:00:00+02:00"),
    inventory: assignedInventory,
  });

  assert.equal(founder.price, "97.00");
  assert.equal(founder.pricingPhase, "Founder");
  assert.equal(early.price, "137.00");
  assert.equal(early.pricingPhase, "Early");

  const legacyFounder = getPlan("workshop-pass", {
    allowLegacy: true,
    now: new Date("2026-07-31T23:59:59+02:00"),
  });
  assert.equal(legacyFounder.price, "97.00");
});

test("l'AI Solo OS è incluso soltanto nel Builder Pass", () => {
  const workshop = getPlan("solo-mid", {
    now: new Date("2026-07-18T12:00:00+02:00"),
    inventory: assignedInventory,
  });
  const builder = getPlan("solo-full", {
    now: new Date("2026-07-18T12:00:00+02:00"),
    inventory: assignedInventory,
  });

  assert.equal(workshop.name, "Workshop Pass");
  assert.doesNotMatch(workshop.description, /Solo OS/i);
  assert.match(builder.name, /Builder Pass \+ Solo OS/i);
  assert.match(builder.description, /AI Solo OS/i);
});
