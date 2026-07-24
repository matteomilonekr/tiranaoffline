import {
  methodNotAllowed,
  safeErrorResponse,
  sendJson,
} from "../_funnel.js";
import { getQueryParam } from "../paypal/_shared.js";
import {
  publicPaidStripeSession,
  retrieveStripeCheckoutSession,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const sessionId = getQueryParam(req, "session_id").trim();
    const session = await retrieveStripeCheckoutSession(sessionId);
    return sendJson(res, 200, publicPaidStripeSession(session));
  } catch (error) {
    return safeErrorResponse(
      res,
      error,
      "Non è stato possibile verificare il pagamento con Stripe.",
    );
  }
}
