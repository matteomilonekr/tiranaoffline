import {
  getPlan,
  getQueryParam,
  handleError,
  methodNotAllowed,
  paypalRequest,
  sanitizeOrder,
  sendJson,
  validateOrderId,
  verifyCheckoutToken,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const orderId = validateOrderId(
      getQueryParam(req, "orderId") || getQueryParam(req, "order_id"),
    );
    const planId = getQueryParam(req, "plan").trim();
    const expectedPlanId = getPlan(planId, { allowLegacy: true }).id;
    verifyCheckoutToken(orderId, expectedPlanId, getQueryParam(req, "token"));
    const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);

    return sendJson(res, 200, sanitizeOrder(order, expectedPlanId));
  } catch (error) {
    return handleError(res, error);
  }
}
