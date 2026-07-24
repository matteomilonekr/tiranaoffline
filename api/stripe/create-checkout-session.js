import { applyCouponToPlan } from "../_coupons.js";
import {
  PUBLIC_PLAN_IDS,
  assertTrustedJsonRequest,
  createRecordId,
  getIdempotencyKey,
  methodNotAllowed,
  readJsonBody,
  safeErrorResponse,
  sendJson,
} from "../_funnel.js";
import {
  assertExpectedPricingStage,
  assertPlanAvailability,
  getInventorySnapshot,
  getPlan,
  validateCustomer,
} from "../paypal/_shared.js";
import { captureTrackingContext } from "../_meta-conversions.js";
import { assertPurchaseTermsAcceptance } from "../_purchase-terms.js";
import {
  assertNoClientPricing,
  createStripeCheckoutSession,
  getStripePublicConfig,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    assertTrustedJsonRequest(req);
    const body = await readJsonBody(req);
    assertNoClientPricing(body);
    const planId = String(body?.planId || "").trim();
    if (!PUBLIC_PLAN_IDS.includes(planId)) {
      return sendJson(res, 400, {
        error: { code: "INVALID_PLAN", message: "Seleziona un piano valido." },
      });
    }
    const inventory = getInventorySnapshot();
    const plan = applyCouponToPlan(
      getPlan(planId, { allowLegacy: true, inventory }),
      body?.couponCode,
    );
    assertExpectedPricingStage(plan, body?.expectedPricingStage);
    assertPlanAvailability(plan, inventory);
    const customer = validateCustomer(body?.customer);
    const tracking = captureTrackingContext(req, body?.tracking);
    const purchaseTerms = assertPurchaseTermsAcceptance(body?.purchaseTerms);
    const idempotencyKey = getIdempotencyKey(
      req,
      `${plan.id}:${plan.coupon?.code || "standard"}:${customer.email}`,
    );
    const registrationId = createRecordId(
      "TIR-REG",
      `stripe:${plan.id}:${customer.email}:${idempotencyKey}`,
    );
    const orderId = createRecordId(
      "TIR-ORD",
      `stripe:${registrationId}:${plan.id}:${idempotencyKey}`,
    );
    const config = getStripePublicConfig();
    const session = await createStripeCheckoutSession(
      { plan, customer, orderId, registrationId, tracking, purchaseTerms },
      idempotencyKey,
    );
    return sendJson(res, 201, {
      ok: true,
      sessionId: session.id,
      url: session.url,
      mode: config.mode,
    });
  } catch (error) {
    return safeErrorResponse(
      res,
      error,
      "Non è stato possibile preparare il pagamento con Stripe.",
    );
  }
}
