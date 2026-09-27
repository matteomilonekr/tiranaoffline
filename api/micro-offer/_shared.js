import { timingSafeEqual } from "node:crypto";

import { FunnelError, normalizeText } from "../_funnel.js";
import {
  buildMicroOfferSlackMessage,
  hasSlackNotificationConfig,
  sendSlackNotification,
} from "../_slack.js";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_TIMEOUT_MS = 12_000;
const VALID_SECRET_KEY = /^sk_(?:live|test)_[A-Za-z0-9_]{16,}$/;
const VALID_PUBLISHABLE_KEY = /^pk_(?:live|test)_[A-Za-z0-9_]{16,}$/;
const VALID_CONFIRMATION_TOKEN = /^ctoken_[A-Za-z0-9_]{8,}$/;
const VALID_PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9]{8,}$/;
const VALID_CLIENT_SECRET = /^(pi_[A-Za-z0-9]{8,})_secret_[A-Za-z0-9]{8,}$/;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLIENT_PRICING_FIELDS = Object.freeze([
  "amount",
  "amountCents",
  "price",
  "total",
  "currency",
]);
const OPEN_PAYMENT_STATUSES = new Set(["succeeded", "processing", "requires_action"]);

export const MICRO_OFFER_FUNNEL = "micro-offer-os";
export const MICRO_OFFER_CURRENCY = "eur";
export const MICRO_OFFER_RETURN_PATH = "/micro-offer/grazie";

// Prezzi in centesimi: il browser riceve questo catalogo in sola lettura e non
// può mai inviare importi. Il totale viene ricalcolato qui a ogni pagamento.
export const MICRO_OFFER_PRODUCT = Object.freeze({
  id: "micro-offer-os",
  name: "Micro Offer OS",
  amountCents: 1495,
});

export const MICRO_OFFER_BUMPS = Object.freeze([
  Object.freeze({
    id: "launch-kit",
    name: "Kit di Lancio Rapido (accesso a vita)",
    headline: "SÌ, aggiungi il Kit di Lancio Rapido (accesso a vita)",
    amountCents: 2700,
    description:
      "Salta la pagina bianca. I template con cui lanciamo, nell’ordine in cui li usi: la promessa, la pagina di vendita, il checkout, le email e gli annunci. Copi, compili le parentesi, lanci.",
    excludes: Object.freeze([]),
  }),
  Object.freeze({
    id: "aaw-replay",
    name: "AI Acceleration Week Replay Pass",
    headline: "SÌ, aggiungi il Replay Pass della AI Acceleration Week",
    amountCents: 2700,
    description:
      "Le 7 sessioni registrate della AI Acceleration Week, con Start Here da 60 minuti, Mappa dei colli di bottiglia e Loop Operativo Canvas. Il tuo primo workflow AI operativo, dopo la tua prima vendita.",
    excludes: Object.freeze([]),
  }),
  Object.freeze({
    id: "launch-kit-replay",
    name: "Kit di Lancio Rapido + Replay Pass",
    headline: "SÌ, prendi il Kit e il Replay Pass insieme per €44 (risparmi €10)",
    amountCents: 4400,
    description:
      "Tutti e due gli upgrade a un prezzo solo: il Kit di Lancio Rapido e il Replay Pass della AI Acceleration Week. Presi separatamente costano €54.",
    excludes: Object.freeze(["launch-kit", "aaw-replay"]),
  }),
]);

const BUMPS_BY_ID = new Map(MICRO_OFFER_BUMPS.map((bump) => [bump.id, bump]));

export function formatEuro(amountCents) {
  return `€${(amountCents / 100).toFixed(2).replace(".", ",")}`;
}

function stripeKeys() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const publishableKey = String(process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
  if (!VALID_SECRET_KEY.test(secretKey) || !VALID_PUBLISHABLE_KEY.test(publishableKey)) {
    return null;
  }
  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";
  if (!publishableKey.startsWith(`pk_${mode}_`)) return null;
  return { secretKey, publishableKey, mode };
}

function requireStripeKeys() {
  const keys = stripeKeys();
  if (!keys) {
    throw new FunnelError(
      503,
      "STRIPE_NOT_CONFIGURED",
      "Il pagamento con carta non è momentaneamente disponibile.",
    );
  }
  return keys;
}

export function getMicroOfferPublicConfig() {
  const keys = stripeKeys();
  return {
    configured: Boolean(keys),
    mode: keys?.mode || null,
    publishableKey: keys?.publishableKey || null,
    currency: MICRO_OFFER_CURRENCY,
    product: { ...MICRO_OFFER_PRODUCT },
    bumps: MICRO_OFFER_BUMPS.map((bump) => ({ ...bump, excludes: [...bump.excludes] })),
  };
}

function conflicts(first, second) {
  return first.excludes.includes(second.id) || second.excludes.includes(first.id);
}

export function resolveBumps(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MICRO_OFFER_BUMPS.length) {
    throw new FunnelError(400, "INVALID_BUMPS", "Le aggiunte selezionate non sono valide.");
  }
  const ids = new Set();
  for (const id of value) {
    if (typeof id !== "string" || !BUMPS_BY_ID.has(id) || ids.has(id)) {
      throw new FunnelError(400, "INVALID_BUMPS", "Le aggiunte selezionate non sono valide.");
    }
    ids.add(id);
  }
  const selected = MICRO_OFFER_BUMPS.filter((bump) => ids.has(bump.id));
  for (const bump of selected) {
    if (selected.some((other) => other !== bump && conflicts(bump, other))) {
      throw new FunnelError(400, "BUMP_CONFLICT", "Hai selezionato due aggiunte incompatibili.");
    }
  }
  return selected;
}

export function orderAmountCents(bumps) {
  return bumps.reduce((total, bump) => total + bump.amountCents, MICRO_OFFER_PRODUCT.amountCents);
}

function orderDescription(bumps) {
  return [MICRO_OFFER_PRODUCT.name, ...bumps.map((bump) => bump.name)].join(" + ");
}

function assertNoClientPricing(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FunnelError(400, "INVALID_DATA", "Controlla i dati inseriti.");
  }
  if (CLIENT_PRICING_FIELDS.some((field) => Object.hasOwn(body, field))) {
    throw new FunnelError(400, "CLIENT_PRICING_REJECTED", "Il prezzo viene calcolato dal server.");
  }
}

function validateBuyer(body) {
  const name = normalizeText(body?.fullName, 120);
  const email = normalizeText(body?.email, 254).toLowerCase();
  if (!VALID_EMAIL.test(email)) {
    throw new FunnelError(400, "INVALID_EMAIL", "Inserisci un indirizzo email valido.");
  }
  return { name, email };
}

function declineMessage(error) {
  switch (error?.decline_code || error?.code) {
    case "insufficient_funds":
      return "Fondi insufficienti sulla carta. Prova con un’altra carta.";
    case "expired_card":
      return "La carta è scaduta. Prova con un’altra carta.";
    case "incorrect_cvc":
    case "invalid_cvc":
      return "Il codice di sicurezza della carta non è corretto.";
    case "incorrect_number":
    case "invalid_number":
      return "Il numero della carta non è corretto.";
    case "authentication_required":
      return "La banca richiede una verifica aggiuntiva. Riprova e completa l’autenticazione.";
    default:
      return "La banca ha rifiutato il pagamento. Prova con un’altra carta o un altro metodo.";
  }
}

function stripeFailure(status, error) {
  if (error?.type === "card_error") {
    return new FunnelError(402, "PAYMENT_DECLINED", declineMessage(error));
  }
  if (status >= 500) {
    return new FunnelError(502, "STRIPE_UNAVAILABLE", "Stripe non ha completato la richiesta. Riprova tra poco.");
  }
  if (error?.code === "resource_missing") {
    return new FunnelError(
      400,
      "PAYMENT_SESSION_EXPIRED",
      "La sessione di pagamento è scaduta. Ricarica la pagina e riprova.",
    );
  }
  return new FunnelError(
    400,
    "STRIPE_REQUEST_FAILED",
    "Non è stato possibile completare il pagamento. Controlla i dati e riprova.",
  );
}

async function stripeApiRequest(path, { method = "GET", body, idempotencyKey } = {}) {
  const { secretKey } = requireStripeKeys();
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${secretKey}`,
    "User-Agent": "tiranaoffline.com/micro-offer",
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
  if (!response.ok || payload?.error) throw stripeFailure(response.status, payload?.error);
  return payload;
}

export function isMicroOfferPaymentIntent(intent) {
  return intent?.object === "payment_intent" && intent?.metadata?.funnel === MICRO_OFFER_FUNNEL;
}

function assertOwnPaymentIntent(intent, expectedAmount) {
  const { mode } = requireStripeKeys();
  if (
    !VALID_PAYMENT_INTENT_ID.test(String(intent?.id || "")) ||
    !isMicroOfferPaymentIntent(intent) ||
    intent.currency !== MICRO_OFFER_CURRENCY ||
    Boolean(intent.livemode) !== (mode === "live") ||
    (expectedAmount !== undefined && intent.amount !== expectedAmount)
  ) {
    throw new FunnelError(502, "STRIPE_INVALID_RESPONSE", "Stripe ha restituito una risposta non valida.");
  }
}

function bumpsFromMetadata(value) {
  return String(value || "")
    .split(",")
    .map((id) => BUMPS_BY_ID.get(id.trim()))
    .filter(Boolean);
}

function purchaseFromPaymentIntent(intent) {
  return {
    paymentIntentId: intent.id,
    product: MICRO_OFFER_PRODUCT.name,
    bumps: bumpsFromMetadata(intent.metadata?.bumps).map((bump) => bump.name).join(", "),
    name: intent.metadata?.customer_name,
    email: intent.metadata?.customer_email || intent.receipt_email,
    amount: formatEuro(intent.amount),
  };
}

// Avvisa il team una sola volta per pagamento: il segno resta nei metadata del
// PaymentIntent, così checkout, pagina di conferma e webhook non si ripetono.
async function notifyPurchaseOnce(intent) {
  if (
    intent?.status !== "succeeded" ||
    intent.metadata?.notified_at ||
    !hasSlackNotificationConfig()
  ) {
    return false;
  }
  await sendSlackNotification(buildMicroOfferSlackMessage(purchaseFromPaymentIntent(intent)));
  const params = new URLSearchParams();
  params.set("metadata[notified_at]", new Date().toISOString());
  await stripeApiRequest(`/v1/payment_intents/${intent.id}`, { method: "POST", body: params });
  return true;
}

async function notifyWithoutBlocking(intent) {
  try {
    await notifyPurchaseOnce(intent);
  } catch {
    // La notifica al team non deve mai bloccare la conferma al cliente.
  }
}

export async function createMicroOfferPayment(body, { origin, idempotencyKey }) {
  assertNoClientPricing(body);
  const buyer = validateBuyer(body);
  const bumps = resolveBumps(body.bumps);
  const confirmationToken = String(body.confirmationTokenId || "").trim();
  if (!VALID_CONFIRMATION_TOKEN.test(confirmationToken)) {
    throw new FunnelError(
      400,
      "INVALID_PAYMENT_METHOD",
      "Metodo di pagamento non valido. Ricarica la pagina e riprova.",
    );
  }
  requireStripeKeys();

  const amount = orderAmountCents(bumps);
  const params = new URLSearchParams();
  params.set("amount", String(amount));
  params.set("currency", MICRO_OFFER_CURRENCY);
  params.set("confirm", "true");
  params.set("confirmation_token", confirmationToken);
  params.set("automatic_payment_methods[enabled]", "true");
  params.set("return_url", new URL(MICRO_OFFER_RETURN_PATH, origin).toString());
  params.set("receipt_email", buyer.email);
  params.set("description", orderDescription(bumps));
  params.set("metadata[funnel]", MICRO_OFFER_FUNNEL);
  params.set("metadata[product]", MICRO_OFFER_PRODUCT.id);
  params.set("metadata[bumps]", bumps.map((bump) => bump.id).join(","));
  params.set("metadata[customer_name]", buyer.name);
  params.set("metadata[customer_email]", buyer.email);

  const intent = await stripeApiRequest("/v1/payment_intents", {
    method: "POST",
    body: params,
    idempotencyKey: `micro-offer-pay-${idempotencyKey}`,
  });
  assertOwnPaymentIntent(intent, amount);
  if (!OPEN_PAYMENT_STATUSES.has(intent.status)) {
    throw new FunnelError(
      402,
      "PAYMENT_NOT_COMPLETED",
      "Il pagamento non è andato a buon fine. Prova con un’altra carta o un altro metodo.",
    );
  }
  await notifyWithoutBlocking(intent);
  return {
    status: intent.status,
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
  };
}

function safeEqualText(first, second) {
  const a = Buffer.from(String(first || ""));
  const b = Buffer.from(String(second || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function configuredAccessUrl() {
  const value = String(process.env.MICRO_OFFER_ACCESS_URL || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstName(value) {
  return String(value || "").trim().split(/\s+/)[0] || null;
}

export async function finalizeMicroOfferPayment(body) {
  const clientSecret = String(body?.clientSecret || "").trim();
  const match = VALID_CLIENT_SECRET.exec(clientSecret);
  const paymentIntentId = String(body?.paymentIntentId || "").trim();
  if (!match || match[1] !== paymentIntentId) {
    throw new FunnelError(404, "PAYMENT_NOT_FOUND", "Non troviamo questo pagamento.");
  }
  const intent = await stripeApiRequest(`/v1/payment_intents/${paymentIntentId}`);
  assertOwnPaymentIntent(intent);
  if (!safeEqualText(intent.client_secret, clientSecret)) {
    throw new FunnelError(404, "PAYMENT_NOT_FOUND", "Non troviamo questo pagamento.");
  }
  await notifyWithoutBlocking(intent);
  const paid = intent.status === "succeeded";
  return {
    status: intent.status,
    paid,
    amountCents: intent.amount,
    items: [MICRO_OFFER_PRODUCT.name, ...bumpsFromMetadata(intent.metadata?.bumps).map((bump) => bump.name)],
    firstName: firstName(intent.metadata?.customer_name),
    accessUrl: paid ? configuredAccessUrl() : null,
  };
}

// Chiamata dal webhook Stripe su payment_intent.succeeded: rilegge il pagamento
// per vedere lo stato aggiornato e avvisa il team se non l'ha già fatto nessuno.
export async function notifyMicroOfferPaymentFromWebhook(eventIntent) {
  const paymentIntentId = String(eventIntent?.id || "");
  if (
    !isMicroOfferPaymentIntent(eventIntent) ||
    !VALID_PAYMENT_INTENT_ID.test(paymentIntentId) ||
    !hasSlackNotificationConfig()
  ) {
    return false;
  }
  const intent = await stripeApiRequest(`/v1/payment_intents/${paymentIntentId}`);
  assertOwnPaymentIntent(intent);
  return notifyPurchaseOnce(intent);
}
