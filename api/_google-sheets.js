import { FunnelError } from "./_funnel.js";

const GOOGLE_SHEETS_TIMEOUT_MS = 7_000;
const GOOGLE_SHEETS_USER_AGENT = "tiranaoffline.com/1.0";
const VALID_APPS_SCRIPT_PATH = /^\/macros\/s\/[^/]+\/exec$/;
const VALID_SYNC_RESULTS = new Set(["appended", "updated", "duplicate"]);
const VALID_EVENTS = new Set(["lead_registered", "ticket_registered"]);

function sheetsRequired() {
  return String(process.env.GOOGLE_SHEETS_REQUIRED || "")
    .trim()
    .toLowerCase() === "true";
}

function getGoogleSheetsConfig() {
  const webhookUrl = String(process.env.GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
  const webhookSecret = String(process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || "").trim();

  if (!webhookUrl && !webhookSecret) {
    if (sheetsRequired()) {
      throw new FunnelError(
        503,
        "SHEET_NOT_CONFIGURED",
        "Il registro iscritti non è disponibile. Riprova tra poco.",
      );
    }
    return null;
  }

  if (!webhookUrl || webhookSecret.length < 32) {
    throw new FunnelError(
      503,
      "SHEET_NOT_CONFIGURED",
      "Il registro iscritti non è disponibile. Riprova tra poco.",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    throw new FunnelError(
      503,
      "SHEET_NOT_CONFIGURED",
      "Il registro iscritti non è disponibile. Riprova tra poco.",
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "script.google.com" ||
    !VALID_APPS_SCRIPT_PATH.test(parsedUrl.pathname)
  ) {
    throw new FunnelError(
      503,
      "SHEET_NOT_CONFIGURED",
      "Il registro iscritti non è disponibile. Riprova tra poco.",
    );
  }

  return { webhookUrl: parsedUrl.toString(), webhookSecret };
}

function safeCellValue(value, maxLength = 500) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

export function ticketSheetRecord(order, customer, ticketUrl, occurredAt = new Date()) {
  const timestamp = occurredAt instanceof Date
    ? occurredAt.toISOString()
    : new Date(occurredAt).toISOString();
  const free = order.status === "CONFIRMED_FREE" || order.plan?.price === "0.00";

  return {
    createdAt: timestamp,
    registrationId: safeCellValue(order.registrationId, 40),
    ticketId: safeCellValue(order.orderId, 40),
    registrationStatus: free ? "BIGLIETTO CONFERMATO" : "BIGLIETTO REGISTRATO",
    paymentStatus: free ? "PAGAMENTO NON RICHIESTO" : "IN ATTESA DI ACCREDITO",
    paymentMethod: free ? "GRATUITO" : "BONIFICO",
    planId: safeCellValue(order.plan.id, 80),
    planName: safeCellValue(order.plan.name, 160),
    pricingStage: safeCellValue(order.pricingStage, 40),
    amount: safeCellValue(order.plan.priceFormatted || order.price, 40),
    currency: safeCellValue(order.plan.currency || "EUR", 8),
    participantCount: Number(order.plan.participantCount) || 1,
    builderSlots: Number(order.plan.builderSlots) || 0,
    firstName: safeCellValue(customer.firstName, 100),
    lastName: safeCellValue(customer.lastName, 100),
    email: safeCellValue(String(customer.email || "").toLowerCase(), 254),
    phone: safeCellValue(customer.phone, 60),
    referral: safeCellValue(customer.referral, 200),
    source: "checkout",
    companyName: safeCellValue(customer.companyName, 180),
    taxId: safeCellValue(customer.taxId, 80),
    address: safeCellValue(customer.address, 240),
    city: safeCellValue(customer.city, 100),
    countryCode: safeCellValue(customer.countryCode, 8),
    postalCode: safeCellValue(customer.postalCode, 24),
    reference: safeCellValue(order.reference, 120),
    ticketUrl: safeCellValue(ticketUrl, 500),
    updatedAt: timestamp,
  };
}

export function leadSheetRecord(registration, registrationId, occurredAt = new Date()) {
  const timestamp = occurredAt instanceof Date
    ? occurredAt.toISOString()
    : new Date(occurredAt).toISOString();

  return {
    createdAt: timestamp,
    registrationId: safeCellValue(registrationId, 40),
    ticketId: "",
    registrationStatus: "FORM COMPILATO",
    paymentStatus: "",
    paymentMethod: "",
    planId: safeCellValue(registration.plan, 80),
    planName: "",
    pricingStage: "",
    amount: "",
    currency: "",
    participantCount: "",
    builderSlots: "",
    firstName: safeCellValue(registration.name, 160),
    lastName: "",
    email: safeCellValue(String(registration.email || "").toLowerCase(), 254),
    phone: safeCellValue(registration.phone, 60),
    referral: safeCellValue(registration.referral, 200),
    source: safeCellValue(registration.source || "sito", 80),
    companyName: "",
    taxId: "",
    address: "",
    city: "",
    countryCode: "",
    postalCode: "",
    reference: "",
    ticketUrl: "",
    updatedAt: timestamp,
  };
}

function sheetUnavailable() {
  return new FunnelError(
    502,
    "SHEET_UNAVAILABLE",
    "Non è stato possibile registrare il biglietto. Riprova tra poco.",
  );
}

async function syncRecordToGoogleSheets(event, record) {
  if (!VALID_EVENTS.has(event)) throw sheetUnavailable();
  const config = getGoogleSheetsConfig();
  if (!config) return { ok: true, skipped: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SHEETS_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(config.webhookUrl, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": GOOGLE_SHEETS_USER_AGENT,
      },
      body: JSON.stringify({
        schemaVersion: 1,
        secret: config.webhookSecret,
        event,
        data: record,
      }),
    });
  } catch {
    throw sheetUnavailable();
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw sheetUnavailable();
  }

  if (
    !response.ok ||
    payload?.ok !== true ||
    !VALID_SYNC_RESULTS.has(payload?.result) ||
    payload?.registrationId !== record.registrationId ||
    payload?.ticketId !== record.ticketId
  ) {
    throw sheetUnavailable();
  }

  return payload;
}

export function syncTicketToGoogleSheets(order, customer, ticketUrl) {
  return syncRecordToGoogleSheets(
    "ticket_registered",
    ticketSheetRecord(order, customer, ticketUrl),
  );
}

export function paidTicketSheetRecord(order, customer, ticketUrl, occurredAt = new Date()) {
  return {
    ...ticketSheetRecord(order, customer, ticketUrl, occurredAt),
    registrationStatus: "BIGLIETTO CONFERMATO",
    paymentStatus: "PAGATO",
    paymentMethod: "STRIPE",
    reference: safeCellValue(order.reference || order.stripeSessionId, 120),
  };
}

export function syncPaidTicketToGoogleSheets(order, customer, ticketUrl) {
  return syncRecordToGoogleSheets(
    "ticket_registered",
    paidTicketSheetRecord(order, customer, ticketUrl),
  );
}

export function syncLeadToGoogleSheets(registration, registrationId) {
  return syncRecordToGoogleSheets(
    "lead_registered",
    leadSheetRecord(registration, registrationId),
  );
}
