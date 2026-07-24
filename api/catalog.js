import {
  CURRENCY,
  getInventorySnapshot,
  getPlan,
  getQueryParam,
} from "./paypal/_shared.js";
import { applyCouponToPlan } from "./_coupons.js";
import {
  PUBLIC_PLAN_IDS,
  methodNotAllowed,
  sendJson,
} from "./_funnel.js";

function catalogError(res, error) {
  const status = Number(error?.status) || 500;
  const code = status < 500 ? error?.code || "CATALOG_ERROR" : "CATALOG_UNAVAILABLE";
  const message =
    status < 500
      ? error?.message || "Catalogo non disponibile."
      : "Il catalogo non è momentaneamente disponibile.";
  return sendJson(res, status, { error: { code, message } });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const inventory = getInventorySnapshot();
    const planId = getQueryParam(req, "plan").trim();
    const couponCode = getQueryParam(req, "coupon");
    const common = {
      currency: CURRENCY,
      paymentMethod: "stripe",
      paymentMethods: ["stripe", "bank-transfer"],
      inventory,
      pricingPolicy: {
        mode: "deadline",
        rule: "deadline-only",
        automaticInventory: false,
      },
    };
    if (planId) {
      if (!PUBLIC_PLAN_IDS.includes(planId)) {
        return sendJson(res, 400, {
          error: { code: "INVALID_PLAN", message: "Seleziona un piano valido." },
        });
      }
      return sendJson(res, 200, {
        ...common,
        plan: applyCouponToPlan(
          getPlan(planId, { allowLegacy: true, inventory }),
          couponCode,
        ),
      });
    }
    if (couponCode.trim()) {
      return sendJson(res, 400, {
        error: {
          code: "COUPON_REQUIRES_PLAN",
          message: "Seleziona un ticket prima di applicare il coupon.",
        },
      });
    }
    return sendJson(res, 200, {
      ...common,
      plans: PUBLIC_PLAN_IDS.map((id) =>
        getPlan(id, { allowLegacy: true, inventory }),
      ),
    });
  } catch (error) {
    return catalogError(res, error);
  }
}
