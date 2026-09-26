import {
  getHeader,
  methodNotAllowed,
  safeErrorResponse,
  sendJson,
} from "../_funnel.js";
import {
  fulfillPaidStripeSession,
  readStripeWebhookBody,
  verifyStripeWebhookSignature,
} from "./_shared.js";
import { notifyMicroOfferPaymentFromWebhook } from "../micro-offer/_shared.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const rawBody = await readStripeWebhookBody(req);
    verifyStripeWebhookSignature(rawBody, getHeader(req, "stripe-signature"));
    let event;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return sendJson(res, 400, {
        error: { code: "STRIPE_WEBHOOK_INVALID", message: "Webhook Stripe non valido." },
      });
    }
    if (event?.type === "checkout.session.completed") {
      await fulfillPaidStripeSession(event?.data?.object);
    }
    if (event?.type === "payment_intent.succeeded") {
      await notifyMicroOfferPaymentFromWebhook(event?.data?.object);
    }
    return sendJson(res, 200, { received: true });
  } catch (error) {
    return safeErrorResponse(res, error, "Il webhook Stripe non è stato elaborato.");
  }
}
