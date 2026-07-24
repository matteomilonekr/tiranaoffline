import { getPlan, getQueryParam } from "./paypal/_shared.js";
import {
  methodNotAllowed,
  safeErrorResponse,
  sendJson,
  verifyTicketShareToken,
} from "./_funnel.js";

function getSharedTicket(req, res) {
  const token = getQueryParam(req, "token").trim();
  const payload = verifyTicketShareToken(token);
  const plan = getPlan(payload.planId, { allowLegacy: true });
  return sendJson(res, 200, {
    displayName: payload.displayName,
    expiresAt: payload.expiresAt,
    plan: {
      id: plan.id,
      name: plan.name,
      participantCount: plan.participantCount,
      builderSlots: plan.builderSlots,
    },
  });
}

export default function handler(req, res) {
  try {
    if (req.method === "GET") return getSharedTicket(req, res);
    return methodNotAllowed(res, ["GET"]);
  } catch (error) {
    return safeErrorResponse(
      res,
      error,
      "Non è stato possibile aprire il biglietto condiviso.",
    );
  }
}
