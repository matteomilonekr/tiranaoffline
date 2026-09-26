import {
  assertTrustedJsonRequest,
  getHeader,
  getIdempotencyKey,
  methodNotAllowed,
  readJsonBody,
  safeErrorResponse,
  sendJson,
} from "../_funnel.js";
import {
  createMicroOfferPayment,
  finalizeMicroOfferPayment,
  getMicroOfferPublicConfig,
} from "./_shared.js";

// GET: catalogo e chiave pubblicabile per la pagina di checkout.
// POST: paga con il ConfirmationToken di Stripe Elements, oppure
// { action: "finalize" } dalla pagina di conferma per verificare l'esito.
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return sendJson(res, 200, getMicroOfferPublicConfig());
    }
    if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

    assertTrustedJsonRequest(req);
    const body = await readJsonBody(req);
    if (body?.action === "finalize") {
      return sendJson(res, 200, await finalizeMicroOfferPayment(body));
    }
    const payment = await createMicroOfferPayment(body, {
      origin: String(getHeader(req, "origin") || ""),
      idempotencyKey: getIdempotencyKey(req),
    });
    return sendJson(res, 200, payment);
  } catch (error) {
    return safeErrorResponse(
      res,
      error,
      "Non è stato possibile completare il pagamento. Riprova tra poco.",
    );
  }
}
