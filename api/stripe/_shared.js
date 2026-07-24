import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import { applyCouponToPlan } from "../_coupons.js";
import {
  FunnelError,
  PUBLIC_PLAN_IDS,
  createTicketShareToken,
  escapeHtml,
  normalizeText,
  sendResendEmail,
} from "../_funnel.js";
import { syncPaidTicketToGoogleSheets } from "../_google-sheets.js";
import {
  metaPurchaseEventId,
  normalizeTrackingContext,
  sendMetaPurchase,
} from "../_meta-conversions.js";
import { PURCHASE_TERMS_URL } from "../_purchase-terms.js";
import {
  buildPaidTicketSlackMessage,
  hasSlackNotificationConfig,
  sendSlackNotification,
} from "../_slack.js";
import { assertPlanAvailability, getPlan, validateCustomer } from "../paypal/_shared.js";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_TIMEOUT_MS = 12_000;
const WEBHOOK_TOLERANCE_SECONDS = 300;
const MAX_WEBHOOK_BYTES = 1_048_576;
const CONTEXT_AAD = Buffer.from("tirana-stripe-context-v1", "utf8");
const CONTEXT_CHUNK_SIZE = 450;
const MAX_CONTEXT_CHUNKS = 4;
const PUBLIC_SITE_ORIGIN = "https://www.tiranaoffline.com";
const EVENT_CONTACT_EMAIL = "evento@tiranaoffline.com";
const WHATSAPP_GROUP_URL =
  "https://chat.whatsapp.com/INqwNswve0XB5PENoWuUX9?s=cl&p=i&ilr=0&amv=0";
const VALID_SECRET_KEY = /^sk_(?:live|test)_[A-Za-z0-9_]{16,}$/;
const VALID_PUBLISHABLE_KEY = /^pk_(?:live|test)_[A-Za-z0-9_]{16,}$/;
const VALID_WEBHOOK_SECRET = /^whsec_[A-Za-z0-9_]{16,}$/;
const VALID_SESSION_ID = /^cs_(?:live|test)_[A-Za-z0-9_]{16,}$/;
const VALID_PAYMENT_LINK_ID = /^plink_[A-Za-z0-9]{16,}$/;
const VALID_ORDER_ID = /^TIR-ORD-[A-F0-9]{12}$/;
const VALID_REGISTRATION_ID = /^TIR-REG-[A-F0-9]{12}$/;
const PAYMENT_LINK_REFERENCE_TTL_SECONDS = 60 * 60 * 24 * 14;
const PAYMENT_LINK_REFERENCE_VERSION = "tpl1";
const PAYMENT_LINK_REFERENCE_PATTERN = /^tpl1_(sm|sf)_([A-F0-9]{12})_([0-3])_([0-9a-z]{1,8})_([A-Za-z0-9_-]{22})$/;
const PAYMENT_LINK_CAMPAIGN_FIELDS = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);
const PAYMENT_LINK_CAMPAIGN_VALUE = /^[A-Za-z0-9_-]{1,150}$/;
export const STRIPE_PAYMENT_LINKS = Object.freeze({
  "solo-mid": Object.freeze({
    code: "sm",
    id: "plink_1TwSvTIK3hoe0GdPec3g7XDb",
    priceId: "price_1TwSufIK3hoe0GdPzHV9XDpR",
    pricingStage: 0,
    amount: 9_700,
    url: "https://buy.stripe.com/fZu9AUeYpaCm7nt6nWaIM01",
  }),
  "solo-full": Object.freeze({
    code: "sf",
    id: "plink_1Tw7x3IK3hoe0GdPZNxIWDCK",
    priceId: "price_1Tw7wxIK3hoe0GdP609mpeok",
    pricingStage: 0,
    amount: 39_700,
    url: "https://buy.stripe.com/3cIeVebMd9yiazF9A8aIM00",
  }),
});
const PAYMENT_LINK_PLANS_BY_CODE = Object.freeze(
  Object.fromEntries(
    Object.entries(STRIPE_PAYMENT_LINKS).map(([planId, config]) => [config.code, planId]),
  ),
);
const CLIENT_PRICING_FIELDS = Object.freeze([
  "price",
  "amount",
  "currency",
  "basePrice",
  "originalPrice",
  "discountPercent",
  "discountAmount",
  "coupon",
]);

function configuredSecretKey() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!VALID_SECRET_KEY.test(secretKey)) {
    throw new FunnelError(
      503,
      "STRIPE_NOT_CONFIGURED",
      "Il pagamento con carta non è momentaneamente disponibile.",
    );
  }
  return secretKey;
}

export function getStripePublicConfig() {
  const publishableKey = String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
  const secretKey = configuredSecretKey();
  if (publishableKey && !VALID_PUBLISHABLE_KEY.test(publishableKey)) {
    throw new FunnelError(
      503,
      "STRIPE_NOT_CONFIGURED",
      "Il pagamento con carta non è momentaneamente disponibile.",
    );
  }
  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";
  if (publishableKey && !publishableKey.startsWith(`pk_${mode}_`)) {
    throw new FunnelError(
      503,
      "STRIPE_MODE_MISMATCH",
      "Il pagamento con carta non è momentaneamente disponibile.",
    );
  }
  return { configured: true, mode };
}

function contextKey() {
  const secret = String(process.env.TIRANA_FUNNEL_SECRET || "").trim();
  if (Buffer.byteLength(secret) < 32) {
    throw new FunnelError(
      503,
      "FUNNEL_NOT_CONFIGURED",
      "Il percorso di pagamento non è momentaneamente disponibile.",
    );
  }
  return createHash("sha256")
    .update("tirana-stripe-context-v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

function paymentLinkReferenceSignature(payload) {
  return createHmac("sha256", contextKey())
    .update("tirana-payment-link-reference-v1\0", "utf8")
    .update(payload, "utf8")
    .digest("base64url")
    .slice(0, 22);
}

function safeEqualText(first, second) {
  const firstBuffer = Buffer.from(String(first || ""), "utf8");
  const secondBuffer = Buffer.from(String(second || ""), "utf8");
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function createPaymentLinkReference(planId, tracking, now = new Date()) {
  const config = STRIPE_PAYMENT_LINKS[planId];
  if (!config) {
    throw new FunnelError(400, "PAYMENT_LINK_PLAN_INVALID", "Seleziona un ticket Solo valido.");
  }
  const normalizedTracking = normalizeTrackingContext(tracking);
  const consentBits = Number(normalizedTracking.consent.analytics)
    + (Number(normalizedTracking.consent.marketing) * 2);
  const orderSuffix = randomBytes(6).toString("hex").toUpperCase();
  const issuedAt = Math.floor(now.getTime() / 1_000).toString(36);
  const payload = [
    PAYMENT_LINK_REFERENCE_VERSION,
    config.code,
    orderSuffix,
    String(consentBits),
    issuedAt,
  ].join("_");
  return `${payload}_${paymentLinkReferenceSignature(payload)}`;
}

export function parsePaymentLinkReference(reference, now = new Date()) {
  const normalized = String(reference || "").trim();
  const match = PAYMENT_LINK_REFERENCE_PATTERN.exec(normalized);
  if (!match) {
    throw new FunnelError(
      400,
      "PAYMENT_LINK_REFERENCE_INVALID",
      "Riferimento del pagamento non valido.",
    );
  }
  const [, planCode, orderSuffix, consentBitsText, issuedAtText, suppliedSignature] = match;
  const payload = [
    PAYMENT_LINK_REFERENCE_VERSION,
    planCode,
    orderSuffix,
    consentBitsText,
    issuedAtText,
  ].join("_");
  const expectedSignature = paymentLinkReferenceSignature(payload);
  if (!safeEqualText(suppliedSignature, expectedSignature)) {
    throw new FunnelError(
      400,
      "PAYMENT_LINK_REFERENCE_INVALID",
      "Riferimento del pagamento non valido.",
    );
  }
  const issuedAt = Number.parseInt(issuedAtText, 36);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    !Number.isSafeInteger(issuedAt)
    || issuedAt > nowSeconds + 300
    || nowSeconds - issuedAt > PAYMENT_LINK_REFERENCE_TTL_SECONDS
  ) {
    throw new FunnelError(
      400,
      "PAYMENT_LINK_REFERENCE_EXPIRED",
      "Il riferimento del pagamento è scaduto.",
    );
  }
  const consentBits = Number(consentBitsText);
  return {
    orderId: `TIR-ORD-${orderSuffix}`,
    planId: PAYMENT_LINK_PLANS_BY_CODE[planCode],
    tracking: normalizeTrackingContext({
      consent: {
        analytics: Boolean(consentBits & 1),
        marketing: Boolean(consentBits & 2),
      },
      eventSourceUrl: "https://www.tiranaoffline.com/offerta?segment=solo",
    }),
  };
}

export function createStripePaymentLinkUrl({
  planId,
  tracking,
  campaign,
  now = new Date(),
}) {
  const config = STRIPE_PAYMENT_LINKS[planId];
  if (!config) {
    throw new FunnelError(400, "PAYMENT_LINK_PLAN_INVALID", "Seleziona un ticket Solo valido.");
  }
  const plan = getPlan(planId, { now });
  assertPlanAvailability(plan);
  if (plan.pricingStage !== config.pricingStage || amountInCents(plan) !== config.amount) {
    throw new FunnelError(
      409,
      "PAYMENT_LINK_PRICE_CHANGED",
      "Il prezzo del ticket è cambiato. Aggiorna la pagina e riprova.",
    );
  }
  const paymentUrl = new URL(config.url);
  paymentUrl.searchParams.set(
    "client_reference_id",
    createPaymentLinkReference(planId, tracking, now),
  );
  const suppliedCampaign = campaign && typeof campaign === "object" ? campaign : {};
  for (const field of PAYMENT_LINK_CAMPAIGN_FIELDS) {
    const value = String(suppliedCampaign[field] || "").trim();
    if (PAYMENT_LINK_CAMPAIGN_VALUE.test(value)) paymentUrl.searchParams.set(field, value);
  }
  return { plan, url: paymentUrl.toString() };
}

export function encryptStripeContext(context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", contextKey(), iv);
  cipher.setAAD(CONTEXT_AAD);
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(context), "utf8"));
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptStripeContext(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new FunnelError(400, "STRIPE_CONTEXT_INVALID", "Sessione Stripe non valida.");
  }
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const authTag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(parts[3], "base64url");
    if (
      iv.length !== 12 ||
      authTag.length !== 16 ||
      encrypted.length === 0 ||
      iv.toString("base64url") !== parts[1] ||
      authTag.toString("base64url") !== parts[2] ||
      encrypted.toString("base64url") !== parts[3]
    ) {
      throw new Error("invalid context lengths");
    }
    const decipher = createDecipheriv("aes-256-gcm", contextKey(), iv);
    decipher.setAAD(CONTEXT_AAD);
    decipher.setAuthTag(authTag);
    const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const decoded = inflateRawSync(compressed, { maxOutputLength: 8_192 });
    return JSON.parse(decoded.toString("utf8"));
  } catch (cause) {
    throw new FunnelError(400, "STRIPE_CONTEXT_INVALID", "Sessione Stripe non valida.", {
      cause,
    });
  }
}

export function stripeContextMetadata(context) {
  const token = encryptStripeContext(context);
  const chunks = token.match(new RegExp(`.{1,${CONTEXT_CHUNK_SIZE}}`, "g")) || [];
  if (chunks.length === 0 || chunks.length > MAX_CONTEXT_CHUNKS) {
    throw new FunnelError(
      400,
      "STRIPE_CONTEXT_TOO_LARGE",
      "I dati del checkout sono troppo lunghi. Controllali e riprova.",
    );
  }
  return Object.fromEntries([
    ["context_parts", String(chunks.length)],
    ...chunks.map((chunk, index) => [`context_${index + 1}`, chunk]),
  ]);
}

function contextFromMetadata(metadata) {
  const count = Number(metadata?.context_parts);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CONTEXT_CHUNKS) {
    throw new FunnelError(400, "STRIPE_CONTEXT_INVALID", "Sessione Stripe non valida.");
  }
  const token = Array.from(
    { length: count },
    (_, index) => String(metadata?.[`context_${index + 1}`] || ""),
  ).join("");
  return decryptStripeContext(token);
}

export function assertNoClientPricing(body) {
  if (
    body &&
    typeof body === "object" &&
    CLIENT_PRICING_FIELDS.some((field) => Object.hasOwn(body, field))
  ) {
    throw new FunnelError(
      400,
      "CLIENT_PRICING_NOT_ALLOWED",
      "Il prezzo del ticket viene calcolato dal server.",
    );
  }
}

export function amountInCents(plan) {
  const cents = Math.round(Number(plan?.price) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new FunnelError(400, "PAYMENT_NOT_REQUIRED", "Questo ticket non richiede un pagamento.");
  }
  return cents;
}

function appendMetadata(params, scope, metadata) {
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`${scope}[${key}]`, String(value));
  }
}

export function buildStripeCheckoutBody({
  plan,
  customer,
  orderId,
  registrationId,
  tracking,
  purchaseTerms,
}) {
  const couponCode = plan.coupon?.code || "";
  const context = {
    v: 1,
    orderId,
    registrationId,
    planId: plan.id,
    pricingStage: plan.pricingStage,
    couponCode,
    customer,
    tracking: normalizeTrackingContext(tracking),
    purchaseTerms,
  };
  const metadata = {
    schema: "tirana_checkout_v1",
    order_id: orderId,
    registration_id: registrationId,
    plan_id: plan.id,
    pricing_stage: String(plan.pricingStage),
    coupon_code: couponCode || "none",
    purchase_terms_accepted: purchaseTerms.accepted ? "true" : "false",
    purchase_terms_version: purchaseTerms.version,
    purchase_terms_source: purchaseTerms.source,
    purchase_terms_url: purchaseTerms.url,
    ...stripeContextMetadata(context),
  };
  const successUrl = `${PUBLIC_SITE_ORIGIN}/thank-you?payment=stripe&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = new URL("/checkout", PUBLIC_SITE_ORIGIN);
  cancelUrl.searchParams.set("plan", plan.id);
  cancelUrl.searchParams.set("stripe", "cancelled");
  if (couponCode) cancelUrl.searchParams.set("coupon", couponCode);

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("adaptive_pricing[enabled]", "false");
  params.set("payment_method_types[0]", "card");
  params.set("locale", "it");
  params.set("submit_type", "pay");
  params.set("customer_email", customer.email);
  params.set("billing_address_collection", "auto");
  params.set(
    "custom_text[submit][message]",
    `Pagando confermi la Policy di rimborso e le condizioni di acquisto: ${PURCHASE_TERMS_URL}`,
  );
  params.set("client_reference_id", orderId);
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl.toString());
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", plan.currency.toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(amountInCents(plan)));
  params.set("line_items[0][price_data][product_data][name]", plan.name);
  params.set(
    "line_items[0][price_data][product_data][description]",
    String(plan.description || "Scalers AI Bootcamp Offline Mode, Tirana").slice(0, 500),
  );
  params.set("payment_intent_data[receipt_email]", customer.email);
  params.set("payment_intent_data[description]", `${plan.name} | Tirana Offline Mode`);
  appendMetadata(params, "metadata", metadata);
  appendMetadata(params, "payment_intent_data[metadata]", {
    schema: metadata.schema,
    order_id: orderId,
    registration_id: registrationId,
    plan_id: plan.id,
    coupon_code: metadata.coupon_code,
    purchase_terms_accepted: metadata.purchase_terms_accepted,
    purchase_terms_version: metadata.purchase_terms_version,
    purchase_terms_source: metadata.purchase_terms_source,
    purchase_terms_url: metadata.purchase_terms_url,
  });
  return params;
}

async function stripeApiRequest(path, { method = "GET", body, idempotencyKey } = {}) {
  const secretKey = configuredSecretKey();
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${secretKey}`,
    "User-Agent": "tiranaoffline.com/1.0",
  };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response;
  let payload;
  try {
    response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method,
      headers,
      body: body ? body.toString() : undefined,
      signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
    });
    payload = await response.json();
  } catch (cause) {
    throw new FunnelError(
      502,
      "STRIPE_UNAVAILABLE",
      "Stripe non è momentaneamente raggiungibile. Riprova tra poco.",
      { cause },
    );
  }
  if (!response.ok || payload?.error) {
    const status = response.status >= 500 ? 502 : 400;
    throw new FunnelError(
      status,
      "STRIPE_REQUEST_FAILED",
      status === 502
        ? "Stripe non ha completato la richiesta. Riprova tra poco."
        : "Non è stato possibile preparare il pagamento. Controlla i dati e riprova.",
    );
  }
  return payload;
}

function assertSessionMode(session) {
  const expectedLiveMode = configuredSecretKey().startsWith("sk_live_");
  if (Boolean(session?.livemode) !== expectedLiveMode) {
    throw new FunnelError(409, "STRIPE_MODE_MISMATCH", "Sessione Stripe non valida.");
  }
}

export async function createStripeCheckoutSession(input, idempotencyKey) {
  const params = buildStripeCheckoutBody(input);
  const session = await stripeApiRequest("/v1/checkout/sessions", {
    method: "POST",
    body: params,
    idempotencyKey: `tirana-checkout-${idempotencyKey}`,
  });
  assertSessionMode(session);
  let checkoutUrl;
  try {
    checkoutUrl = new URL(session.url);
  } catch {
    checkoutUrl = null;
  }
  if (
    !VALID_SESSION_ID.test(String(session.id || "")) ||
    checkoutUrl?.protocol !== "https:" ||
    checkoutUrl?.hostname !== "checkout.stripe.com"
  ) {
    throw new FunnelError(502, "STRIPE_INVALID_RESPONSE", "Stripe ha restituito una risposta non valida.");
  }
  return { id: session.id, url: checkoutUrl.toString(), livemode: session.livemode };
}

export async function retrieveStripeCheckoutSession(sessionId) {
  const normalized = String(sessionId || "").trim();
  if (!VALID_SESSION_ID.test(normalized)) {
    throw new FunnelError(400, "STRIPE_SESSION_INVALID", "Sessione Stripe non valida.");
  }
  const session = await stripeApiRequest(
    `/v1/checkout/sessions/${encodeURIComponent(normalized)}`,
  );
  assertSessionMode(session);
  if (session.id !== normalized) {
    throw new FunnelError(502, "STRIPE_INVALID_RESPONSE", "Stripe ha restituito una risposta non valida.");
  }
  return session;
}

function expectedSessionEmail(session) {
  return String(session?.customer_details?.email || session?.customer_email || "")
    .trim()
    .toLowerCase();
}

export function resolvePaidStripeSession(session) {
  assertSessionMode(session);
  const context = contextFromMetadata(session?.metadata);
  if (
    context?.v !== 1 ||
    !VALID_ORDER_ID.test(context?.orderId || "") ||
    !VALID_REGISTRATION_ID.test(context?.registrationId || "") ||
    !PUBLIC_PLAN_IDS.includes(context?.planId) ||
    !Number.isInteger(context?.pricingStage)
  ) {
    throw new FunnelError(400, "STRIPE_CONTEXT_INVALID", "Sessione Stripe non valida.");
  }
  const customer = validateCustomer(context.customer);
  const plan = applyCouponToPlan(
    getPlan(context.planId, {
      allowLegacy: true,
      stage: context.pricingStage,
    }),
    context.couponCode,
    { allowInactive: true },
  );
  const sessionEmail = expectedSessionEmail(session);
  const valid =
    session?.metadata?.schema === "tirana_checkout_v1" &&
    session?.metadata?.order_id === context.orderId &&
    session?.metadata?.registration_id === context.registrationId &&
    session?.metadata?.plan_id === context.planId &&
    session?.client_reference_id === context.orderId &&
    session?.mode === "payment" &&
    session?.status === "complete" &&
    session?.payment_status === "paid" &&
    String(session?.currency || "").toUpperCase() === plan.currency &&
    Number(session?.amount_total) === amountInCents(plan) &&
    (!sessionEmail || sessionEmail === customer.email);
  if (!valid) {
    throw new FunnelError(
      409,
      "STRIPE_PAYMENT_NOT_CONFIRMED",
      "Il pagamento Stripe non risulta confermato.",
    );
  }
  return {
    customer,
    plan,
    tracking: normalizeTrackingContext(context.tracking),
    order: {
      orderId: context.orderId,
      registrationId: context.registrationId,
      planId: plan.id,
      pricingStage: plan.pricingStage,
      price: plan.price,
      couponCode: plan.coupon?.code || "",
      status: "PAID_STRIPE",
      paymentMethod: "STRIPE",
      reference: String(session.payment_intent || session.id),
      stripeSessionId: session.id,
      plan,
    },
  };
}

function publicTicketDisplayName(customer) {
  const initial = Array.from(String(customer.lastName || "").trim())[0] || "";
  return `${customer.firstName}${initial ? ` ${initial.toUpperCase()}.` : ""}`;
}

function publicTicketUrl(shareToken) {
  return `${PUBLIC_SITE_ORIGIN}/ticket?token=${encodeURIComponent(shareToken)}`;
}

function paidEmailText(order, customer, shareUrl) {
  return [
    "TIRANA OFFLINE MODE",
    "4 e 5 settembre 2026 · Piramide di Tirana, Albania",
    "",
    `Ciao ${customer.firstName},`,
    "",
    "il pagamento con Stripe è stato confermato.",
    `Ticket: ${order.plan.name}`,
    `Importo: ${order.plan.priceFormatted}`,
    `Codice biglietto: ${order.orderId}`,
    "Stato: PAGATO · BIGLIETTO CONFERMATO",
    "",
    `Apri il biglietto personalizzato: ${shareUrl}`,
    `Gruppo WhatsApp dell’evento: ${WHATSAPP_GROUP_URL}`,
    `Policy di rimborso e condizioni di acquisto: ${PURCHASE_TERMS_URL}`,
    "",
    `Assistenza: ${EVENT_CONTACT_EMAIL}`,
  ].join("\n");
}

function paidEmailHtml(order, customer, shareUrl) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#050507;color:#F8F6FF;font-family:Arial,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#100D17;border:1px solid #30243F;"><tr><td style="padding:32px;"><p style="margin:0 0 12px;color:#C4B5FD;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Pagamento confermato</p><h1 style="margin:0 0 20px;font-size:34px;line-height:1.05;">Il tuo biglietto per Tirana è confermato.</h1><p style="margin:0 0 22px;color:#C7C1CF;line-height:1.65;">Ciao ${escapeHtml(customer.firstName)}, Stripe ha confermato il pagamento di <strong style="color:#FFFFFF;">${escapeHtml(order.plan.priceFormatted)}</strong> per ${escapeHtml(order.plan.name)}.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#171126;border:1px solid #493766;"><tr><td style="padding:18px;color:#F8F6FF;line-height:1.7;"><strong>Codice biglietto:</strong> ${escapeHtml(order.orderId)}<br><strong>Stato:</strong> PAGATO · BIGLIETTO CONFERMATO<br><strong>Evento:</strong> 4 e 5 settembre 2026, Piramide di Tirana</td></tr></table><a href="${escapeHtml(shareUrl)}" style="display:inline-block;padding:15px 20px;background:#C4B5FD;color:#050507;font-weight:800;text-decoration:none;">APRI IL BIGLIETTO ↗</a><p style="margin:24px 0 0;color:#AAA4B7;line-height:1.6;">Entra nel <a href="${escapeHtml(WHATSAPP_GROUP_URL)}" style="color:#C4B5FD;">gruppo WhatsApp dell’evento</a> per gli aggiornamenti operativi.</p><p style="margin:20px 0 0;color:#AAA4B7;line-height:1.6;">Consulta la <a href="${PURCHASE_TERMS_URL}" style="color:#C4B5FD;">Policy di rimborso e le condizioni di acquisto</a>.</p><p style="margin:20px 0 0;color:#81798C;font-size:13px;">Assistenza: <a href="mailto:${EVENT_CONTACT_EMAIL}" style="color:#C4B5FD;">${EVENT_CONTACT_EMAIL}</a></p></td></tr></table></td></tr></table></body></html>`;
}

function internalEmailText(order, customer, shareUrl) {
  return [
    "Nuovo pagamento Stripe confermato.",
    "",
    `Record: ${order.orderId}`,
    `Sessione Stripe: ${order.stripeSessionId}`,
    `Piano: ${order.plan.name}`,
    `Importo: ${order.plan.priceFormatted}`,
    `Coupon: ${order.plan.coupon?.code || "Nessuno"}`,
    `Nome: ${customer.firstName} ${customer.lastName}`,
    `Email: ${customer.email}`,
    `Telefono: ${customer.phone}`,
    `Referral: ${customer.referral || "Non indicato"}`,
    `Ragione sociale: ${customer.companyName}`,
    `Indirizzo: ${customer.address}, ${customer.postalCode} ${customer.city} (${customer.countryCode})`,
    `Partita IVA o codice fiscale: ${customer.taxId}`,
    `Ticket URL: ${shareUrl}`,
  ].join("\n");
}

function notificationStatus(result, channel, orderId) {
  if (result.status === "fulfilled") return "sent";
  console.warn("[tirana] notifica Stripe rinviata", {
    recordId: orderId,
    channel,
    code: String(result.reason?.code || "NOTIFICATION_UNAVAILABLE"),
    status: Number(result.reason?.status) || 502,
  });
  return "deferred";
}

export async function fulfillPaidStripeSession(session) {
  const { order, customer, plan, tracking } = resolvePaidStripeSession(session);
  const shareToken = createTicketShareToken({
    displayName: publicTicketDisplayName(customer),
    planId: plan.id,
  });
  const shareUrl = publicTicketUrl(shareToken);
  await syncPaidTicketToGoogleSheets(order, customer, shareUrl);

  const internalText = internalEmailText(order, customer, shareUrl);
  const jobs = [
    sendResendEmail({
      subject: `[TIRANA][STRIPE][PAGATO] ${order.orderId} · ${plan.name}`,
      text: internalText,
      html: `<p><strong>Nuovo pagamento Stripe confermato.</strong></p><pre style="white-space:pre-wrap;">${escapeHtml(internalText)}</pre>`,
      tags: [
        { name: "event", value: "tirana-offline" },
        { name: "record_type", value: "stripe-payment" },
        { name: "payment_status", value: "paid" },
      ],
      headers: {
        "X-Tirana-Record-Type": "stripe-payment",
        "X-Tirana-Record-Id": order.orderId,
        "X-Tirana-Payment-Status": "paid",
      },
      idempotencyKey: `tirana-stripe-internal-${order.orderId}`,
    }),
    sendResendEmail({
      to: [customer.email],
      subject: "Tirana Offline Mode | Pagamento e biglietto confermati",
      text: paidEmailText(order, customer, shareUrl),
      html: paidEmailHtml(order, customer, shareUrl),
      tags: [
        { name: "event", value: "tirana-offline" },
        { name: "record_type", value: "stripe-ticket" },
      ],
      headers: {
        "X-Tirana-Record-Type": "stripe-ticket",
        "X-Tirana-Record-Id": order.orderId,
        "X-Tirana-Payment-Status": "paid",
      },
      idempotencyKey: `tirana-stripe-customer-${order.orderId}`,
    }),
    sendMetaPurchase({ order, customer, tracking }),
  ];
  const metaIndex = 2;
  let slackIndex = -1;
  if (hasSlackNotificationConfig()) {
    slackIndex = jobs.length;
    jobs.push(sendSlackNotification(buildPaidTicketSlackMessage(order, customer, shareUrl)));
  }
  const results = await Promise.allSettled(jobs);
  const notifications = {
    internal: notificationStatus(results[0], "internal-email", order.orderId),
    customer: notificationStatus(results[1], "customer-email", order.orderId),
  };
  let metaTracking = "deferred";
  if (results[metaIndex]?.status === "fulfilled") {
    metaTracking = results[metaIndex].value.status;
  } else {
    console.warn("[tirana] tracking Meta rinviato", {
      recordId: order.orderId,
      code: String(results[metaIndex]?.reason?.code || "META_CAPI_UNAVAILABLE"),
      status: Number(results[metaIndex]?.reason?.status) || 502,
    });
  }
  if (slackIndex >= 0) notificationStatus(results[slackIndex], "slack", order.orderId);
  return {
    order,
    customer,
    plan,
    shareToken,
    shareUrl,
    notifications,
    tracking: { meta: metaTracking },
  };
}

export function publicPaidStripeSession(session) {
  const { order, customer, plan } = resolvePaidStripeSession(session);
  const shareToken = createTicketShareToken({
    displayName: publicTicketDisplayName(customer),
    planId: plan.id,
  });
  return {
    ok: true,
    orderId: order.orderId,
    status: order.status,
    plan,
    trackingEventId: metaPurchaseEventId(order.orderId),
    shareToken,
    shareUrl: publicTicketUrl(shareToken),
  };
}

export async function readStripeWebhookBody(req) {
  if (Buffer.isBuffer(req?.body)) {
    if (req.body.length > MAX_WEBHOOK_BYTES) {
      throw new FunnelError(413, "PAYLOAD_TOO_LARGE", "Webhook Stripe troppo grande.");
    }
    return req.body;
  }
  if (typeof req?.body === "string") {
    const raw = Buffer.from(req.body, "utf8");
    if (raw.length > MAX_WEBHOOK_BYTES) {
      throw new FunnelError(413, "PAYLOAD_TOO_LARGE", "Webhook Stripe troppo grande.");
    }
    return raw;
  }
  if (!req || typeof req[Symbol.asyncIterator] !== "function") {
    throw new FunnelError(400, "STRIPE_WEBHOOK_INVALID", "Webhook Stripe non valido.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_WEBHOOK_BYTES) {
      throw new FunnelError(413, "PAYLOAD_TOO_LARGE", "Webhook Stripe troppo grande.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function verifyStripeWebhookSignature(rawBody, signatureHeader, now = Date.now()) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!VALID_WEBHOOK_SECRET.test(secret)) {
    throw new FunnelError(503, "STRIPE_WEBHOOK_NOT_CONFIGURED", "Webhook Stripe non configurato.");
  }
  const values = String(signatureHeader || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      return separator === -1 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
    });
  const timestamp = Number(values.find(([key]) => key === "t")?.[1]);
  const signatures = values.filter(([key]) => key === "v1").map(([, value]) => value);
  const nowSeconds = Math.floor(Number(now) / 1_000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS ||
    signatures.length === 0
  ) {
    throw new FunnelError(400, "STRIPE_SIGNATURE_INVALID", "Firma webhook Stripe non valida.");
  }
  const expected = createHmac("sha256", secret)
    .update(String(timestamp), "utf8")
    .update(".", "utf8")
    .update(rawBody)
    .digest();
  const valid = signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
  if (!valid) {
    throw new FunnelError(400, "STRIPE_SIGNATURE_INVALID", "Firma webhook Stripe non valida.");
  }
  return true;
}
