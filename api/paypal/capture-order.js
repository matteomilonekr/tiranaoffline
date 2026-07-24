import {
  assertTrustedJsonRequest,
  getPlan,
  getRequestId,
  handleError,
  methodNotAllowed,
  paypalRequest,
  readJsonBody,
  rejectClientPricing,
  sanitizeOrder,
  sendJson,
  validateOrder,
  validateOrderId,
  verifyCheckoutToken,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    assertTrustedJsonRequest(req);
    const body = await readJsonBody(req);
    rejectClientPricing(body);
    const orderId = validateOrderId(body.orderId);
    const expectedPlanId = getPlan(body.planId, { allowLegacy: true }).id;
    verifyCheckoutToken(orderId, expectedPlanId, body.checkoutToken);

    const currentOrder = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    validateOrder(currentOrder, expectedPlanId);

    if (currentOrder.status === "COMPLETED") {
      const sanitizedOrder = sanitizeOrder(currentOrder, expectedPlanId);
      return sendJson(res, sanitizedOrder.paymentCompleted ? 200 : 202, {
        ...sanitizedOrder,
        idempotentReplay: true,
      });
    }
    if (currentOrder.status !== "APPROVED") {
      return sendJson(res, 409, {
        error: {
          code: "ORDER_NOT_APPROVED",
          message: "Completa prima l’autorizzazione del pagamento.",
        },
      });
    }

    const requestId = getRequestId(req, "capture-order", orderId);
    let capturedOrder;
    try {
      capturedOrder = await paypalRequest(
        `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        {
          method: "POST",
          requestId,
          preferRepresentation: true,
          body: {},
        },
      );
    } catch (captureError) {
      if (Number(captureError?.status) < 500) throw captureError;

      try {
        const reconciledOrder = await paypalRequest(
          `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        );
        const sanitizedOrder = sanitizeOrder(reconciledOrder, expectedPlanId);
        if (sanitizedOrder.paymentCompleted) {
          return sendJson(res, 200, {
            ...sanitizedOrder,
            requestId,
            reconciledAfterCaptureError: true,
          });
        }
      } catch {
        // Conserva l'errore originale della capture se anche la riconciliazione fallisce.
      }

      throw captureError;
    }

    validateOrder(capturedOrder, expectedPlanId);
    const sanitizedOrder = sanitizeOrder(capturedOrder, expectedPlanId);
    return sendJson(res, sanitizedOrder.paymentCompleted ? 200 : 202, {
      ...sanitizedOrder,
      requestId,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
