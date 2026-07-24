import { FunnelError } from "./_funnel.js";

export const PURCHASE_TERMS_VERSION = "2026-07-22-v1";
export const PURCHASE_TERMS_URL = "https://www.tiranaoffline.com/refund-policy";

export function assertPurchaseTermsAcceptance(input) {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || input.accepted !== true
    || String(input.version || "").trim() !== PURCHASE_TERMS_VERSION
  ) {
    throw new FunnelError(
      400,
      "PURCHASE_TERMS_REQUIRED",
      "Accetta la Policy di rimborso e le condizioni di acquisto prima di continuare.",
    );
  }
  return Object.freeze({
    accepted: true,
    version: PURCHASE_TERMS_VERSION,
    url: PURCHASE_TERMS_URL,
    source: "pre_checkout_checkbox",
  });
}
