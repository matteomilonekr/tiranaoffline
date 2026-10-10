import { createHmac } from "node:crypto";

import {
  FunnelError,
  assertTrustedJsonRequest,
  createRecordId,
  escapeHtml,
  getHeader,
  getIdempotencyKey,
  methodNotAllowed,
  normalizeText,
  readJsonBody,
  safeErrorResponse,
  sendJson,
  sendResendEmail,
} from "./_funnel.js";
import {
  buildCallApplicationSlackMessage,
  hasSlackNotificationConfig,
  sendSlackNotification,
} from "./_slack.js";

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PHONE = /^\+?[0-9 ().-]{6,24}$/;
const WEBHOOK_TIMEOUT_MS = 6_000;
const DISQUALIFIED_PATH = "/call/non-idoneo";

export const CALL_SEGMENTS = Object.freeze({
  agenzia: "Agenzia",
  freelancer: "Freelancer / consulente",
  coach: "Coach / formatore",
  altro: "Altro",
});

export const CALL_REVENUE = Object.freeze({
  "lt-3k": "Meno di 3.000 €/mese",
  "3-10k": "3.000 - 10.000 €/mese",
  "10-30k": "10.000 - 30.000 €/mese",
  "30-100k": "30.000 - 100.000 €/mese",
  "gt-100k": "Oltre 100.000 €/mese",
});

export const CALL_TEAM = Object.freeze({
  solo: "Solo io",
  "2-5": "2-5 persone",
  "6-15": "6-15 persone",
  "16+": "Oltre 15 persone",
});

export const CALL_BOTTLENECKS = Object.freeze({
  acquisizione: "Acquisizione clienti",
  vendita: "Vendita e follow-up",
  delivery: "Delivery ai clienti",
  contenuti: "Contenuti e personal brand",
  team: "Gestione del team",
});

export const CALL_READINESS = Object.freeze({
  ready: "Sì, se il piano ha senso",
  partner: "Devo coinvolgere un socio",
  "no-budget": "Non ho budget da investire adesso",
});

const TRACKING_KEYS = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "per",
]);

// Host ammessi per il calendario: devono coincidere con frame-src della CSP di /call.
const BOOKING_PROVIDERS = new Map([
  ["calendly.com", "calendly"],
  ["cal.com", "cal"],
  ["app.cal.com", "cal"],
  ["api.leadconnectorhq.com", "leadconnector"],
]);

function invalid(message = "Controlla i dati inseriti.") {
  return new FunnelError(400, "INVALID_DATA", message);
}

function pickEnum(value, options, message) {
  const key = String(value || "").trim();
  if (!Object.hasOwn(options, key)) throw invalid(message);
  return key;
}

function normalizeBottlenecks(value) {
  const list = Array.isArray(value) ? value : [];
  if (list.length === 0 || list.length > Object.keys(CALL_BOTTLENECKS).length) {
    throw invalid("Indica almeno un'area in cui perdi tempo.");
  }
  const unique = [...new Set(list.map((item) => String(item || "").trim()))];
  if (unique.some((item) => !Object.hasOwn(CALL_BOTTLENECKS, item))) throw invalid();
  return unique;
}

function normalizeTracking(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const tracking = {};
  for (const key of TRACKING_KEYS) {
    const cleaned = String(raw[key] || "")
      .normalize("NFKC")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
      .slice(0, 120);
    if (cleaned) tracking[key] = cleaned;
  }
  return tracking;
}

export function validateCallApplication(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};

  // Campo trappola: le persone non lo vedono, i bot lo compilano.
  if (String(input.website || "").trim()) return { spam: true };

  const email = normalizeText(input.email, 254).toLowerCase();
  if (!VALID_EMAIL.test(email)) throw invalid("Inserisci un indirizzo email valido.");

  const phone = normalizeText(input.phone, 24);
  if (!VALID_PHONE.test(phone) || phone.replace(/\D/g, "").length < 6) {
    throw invalid("Inserisci un numero WhatsApp valido.");
  }

  if (input.privacy !== true) {
    throw invalid("Per continuare devi accettare l'informativa privacy.");
  }

  return {
    spam: false,
    segment: pickEnum(input.segment, CALL_SEGMENTS, "Seleziona il tipo di business."),
    revenue: pickEnum(input.revenue, CALL_REVENUE, "Seleziona il fatturato mensile."),
    team: pickEnum(input.team, CALL_TEAM, "Seleziona la dimensione del team."),
    bottlenecks: normalizeBottlenecks(input.bottlenecks),
    challenge: normalizeText(input.challenge, 600, { required: false }),
    readiness: pickEnum(input.readiness, CALL_READINESS, "Rispondi alla domanda sull'investimento."),
    firstName: normalizeText(input.firstName, 60),
    lastName: normalizeText(input.lastName, 60),
    email,
    phone,
    link: normalizeText(input.link, 200, { required: false }),
    tracking: normalizeTracking(input.tracking),
  };
}

export function qualifyCallApplication(application) {
  const reasons = [];
  if (application.revenue === "lt-3k") reasons.push("revenue");
  if (application.readiness === "no-budget") reasons.push("budget");

  const qualified = reasons.length === 0;
  const hot =
    qualified &&
    application.readiness === "ready" &&
    ["10-30k", "30-100k", "gt-100k"].includes(application.revenue);

  return { qualified, priority: qualified ? (hot ? "A" : "B") : "N", reasons };
}

function requestHost(req) {
  const forwarded = String(getHeader(req, "x-forwarded-host") || "").split(",", 1)[0].trim();
  return (forwarded || String(getHeader(req, "host") || "").trim()).toLowerCase();
}

export function buildBookingUrl(application, { embedDomain = "" } = {}) {
  const raw = String(process.env.CALL_BOOKING_URL || "").trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    console.warn("[call] CALL_BOOKING_URL non valido");
    return null;
  }

  const provider = BOOKING_PROVIDERS.get(url.hostname.toLowerCase());
  if (url.protocol !== "https:" || !provider) {
    console.warn("[call] CALL_BOOKING_URL usa un host non ammesso", { host: url.hostname });
    return null;
  }

  url.hash = "";
  const fullName = `${application.firstName} ${application.lastName}`.trim();
  url.searchParams.set("name", fullName);
  url.searchParams.set("email", application.email);

  if (provider === "calendly") {
    if (embedDomain) url.searchParams.set("embed_domain", embedDomain);
    url.searchParams.set("embed_type", "Inline");
    url.searchParams.set("hide_gdpr_banner", "1");
  }

  return { url: url.toString(), provider };
}

function applicationRows(application, qualification, applicationId) {
  return [
    ["Esito", qualification.qualified ? `QUALIFICATO (${qualification.priority})` : "NON IDONEO"],
    ["ID candidatura", applicationId],
    ["Nome", `${application.firstName} ${application.lastName}`],
    ["Email", application.email],
    ["WhatsApp", application.phone],
    ["Business", CALL_SEGMENTS[application.segment]],
    ["Fatturato", CALL_REVENUE[application.revenue]],
    ["Team", CALL_TEAM[application.team]],
    ["Colli di bottiglia", application.bottlenecks.map((key) => CALL_BOTTLENECKS[key]).join(", ")],
    ["Investimento", CALL_READINESS[application.readiness]],
    ["Sfida principale", application.challenge || "Non indicata"],
    ["Sito / profilo", application.link || "Non indicato"],
    [
      "Sorgente",
      Object.entries(application.tracking)
        .map(([key, value]) => `${key}=${value}`)
        .join(" · ") || "diretta",
    ],
  ];
}

async function sendInternalEmail(application, qualification, applicationId, idempotencyKey) {
  const rows = applicationRows(application, qualification, applicationId);
  const label = qualification.qualified ? `QUALIFICATO-${qualification.priority}` : "NON-IDONEO";
  try {
    await sendResendEmail({
      subject: `[CALL][${label}] ${application.firstName} ${application.lastName} · ${CALL_SEGMENTS[application.segment]} · ${CALL_REVENUE[application.revenue]}`,
      text: rows.map(([key, value]) => `${key}: ${value}`).join("\n"),
      html: `<p>Nuova candidatura alla AI OS Strategy Call.</p><table>${rows
        .map(
          ([key, value]) =>
            `<tr><th align="left" style="padding:4px 12px 4px 0">${escapeHtml(key)}</th><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`,
      tags: [
        { name: "funnel", value: "call" },
        { name: "record_type", value: "call_application" },
        { name: "qualified", value: qualification.qualified ? "yes" : "no" },
      ],
      headers: {
        "X-Call-Record-Type": "call_application",
        "X-Call-Record-Id": applicationId,
      },
      idempotencyKey,
    });
    return "sent";
  } catch (error) {
    console.warn("[call] notifica email rinviata", {
      recordId: applicationId,
      code: String(error?.code || "NOTIFICATION_UNAVAILABLE"),
    });
    return "deferred";
  }
}

async function sendSlack(application, qualification, applicationId) {
  if (!hasSlackNotificationConfig()) return "skipped";
  try {
    await sendSlackNotification(
      buildCallApplicationSlackMessage(applicationRows(application, qualification, applicationId)),
    );
    return "sent";
  } catch (error) {
    console.warn("[call] notifica Slack rinviata", {
      recordId: applicationId,
      code: String(error?.code || "SLACK_UNAVAILABLE"),
    });
    return "deferred";
  }
}

function getWebhookConfig() {
  const raw = String(process.env.CALL_FUNNEL_WEBHOOK_URL || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const secret = String(process.env.CALL_FUNNEL_WEBHOOK_SECRET || "").trim();
    return { url: url.toString(), secret: secret.length >= 32 ? secret : "" };
  } catch {
    return null;
  }
}

// Inoltro opzionale verso CRM o automazioni (Make, Zapier, n8n, GoHighLevel).
async function sendWebhook(application, qualification, applicationId, idempotencyKey) {
  const config = getWebhookConfig();
  if (!config) return "skipped";

  const body = JSON.stringify({
    event: "call_application",
    applicationId,
    submittedAt: new Date().toISOString(),
    qualification,
    application,
  });
  const headers = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "User-Agent": "tiranaoffline.com/1.0",
  };
  if (config.secret) {
    headers["X-Call-Funnel-Signature"] = `sha256=${createHmac("sha256", config.secret).update(body).digest("hex")}`;
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return "sent";
  } catch {
    console.warn("[call] webhook rinviato", { recordId: applicationId });
    return "deferred";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    assertTrustedJsonRequest(req);
    const body = await readJsonBody(req);
    const application = validateCallApplication(body);

    if (application.spam) {
      return sendJson(res, 200, { ok: true, qualified: false, next: DISQUALIFIED_PATH });
    }

    const idempotencyKey = getIdempotencyKey(req, `${application.email}:${application.phone}`);
    const applicationId = createRecordId("CALL-APP", idempotencyKey);
    const qualification = qualifyCallApplication(application);

    await Promise.all([
      sendInternalEmail(application, qualification, applicationId, idempotencyKey),
      sendSlack(application, qualification, applicationId),
      sendWebhook(application, qualification, applicationId, idempotencyKey),
    ]);

    if (!qualification.qualified) {
      return sendJson(res, 200, {
        ok: true,
        applicationId,
        qualified: false,
        next: DISQUALIFIED_PATH,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      applicationId,
      qualified: true,
      booking: buildBookingUrl(application, { embedDomain: requestHost(req) }),
    });
  } catch (error) {
    return safeErrorResponse(res, error, "Non è stato possibile inviare la candidatura.");
  }
}
