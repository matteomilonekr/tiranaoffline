import { createHash } from "node:crypto";
import {
  FunnelError,
  createRecordId,
  sendResendEmail,
  setRegistrationSessionCookie,
} from "./_funnel.js";
import { syncLeadToGoogleSheets } from "./_google-sheets.js";
import {
  buildLeadSlackMessage,
  hasSlackNotificationConfig,
  sendSlackNotification,
} from "./_slack.js";

const MAX_BODY_BYTES = 4_096;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_IDEMPOTENCY_KEY = /^[A-Za-z0-9._~-]{8,128}$/;

class RegistrationError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = "RegistrationError";
    this.status = status;
    this.code = code;
    this.cause = options.cause;
  }
}

function getHeader(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(payload);
}

function methodNotAllowed(res) {
  res.setHeader("Allow", "POST");
  return sendJson(res, 405, {
    error: { code: "METHOD_NOT_ALLOWED", message: "Metodo non consentito." },
  });
}

function assertTrustedJsonRequest(req) {
  const contentType = String(getHeader(req, "content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new RegistrationError(415, "JSON_REQUIRED", "La richiesta deve usare JSON.");
  }

  const fetchSite = String(getHeader(req, "sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new RegistrationError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origine della richiesta non consentita.",
    );
  }

  const originValue = String(getHeader(req, "origin") || "").trim();
  const forwardedHost = String(getHeader(req, "x-forwarded-host") || "")
    .split(",", 1)[0]
    .trim();
  const requestHost = forwardedHost || String(getHeader(req, "host") || "").trim();
  if (!originValue || !requestHost) {
    throw new RegistrationError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origine della richiesta non consentita.",
    );
  }

  let origin;
  try {
    origin = new URL(originValue);
  } catch {
    throw new RegistrationError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origine della richiesta non consentita.",
    );
  }

  if (origin.host.toLowerCase() !== requestHost.toLowerCase()) {
    throw new RegistrationError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origine della richiesta non consentita.",
    );
  }

  const forwardedProto = String(getHeader(req, "x-forwarded-proto") || "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase();
  if (forwardedProto && origin.protocol !== `${forwardedProto}:`) {
    throw new RegistrationError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origine della richiesta non consentita.",
    );
  }
}

async function readJsonBody(req) {
  const declaredLength = Number(getHeader(req, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RegistrationError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
  }

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    let encoded;
    try {
      encoded = JSON.stringify(req.body);
    } catch {
      throw new RegistrationError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
    }
    if (Buffer.byteLength(encoded) > MAX_BODY_BYTES) {
      throw new RegistrationError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    return req.body;
  }

  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      throw new RegistrationError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw new RegistrationError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
    }
  }

  if (!req || typeof req[Symbol.asyncIterator] !== "function") return {};

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new RegistrationError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    chunks.push(buffer);
  }

  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RegistrationError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
  }
}

function normalizeText(value, maxLength) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new RegistrationError(
      400,
      "INVALID_REGISTRATION",
      "Controlla i dati inseriti.",
    );
  }
  return normalized;
}

function validateRegistration(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RegistrationError(
      400,
      "INVALID_REGISTRATION",
      "Controlla i dati inseriti.",
    );
  }

  const honeypot = [body.website, body.companyWebsite, body._gotcha].some(
    (value) => String(value || "").trim().length > 0,
  );
  if (honeypot) return { spam: true };

  const name = normalizeText(body.name, MAX_NAME_LENGTH);
  if (
    name.length < 2 ||
    !/^[\p{L}\p{M}][\p{L}\p{M} .’'()-]*$/u.test(name)
  ) {
    throw new RegistrationError(
      400,
      "INVALID_REGISTRATION",
      "Inserisci un nome valido.",
    );
  }

  const email = String(body.email || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !VALID_EMAIL.test(email) ||
    /[\u0000-\u001F\u007F]/.test(email)
  ) {
    throw new RegistrationError(
      400,
      "INVALID_REGISTRATION",
      "Inserisci un’email valida.",
    );
  }

  return {
    spam: false,
    name,
    email,
    phone: normalizeText(body.phone, 40),
    referral: normalizeText(body.referral, 160),
    source: normalizeText(body.source || "sito", 60),
    plan: normalizeText(body.plan, 80),
  };
}

function getIdempotencyKey(req, registration) {
  const supplied = String(
    getHeader(req, "idempotency-key") || getHeader(req, "x-idempotency-key") || "",
  ).trim();
  if (supplied && !VALID_IDEMPOTENCY_KEY.test(supplied)) {
    throw new RegistrationError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Chiave di idempotenza non valida.",
    );
  }

  if (supplied) return `tirana-registration-${supplied}`;

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(registration))
    .digest("hex");
  return `tirana-registration-${fingerprint}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getNotification(registration, registrationId) {
  const fields = [
    ["Record", registrationId],
    ["Stato", "FORM COMPILATO"],
    ["Nome", registration.name],
    ["Email", registration.email],
    ["Telefono", registration.phone || "Non indicato"],
    ["Referral", registration.referral || "Non indicato"],
    ["Origine", registration.source || "sito"],
    ["Piano", registration.plan || "Non indicato"],
  ];
  const text = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = fields
    .map(
      ([label, value]) =>
        `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return {
    subject: `[TIRANA][LEAD] ${registrationId} · ${registration.name}`,
    text,
    html: `<p>Nuova registrazione ricevuta.</p><table>${htmlRows}</table>`,
  };
}

async function sendRegistrationNotification(registration, registrationId, idempotencyKey) {
  const notification = getNotification(registration, registrationId);
  try {
    await sendResendEmail({
      subject: notification.subject,
      text: notification.text,
      html: notification.html,
      tags: [
        { name: "event", value: "tirana-offline" },
        { name: "record_type", value: "lead" },
        { name: "form_status", value: "completed" },
      ],
      headers: {
        "X-Tirana-Record-Type": "lead",
        "X-Tirana-Record-Id": registrationId,
      },
      idempotencyKey,
    });
    return { status: "sent" };
  } catch (error) {
    console.warn("[tirana] notifica lead rinviata", {
      recordId: registrationId,
      channel: "internal-email",
      code: String(error?.code || "NOTIFICATION_UNAVAILABLE"),
      status: Number(error?.status) || 502,
    });
    return { status: "deferred" };
  }
}

async function sendRegistrationSlackNotification(registration, registrationId) {
  if (!hasSlackNotificationConfig()) return { status: "skipped" };

  try {
    await sendSlackNotification(buildLeadSlackMessage(registration, registrationId));
    return { status: "sent" };
  } catch (error) {
    console.warn("[tirana] notifica lead rinviata", {
      recordId: registrationId,
      channel: "slack",
      code: String(error?.code || "NOTIFICATION_UNAVAILABLE"),
      status: Number(error?.status) || 502,
    });
    return { status: "deferred" };
  }
}

async function syncRegistrationRecord(registration, registrationId) {
  try {
    await syncLeadToGoogleSheets(registration, registrationId);
  } catch (error) {
    throw new RegistrationError(
      Number(error?.status) || 502,
      error?.code || "SHEET_UNAVAILABLE",
      error?.message || "La registrazione non è stata salvata. Riprova tra poco.",
      { cause: error },
    );
  }
}

function handleError(res, error) {
  const safeError =
    error instanceof RegistrationError
      ? error
      : new RegistrationError(
          500,
          "INTERNAL_ERROR",
          "Non è stato possibile completare la richiesta.",
        );
  return sendJson(res, safeError.status, {
    error: { code: safeError.code, message: safeError.message },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    assertTrustedJsonRequest(req);
    const body = await readJsonBody(req);
    const registration = validateRegistration(body);

    if (registration.spam) return sendJson(res, 200, { ok: true });

    const idempotencyKey = getIdempotencyKey(req, registration);
    const registrationId = createRecordId("TIR-REG", idempotencyKey);
    await syncRegistrationRecord(registration, registrationId);
    const [notification] = await Promise.all([
      sendRegistrationNotification(registration, registrationId, idempotencyKey),
      sendRegistrationSlackNotification(registration, registrationId),
    ]);
    const grantsTicketAccess = registration.source === "ticket-gate";
    if (grantsTicketAccess) {
      try {
        setRegistrationSessionCookie(res, registrationId);
      } catch (error) {
        if (error instanceof FunnelError) {
          throw new RegistrationError(error.status, error.code, error.message, { cause: error });
        }
        throw error;
      }
    }
    return sendJson(res, 200, {
      ok: true,
      registrationId,
      next: grantsTicketAccess ? "/offerta" : null,
      notification: notification.status,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
