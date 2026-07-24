import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const CURRENCY = "EUR";
export const EVENT_CAPACITY = 150;
export const BUILDER_CAPACITY = 60;

const ORDER_PREFIX = "AAW26";
const MAX_BODY_BYTES = 8_192;
const PAYPAL_TIMEOUT_MS = 12_000;
const VALID_ORDER_ID = /^[A-Z0-9]{10,32}$/;
const VALID_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const VALID_CHECKOUT_TOKEN = /^v1\.[A-Za-z0-9_-]{43}$/;

const PRICING_WINDOWS = [
  { endsAt: "2026-07-31T23:59:59+02:00", label: "31 luglio alle 23:59" },
  { endsAt: "2026-08-02T23:59:59+02:00", label: "2 agosto alle 23:59" },
  { endsAt: "2026-08-12T23:59:59+02:00", label: "12 agosto alle 23:59" },
  { endsAt: "2026-08-22T23:59:59+02:00", label: "22 agosto alle 23:59" },
  { endsAt: "2026-09-01T23:59:59+02:00", label: "1 settembre alle 23:59" },
];

const PRICING_PHASES = ["Founder", "Early", "Early Plus", "Regular", "Late", "Final"];
const SLOT_THRESHOLDS = Object.freeze({
  total: [25, 50, 75, 100, 125],
  builder: [10, 20, 30, 40, 50],
});

const PLAN_CATALOG = Object.freeze({
  "solo-mid": {
    name: "Workshop Pass",
    segment: "solo",
    tier: "mid",
    description: "Una persona alle due mattine, 1 mese nella Skool di Scalers+ con il corso completo Claude Code 2.0 e accesso ai 7 Live Workshop, per definire priorità, mappa e roadmap operativa.",
    participantCount: 1,
    builderSlots: 0,
    pricingPool: "total",
    prices: [97, 137, 177, 217, 257, 297],
  },
  "solo-full": {
    name: "Builder Pass + Solo OS",
    segment: "solo",
    tier: "full",
    description: "Una persona alle mattine e al Live Building, 3 mesi nella Skool di Scalers+ con Vault Standard e stack operativo, call di onboarding e supporto al tavolo per costruire l’AI Solo OS usando dal vivo Claude Code IDE + CLI, Codex Desktop + CLI e Hermes Agent nelle sessioni pomeridiane.",
    participantCount: 1,
    builderSlots: 1,
    pricingPool: "builder",
    prices: [397, 497, 597, 697, 797, 897],
  },
  "agency-mid": {
    name: "Workshop Pass + Agency OS",
    segment: "agency",
    tier: "mid",
    description: "Tre persone alle due mattine, con 1 delle 3 anche al Live Building tramite Builder Pass, 3 account Scalers+ per 3 mesi e una call di onboarding. Nelle sessioni pomeridiane la persona Builder usa dal vivo Claude Code IDE + CLI, Codex Desktop + CLI e Hermes Agent per iniziare a costruire l’AI Agency OS.",
    participantCount: 3,
    builderSlots: 1,
    pricingPool: "builder",
    prices: [597, 697, 797, 897, 997, 1097],
  },
  "agency-full": {
    name: "Builder Pass + Agency OS",
    segment: "agency",
    tier: "full",
    description: "Tre persone alle mattine e tutte e tre al Live Building, con 3 account Scalers+ per 6 mesi e call di onboarding, per costruire l’AI Agency OS usando dal vivo Claude Code IDE + CLI, Codex Desktop + CLI e Hermes Agent nelle sessioni pomeridiane.",
    participantCount: 3,
    builderSlots: 3,
    pricingPool: "builder",
    prices: [997, 1197, 1397, 1597, 1797, 1997],
  },
  "company-mid": {
    name: "Workshop Pass + Company OS",
    segment: "company",
    tier: "mid",
    description: "Tre persone alle mattine e tutte e tre al Live Building, con 3 account Scalers+ per 6 mesi e una call di onboarding, per impostare e iniziare a costruire l’AI Company OS usando dal vivo Claude Code IDE + CLI, Codex Desktop + CLI e Hermes Agent nelle sessioni pomeridiane.",
    participantCount: 3,
    builderSlots: 3,
    pricingPool: "builder",
    prices: [997, 1097, 1197, 1297, 1397, 1497],
  },
  "company-full": {
    name: "Builder Pass + Company OS",
    segment: "company",
    tier: "full",
    description: "Tre persone alle mattine e tutte e tre al Live Building, con 3 account Scalers+ per 12 mesi e call di onboarding, per costruire un progetto pilota dell’AI Company OS usando dal vivo Claude Code IDE + CLI, Codex Desktop + CLI e Hermes Agent nelle sessioni pomeridiane.",
    participantCount: 3,
    builderSlots: 3,
    pricingPool: "builder",
    prices: [1997, 2297, 2597, 2897, 3197, 3497],
  },
});

const LEGACY_PRICING_WINDOWS = [
  { endsAt: "2026-07-31T23:59:59+02:00", label: "31 luglio alle 23:59" },
  { endsAt: "2026-08-07T23:59:59+02:00", label: "7 agosto alle 23:59" },
  { endsAt: "2026-08-22T23:59:59+02:00", label: "22 agosto alle 23:59" },
];

const LEGACY_PLAN_CATALOG = Object.freeze({
  "workshop-pass": {
    name: "Workshop Pass",
    segment: "workshop",
    tier: "workshop",
    description: "Una persona alle due mattine per vedere lo stack e definire la mappa iniziale del proprio AI OS.",
    participantCount: 1,
    builderSlots: 0,
    pricingPool: "total",
    prices: [97, 147, 197, 297],
  },
  "builder-solo-os": {
    name: "Builder Pass + Solo OS",
    segment: "solo",
    tier: "builder",
    description: "Una persona per tutto l’evento per costruire il proprio AI Solo OS.",
    participantCount: 1,
    builderSlots: 1,
    pricingPool: "builder",
    prices: [497, 597, 697, 897],
  },
  "builder-agency-os": {
    name: "Builder Pass + Agency OS",
    segment: "agency",
    tier: "builder",
    description: "Due persone alle mattine e una al Live Building per costruire l’AI Agency OS.",
    participantCount: 2,
    builderSlots: 1,
    pricingPool: "builder",
    prices: [997, 1197, 1397, 1797],
  },
  "builder-company-os": {
    name: "Builder Pass + Company OS",
    segment: "company",
    tier: "builder",
    description: "Due persone alle mattine e una al Live Building per costruire un progetto pilota dell’AI Company OS.",
    participantCount: 2,
    builderSlots: 1,
    pricingPool: "builder",
    prices: [1997, 2297, 2597, 2997],
  },
});

let accessTokenCache = null;

export class ApiError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.providerDebugId = options.providerDebugId || null;
    this.cause = options.cause;
  }
}

function normalizeEnvironment(value = "sandbox") {
  const environment = String(value || "sandbox").trim().toLowerCase();
  if (environment === "sandbox" || environment === "test") return "sandbox";
  if (environment === "production" || environment === "live") return "production";
  throw new ApiError(500, "PAYPAL_ENV_INVALID", "Configurazione PayPal non valida.");
}

export function getPayPalConfig({ requireCredentials = false } = {}) {
  const environment = normalizeEnvironment(process.env.PAYPAL_ENV);
  const clientId = String(process.env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
  const configured = Boolean(clientId && clientSecret);

  if (requireCredentials && !configured) {
    throw new ApiError(503, "PAYPAL_NOT_CONFIGURED", "PayPal non è ancora configurato.");
  }

  return {
    environment,
    clientId,
    clientSecret,
    configured,
    apiBase:
      environment === "production"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com",
    sdkUrl:
      environment === "production"
        ? "https://www.paypal.com/web-sdk/v6/core"
        : "https://www.sandbox.paypal.com/web-sdk/v6/core",
  };
}

function optionalInventoryValue(name, maximum) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) {
    throw new ApiError(500, "INVENTORY_CONFIG_INVALID", `La variabile ${name} non è valida.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new ApiError(500, "INVENTORY_CONFIG_INVALID", `La variabile ${name} non è valida.`);
  }
  return value;
}

export function getInventorySnapshot() {
  const totalAssigned = optionalInventoryValue("AAW26_TOTAL_ASSIGNED", EVENT_CAPACITY);
  const builderAssigned = optionalInventoryValue("AAW26_BUILDER_ASSIGNED", BUILDER_CAPACITY);
  const configured = Number.isInteger(totalAssigned) && Number.isInteger(builderAssigned);

  if ((totalAssigned === null) !== (builderAssigned === null)) {
    throw new ApiError(
      500,
      "INVENTORY_CONFIG_INCOMPLETE",
      "Configura entrambi i contatori inventario oppure lasciali entrambi vuoti.",
    );
  }

  return {
    configured,
    mode: configured ? "manual" : "capacity-only",
    total: {
      capacity: EVENT_CAPACITY,
      assigned: configured ? totalAssigned : null,
      remaining: configured ? EVENT_CAPACITY - totalAssigned : null,
    },
    builder: {
      capacity: BUILDER_CAPACITY,
      assigned: configured ? builderAssigned : null,
      remaining: configured ? BUILDER_CAPACITY - builderAssigned : null,
    },
  };
}

export function getSlotPricingStage(pool, inventory = getInventorySnapshot()) {
  if (!inventory?.configured || !Object.hasOwn(SLOT_THRESHOLDS, pool)) return 0;
  const assigned = inventory[pool]?.assigned;
  const stage = SLOT_THRESHOLDS[pool].findIndex((limit) => assigned < limit);
  return stage === -1 ? SLOT_THRESHOLDS[pool].length : stage;
}

export function getPricingStage(now = new Date()) {
  const timeStage = PRICING_WINDOWS.findIndex(
    ({ endsAt }) => now.getTime() <= Date.parse(endsAt),
  );
  return timeStage === -1 ? PRICING_WINDOWS.length : timeStage;
}

function moneyValue(amount) {
  return Number(amount).toFixed(2);
}

function priceFormatted(amount) {
  return `€ ${Number(amount).toLocaleString("it-IT", { useGrouping: true })}`;
}

function publicPlanAtStage(id, definition, stage, options = {}) {
  const price = definition.prices[stage];
  const windows = options.legacy ? LEGACY_PRICING_WINDOWS : PRICING_WINDOWS;
  const nextWindow = windows[stage] || null;
  const nextPrice = definition.prices[stage + 1] ?? null;
  const compareAtPrice = definition.prices.at(-1);
  const nextSlotThreshold = null;

  return {
    id,
    name: definition.name,
    segment: definition.segment,
    tier: definition.tier,
    description: definition.description,
    participantCount: definition.participantCount,
    builderSlots: definition.builderSlots,
    pricingPool: definition.pricingPool,
    currency: CURRENCY,
    price: moneyValue(price),
    priceFormatted: priceFormatted(price),
    compareAtPrice: moneyValue(compareAtPrice),
    compareAtPriceFormatted: priceFormatted(compareAtPrice),
    pricingStage: stage,
    pricingPhase: options.legacy ? `Legacy ${stage + 1}` : PRICING_PHASES[stage],
    nextPrice: nextPrice === null ? null : moneyValue(nextPrice),
    nextPriceFormatted: nextPrice === null ? null : priceFormatted(nextPrice),
    nextSlotThreshold,
    priceValidUntil: nextWindow?.endsAt || null,
    priceValidUntilLabel: nextWindow?.label || null,
    legacy: Boolean(options.legacy),
  };
}

export function getPlan(planId, options = {}) {
  const isActive = typeof planId === "string" && Object.hasOwn(PLAN_CATALOG, planId);
  const isLegacy = Boolean(
    options.allowLegacy &&
      typeof planId === "string" &&
      Object.hasOwn(LEGACY_PLAN_CATALOG, planId),
  );
  if (!isActive && !isLegacy) {
    throw new ApiError(400, "INVALID_PLAN", "Seleziona un piano valido.");
  }

  const definition = isActive ? PLAN_CATALOG[planId] : LEGACY_PLAN_CATALOG[planId];
  const stage = Number.isInteger(options.stage)
    ? options.stage
    : isLegacy
      ? (() => {
          const index = LEGACY_PRICING_WINDOWS.findIndex(
            ({ endsAt }) => (options.now || new Date()).getTime() <= Date.parse(endsAt),
          );
          return index === -1 ? LEGACY_PRICING_WINDOWS.length : index;
        })()
      : getPricingStage(options.now, {
          pool: definition.pricingPool,
          inventory: options.inventory,
        });
  if (stage < 0 || stage >= definition.prices.length) {
    throw new ApiError(400, "INVALID_PRICING_STAGE", "Finestra di prezzo non valida.");
  }

  return publicPlanAtStage(planId, definition, stage, { legacy: isLegacy });
}

export function getPlans(options = {}) {
  const inventory = options.inventory || getInventorySnapshot();
  return Object.keys(PLAN_CATALOG).map((planId) => getPlan(planId, { ...options, inventory }));
}

export function assertPlanAvailability(plan, inventory = getInventorySnapshot()) {
  if (!inventory.configured) return true;
  if (inventory.total.assigned + plan.participantCount > EVENT_CAPACITY) {
    throw new ApiError(409, "EVENT_SOLD_OUT", "I posti complessivi per l’evento sono esauriti.");
  }
  if (
    plan.builderSlots > 0 &&
    inventory.builder.assigned + plan.builderSlots > BUILDER_CAPACITY
  ) {
    throw new ApiError(409, "BUILDER_SOLD_OUT", "I posti per il Live Building sono esauriti.");
  }
  return true;
}

export function assertExpectedPricingStage(plan, expectedPricingStage) {
  if (!Number.isInteger(expectedPricingStage) || expectedPricingStage !== plan.pricingStage) {
    throw new ApiError(
      409,
      "PRICE_CHANGED",
      "La finestra di prezzo è cambiata. Aggiorna il totale e conferma di nuovo.",
    );
  }
  return true;
}

function cleanCustomerText(value, fieldLabel, maxLength) {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maxLength || /[\u0000-\u001F\u007F]/.test(cleaned)) {
    throw new ApiError(400, "INVALID_CUSTOMER", `Inserisci ${fieldLabel} valido.`);
  }
  return cleaned;
}

function optionalCustomerText(value, fieldLabel, maxLength) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized) return "";
  return cleanCustomerText(normalized, fieldLabel, maxLength);
}

export function validateCustomer(customer, options = {}) {
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Inserisci i dati del partecipante.");
  }

  const requireBilling = options.requireBilling !== false;
  const firstName = cleanCustomerText(customer.firstName, "un nome", 80);
  const lastName = cleanCustomerText(customer.lastName, "un cognome", 80);
  const email = String(customer.email || "").trim().toLowerCase();
  const phone = cleanCustomerText(customer.phone, "un numero di telefono", 40);
  const referral = String(customer.referral || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  const suppliedCustomerType = String(customer.customerType || "").trim().toLowerCase();
  const customerType = suppliedCustomerType ||
    (String(customer.companyName || "").trim() ? "company" : "private");
  if (customerType !== "private" && customerType !== "company") {
    throw new ApiError(400, "INVALID_CUSTOMER", "Seleziona Privato oppure Azienda.");
  }
  const customerText = requireBilling ? cleanCustomerText : optionalCustomerText;
  const companyName = customerType === "company"
    ? customerText(customer.companyName, "una ragione sociale", 160)
    : "";
  const address = customerText(customer.address, "un indirizzo", 180);
  const city = customerText(customer.city, "una città", 100);
  const countryCode = String(customer.countryCode || "").trim().toUpperCase();
  const postalCode = customerText(customer.postalCode, "un codice postale", 20);
  const taxId = customerText(
    customer.taxId,
    "una partita IVA o un codice fiscale",
    32,
  ).toUpperCase();

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Inserisci un’email valida.");
  }
  const phoneDigits = phone.replace(/\D/g, "");
  if (
    phoneDigits.length < 6 ||
    phoneDigits.length > 20 ||
    !/^[0-9+(). /-]+$/.test(phone)
  ) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Inserisci un numero di telefono valido.");
  }
  if (referral.length > 160 || /[\u0000-\u001F\u007F]/.test(referral)) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Inserisci un referral valido.");
  }
  if ((requireBilling || countryCode) && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Seleziona un Paese valido.");
  }
  if (city && !/^[\p{L}\p{M} .’'()-]+$/u.test(city)) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Inserisci una città valida.");
  }
  if (postalCode && !/^[\p{L}\p{N} .-]+$/u.test(postalCode)) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Inserisci un codice postale valido.");
  }
  if (taxId && !/^[\p{L}\p{N} ./-]+$/u.test(taxId)) {
    throw new ApiError(400, "INVALID_CUSTOMER", "Inserisci una partita IVA o un codice fiscale valido.");
  }

  return { firstName, lastName, email, phone, referral, customerType, companyName, address, city, countryCode, postalCode, taxId };
}

export function getReferenceId(planId) {
  return `${ORDER_PREFIX}-${planId}`;
}

export function getCustomId(plan) {
  return `${ORDER_PREFIX}:${plan.id}:${plan.pricingStage}:${plan.price}`;
}

function parseCustomId(customId) {
  const match = /^AAW26:([a-z0-9-]{3,64}):(\d):([0-9]+\.\d{2})$/.exec(customId || "");
  if (!match) {
    throw new ApiError(409, "ORDER_METADATA_MISMATCH", "I dati dell’ordine non sono validi.");
  }

  return {
    planId: match[1],
    stage: Number(match[2]),
    price: match[3],
  };
}

export function validateOrderId(orderId) {
  const normalized = String(orderId || "").trim().toUpperCase();
  if (!VALID_ORDER_ID.test(normalized)) {
    throw new ApiError(400, "INVALID_ORDER_ID", "Identificativo ordine non valido.");
  }
  return normalized;
}

export function getCheckoutToken(orderId, planId) {
  const normalizedOrderId = validateOrderId(orderId);
  const normalizedPlanId = getPlan(planId, { allowLegacy: true }).id;
  const config = getPayPalConfig({ requireCredentials: true });
  const signature = createHmac("sha256", config.clientSecret)
    .update(`${ORDER_PREFIX}:${config.environment}:${config.clientId}:${normalizedOrderId}:${normalizedPlanId}`)
    .digest("base64url");
  return `v1.${signature}`;
}

export function verifyCheckoutToken(orderId, planId, token) {
  const supplied = String(token || "").trim();
  if (!VALID_CHECKOUT_TOKEN.test(supplied)) {
    throw new ApiError(401, "INVALID_CHECKOUT_TOKEN", "Sessione checkout non valida.");
  }

  const expected = getCheckoutToken(orderId, planId);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new ApiError(401, "INVALID_CHECKOUT_TOKEN", "Sessione checkout non valida.");
  }
  return true;
}

export function validateOrder(order, expectedPlanId = null) {
  if (!order || typeof order !== "object" || !order.id) {
    throw new ApiError(502, "INVALID_PAYPAL_RESPONSE", "Risposta PayPal non valida.");
  }
  if (order.intent !== "CAPTURE") {
    throw new ApiError(409, "ORDER_INTENT_MISMATCH", "L’ordine non può essere catturato.");
  }

  const purchaseUnits = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  if (purchaseUnits.length !== 1) {
    throw new ApiError(409, "ORDER_UNITS_MISMATCH", "L’ordine contiene dati inattesi.");
  }

  const purchaseUnit = purchaseUnits[0];
  const marker = parseCustomId(purchaseUnit.custom_id);
  const plan = getPlan(marker.planId, { stage: marker.stage, allowLegacy: true });

  if (expectedPlanId && marker.planId !== expectedPlanId) {
    throw new ApiError(409, "ORDER_PLAN_MISMATCH", "Il piano dell’ordine non corrisponde.");
  }
  if (purchaseUnit.reference_id !== getReferenceId(marker.planId)) {
    throw new ApiError(409, "ORDER_REFERENCE_MISMATCH", "Il riferimento dell’ordine non corrisponde.");
  }
  if (marker.price !== plan.price) {
    throw new ApiError(409, "ORDER_CATALOG_MISMATCH", "Il prezzo dell’ordine non corrisponde al catalogo.");
  }

  const amount = purchaseUnit.amount || {};
  if (amount.currency_code !== CURRENCY || amount.value !== plan.price) {
    throw new ApiError(409, "ORDER_AMOUNT_MISMATCH", "L’importo dell’ordine non corrisponde.");
  }

  return { plan, purchaseUnit };
}

export function getValidatedPayment(order, expectedPlanId = null) {
  const { plan, purchaseUnit } = validateOrder(order, expectedPlanId);
  const captures = Array.isArray(purchaseUnit?.payments?.captures)
    ? purchaseUnit.payments.captures
    : [];
  const capture = captures.at(-1) || null;
  const captureAmount = capture?.amount || null;
  const paymentCompleted = Boolean(
    order.status === "COMPLETED" &&
      capture?.status === "COMPLETED" &&
      captureAmount?.currency_code === plan.currency &&
      captureAmount?.value === plan.price,
  );

  return { plan, purchaseUnit, capture, paymentCompleted };
}

function getHeader(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function assertTrustedJsonRequest(req) {
  const contentType = String(getHeader(req, "content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(415, "JSON_REQUIRED", "La richiesta deve usare JSON.");
  }

  const fetchSite = String(getHeader(req, "sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "Origine della richiesta non consentita.");
  }

  const origin = String(getHeader(req, "origin") || "").trim();
  if (!origin) return true;

  const forwardedHost = String(getHeader(req, "x-forwarded-host") || "")
    .split(",", 1)[0]
    .trim();
  const requestHost = forwardedHost || String(getHeader(req, "host") || "").trim();
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "Origine della richiesta non consentita.");
  }
  if (!requestHost || originHost !== requestHost) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "Origine della richiesta non consentita.");
  }
  return true;
}

function deterministicUuid(value) {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

export function getRequestId(req, scope, fallbackSeed = null) {
  const supplied = getHeader(req, "idempotency-key") || getHeader(req, "x-idempotency-key");
  if (supplied && !VALID_IDEMPOTENCY_KEY.test(supplied)) {
    throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "Chiave di idempotenza non valida.");
  }

  if (supplied) return deterministicUuid(`${scope}:${supplied}`);
  if (fallbackSeed) return deterministicUuid(`${scope}:${fallbackSeed}`);
  return randomUUID();
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    let encoded;
    try {
      encoded = JSON.stringify(req.body);
    } catch {
      throw new ApiError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
    }
    if (Buffer.byteLength(encoded) > MAX_BODY_BYTES) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    return req.body;
  }

  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw new ApiError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
  }
}

function assertCredentials(config) {
  if (!config.clientId || !config.clientSecret) {
    throw new ApiError(503, "PAYPAL_NOT_CONFIGURED", "PayPal non è ancora configurato.");
  }
}

async function getAccessToken() {
  const config = getPayPalConfig({ requireCredentials: true });
  const now = Date.now();
  if (
    accessTokenCache &&
    accessTokenCache.environment === config.environment &&
    accessTokenCache.clientId === config.clientId &&
    accessTokenCache.expiresAt > now + 60_000
  ) {
    return { config, accessToken: accessTokenCache.accessToken };
  }

  assertCredentials(config);
  let response;
  try {
    response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ApiError(502, "PAYPAL_UNAVAILABLE", "PayPal non è momentaneamente raggiungibile.", { cause });
  }

  const payload = await parseResponse(response);
  if (!response.ok || !payload?.access_token) {
    throw toPayPalError(response.status, payload);
  }

  accessTokenCache = {
    accessToken: payload.access_token,
    clientId: config.clientId,
    environment: config.environment,
    expiresAt: now + Math.max(60, Number(payload.expires_in) || 300) * 1_000,
  };

  return { config, accessToken: payload.access_token };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toPayPalError(status, payload) {
  const upstreamCode = String(payload?.name || "REQUEST_FAILED")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  const publicStatus = [400, 404, 409, 422].includes(status) ? status : 502;
  return new ApiError(publicStatus, `PAYPAL_${upstreamCode}`, "PayPal non ha completato la richiesta.", {
    providerDebugId: payload?.debug_id || null,
  });
}

export async function paypalRequest(path, options = {}) {
  const { config, accessToken } = await getAccessToken();
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;
  if (options.preferRepresentation) headers.Prefer = "return=representation";

  let response;
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ApiError(502, "PAYPAL_UNAVAILABLE", "PayPal non è momentaneamente raggiungibile.", { cause });
  }

  const payload = await parseResponse(response);
  if (!response.ok) throw toPayPalError(response.status, payload);
  return payload;
}

export function sanitizeOrder(order, expectedPlanId = null) {
  const { plan, purchaseUnit, capture, paymentCompleted } = getValidatedPayment(
    order,
    expectedPlanId,
  );

  return {
    orderId: order.id,
    status: order.status,
    paymentCompleted,
    intent: order.intent,
    plan,
    amount: {
      currency: purchaseUnit.amount.currency_code,
      value: purchaseUnit.amount.value,
    },
    capture: capture
      ? {
          status: capture.status,
          amount: capture.amount
            ? { currency: capture.amount.currency_code, value: capture.amount.value }
            : null,
        }
      : null,
    createdAt: order.create_time || null,
    updatedAt: order.update_time || null,
  };
}

export function rejectClientPricing(body) {
  if (body && ["price", "amount", "currency", "currencyCode"].some((key) => key in body)) {
    throw new ApiError(
      400,
      "CLIENT_PRICING_NOT_ALLOWED",
      "Prezzo e valuta vengono determinati esclusivamente dal server.",
    );
  }
}

export function getQueryParam(req, key) {
  const queryValue = req?.query?.[key];
  if (Array.isArray(queryValue)) return queryValue[0] || "";
  if (typeof queryValue === "string") return queryValue;
  const url = new URL(req?.url || "/", "http://localhost");
  return url.searchParams.get(key) || "";
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return sendJson(res, 405, {
    error: { code: "METHOD_NOT_ALLOWED", message: "Metodo non consentito." },
  });
}

export function sendJson(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(payload);
}

export function handleError(res, error) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, "INTERNAL_ERROR", "Si è verificato un errore inatteso.", { cause: error });

  console.error("[paypal-api]", {
    code: apiError.code,
    status: apiError.status,
    providerDebugId: apiError.providerDebugId,
  });

  return sendJson(res, apiError.status, {
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.providerDebugId ? { providerDebugId: apiError.providerDebugId } : {}),
    },
  });
}
