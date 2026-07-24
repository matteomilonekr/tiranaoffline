import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const RESEND_API_BASE = "https://api.resend.com";
const RESEND_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 12_288;
const SESSION_COOKIE = "tirana_funnel";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const ORDER_TTL_SECONDS = 60 * 60 * 24 * 14;
const TICKET_SHARE_TTL_SECONDS = 60 * 60 * 24 * 180;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_IDEMPOTENCY_KEY = /^[A-Za-z0-9._~-]{8,128}$/;

export const PUBLIC_PLAN_IDS = Object.freeze([
  "solo-mid",
  "solo-full",
  "agency-mid",
  "agency-full",
  "company-mid",
  "company-full",
]);

export const BANK_DETAILS = Object.freeze({
  beneficiary: "SCALERS SHPK",
  bank: "Raiffeisen Bank Sha",
  address: "RR 4 DESHMORET PALLATI NR 10 DYQ 6, TIRANE, ALBANIA",
  iban: "AL66202111850000000011988925",
  swift: "SGSBALTXXX",
});

export class FunnelError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = "FunnelError";
    this.status = status;
    this.code = code;
    this.cause = options.cause;
  }
}

export function getHeader(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function sendJson(res, status, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(payload);
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return sendJson(res, 405, {
    error: { code: "METHOD_NOT_ALLOWED", message: "Metodo non consentito." },
  });
}

export function assertTrustedJsonRequest(req) {
  const contentType = String(getHeader(req, "content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new FunnelError(415, "JSON_REQUIRED", "La richiesta deve usare JSON.");
  }

  const fetchSite = String(getHeader(req, "sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new FunnelError(403, "ORIGIN_NOT_ALLOWED", "Origine della richiesta non consentita.");
  }

  const originValue = String(getHeader(req, "origin") || "").trim();
  const forwardedHost = String(getHeader(req, "x-forwarded-host") || "")
    .split(",", 1)[0]
    .trim();
  const requestHost = forwardedHost || String(getHeader(req, "host") || "").trim();
  if (!originValue || !requestHost) {
    throw new FunnelError(403, "ORIGIN_NOT_ALLOWED", "Origine della richiesta non consentita.");
  }

  let origin;
  try {
    origin = new URL(originValue);
  } catch {
    throw new FunnelError(403, "ORIGIN_NOT_ALLOWED", "Origine della richiesta non consentita.");
  }

  const forwardedProto = String(getHeader(req, "x-forwarded-proto") || "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase();
  if (
    origin.host.toLowerCase() !== requestHost.toLowerCase() ||
    (forwardedProto && origin.protocol !== `${forwardedProto}:`)
  ) {
    throw new FunnelError(403, "ORIGIN_NOT_ALLOWED", "Origine della richiesta non consentita.");
  }
}

export async function readJsonBody(req) {
  const declaredLength = Number(getHeader(req, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new FunnelError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
  }

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    const encoded = JSON.stringify(req.body);
    if (Buffer.byteLength(encoded) > MAX_BODY_BYTES) {
      throw new FunnelError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    return req.body;
  }

  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      throw new FunnelError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw new FunnelError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
    }
  }

  if (!req || typeof req[Symbol.asyncIterator] !== "function") return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new FunnelError(413, "PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
    }
    chunks.push(buffer);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  } catch {
    throw new FunnelError(400, "INVALID_JSON", "Corpo della richiesta non valido.");
  }
}

export function normalizeText(value, maxLength, { required = true } = {}) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (
    (required && !normalized) ||
    normalized.length > maxLength ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw new FunnelError(400, "INVALID_DATA", "Controlla i dati inseriti.");
  }
  return normalized;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getFunnelSecret() {
  const secret = String(process.env.TIRANA_FUNNEL_SECRET || "").trim();
  if (Buffer.byteLength(secret) < 32) {
    throw new FunnelError(
      503,
      "FUNNEL_NOT_CONFIGURED",
      "Il percorso di registrazione non è momentaneamente disponibile.",
    );
  }
  return secret;
}

function signPayload(payload) {
  return createHmac("sha256", getFunnelSecret())
    .update(payload)
    .digest("base64url");
}

function createSignedToken(type, data, ttlSeconds) {
  const now = Math.floor(Date.now() / 1_000);
  const payload = Buffer.from(
    JSON.stringify({ v: 1, typ: type, iat: now, exp: now + ttlSeconds, ...data }),
  ).toString("base64url");
  return `v1.${payload}.${signPayload(`v1.${payload}`)}`;
}

function verifySignedToken(token, expectedType) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new FunnelError(401, "SESSION_REQUIRED", "Completa prima il form di registrazione.");
  }
  const signedPayload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signPayload(signedPayload));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new FunnelError(401, "SESSION_INVALID", "La sessione non è valida.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new FunnelError(401, "SESSION_INVALID", "La sessione non è valida.");
  }
  if (
    payload?.v !== 1 ||
    payload?.typ !== expectedType ||
    !Number.isInteger(payload?.exp) ||
    payload.exp < Math.floor(Date.now() / 1_000)
  ) {
    throw new FunnelError(401, "SESSION_EXPIRED", "La sessione è scaduta.");
  }
  return payload;
}

function parseCookies(req) {
  const raw = String(getHeader(req, "cookie") || "");
  return Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

export function createRecordId(prefix, seed = randomUUID()) {
  const digest = createHash("sha256")
    .update(`${prefix}:${seed}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `${prefix}-${digest}`;
}

export function setRegistrationSessionCookie(res, registrationId) {
  const token = createSignedToken(
    "registration",
    { rid: normalizeText(registrationId, 80) },
    SESSION_TTL_SECONDS,
  );
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  );
}

export function readRegistrationSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const payload = verifySignedToken(token, "registration");
  if (!/^TIR-REG-[A-F0-9]{12}$/.test(payload.rid || "")) {
    throw new FunnelError(401, "SESSION_INVALID", "La sessione non è valida.");
  }
  return { registrationId: payload.rid, expiresAt: payload.exp };
}

export function createBankOrderToken(order) {
  return createSignedToken(
    "bank-order",
    {
      oid: order.orderId,
      rid: order.registrationId,
      pid: order.planId,
      stage: order.pricingStage,
      price: order.price,
      coupon: order.couponCode || undefined,
    },
    ORDER_TTL_SECONDS,
  );
}

export function verifyBankOrderToken(token) {
  const payload = verifySignedToken(token, "bank-order");
  const couponCode = payload.coupon == null ? "" : String(payload.coupon);
  if (
    !/^TIR-ORD-[A-F0-9]{12}$/.test(payload.oid || "") ||
    !/^TIR-REG-[A-F0-9]{12}$/.test(payload.rid || "") ||
    !PUBLIC_PLAN_IDS.includes(payload.pid) ||
    !Number.isInteger(payload.stage) ||
    !/^[0-9]+\.\d{2}$/.test(payload.price || "") ||
    (couponCode && !/^[A-Z0-9_-]{1,32}$/.test(couponCode))
  ) {
    throw new FunnelError(401, "ORDER_TOKEN_INVALID", "Il riepilogo del biglietto non è valido.");
  }
  return { ...payload, coupon: couponCode };
}

export function createTicketShareToken({ displayName, planId }) {
  const normalizedName = normalizeText(displayName, 60);
  if (!PUBLIC_PLAN_IDS.includes(planId)) {
    throw new FunnelError(400, "INVALID_PLAN", "Seleziona un piano valido.");
  }
  return createSignedToken(
    "ticket-share",
    { dn: normalizedName, pid: planId },
    TICKET_SHARE_TTL_SECONDS,
  );
}

export function verifyTicketShareToken(token) {
  const payload = verifySignedToken(token, "ticket-share");
  const displayName = String(payload.dn || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (
    !displayName ||
    displayName.length > 60 ||
    /[\u0000-\u001F\u007F]/.test(displayName) ||
    !PUBLIC_PLAN_IDS.includes(payload.pid)
  ) {
    throw new FunnelError(401, "TICKET_SHARE_INVALID", "Il biglietto condiviso non è valido.");
  }
  return {
    displayName,
    planId: payload.pid,
    expiresAt: payload.exp,
  };
}

export function getIdempotencyKey(req, fallbackSeed = randomUUID()) {
  const supplied = String(
    getHeader(req, "idempotency-key") || getHeader(req, "x-idempotency-key") || "",
  ).trim();
  if (supplied && !VALID_IDEMPOTENCY_KEY.test(supplied)) {
    throw new FunnelError(400, "INVALID_IDEMPOTENCY_KEY", "Chiave di idempotenza non valida.");
  }
  return supplied || createHash("sha256").update(String(fallbackSeed)).digest("hex");
}

function getResendConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM || "").trim();
  const notifyTo = [
    ...new Set(
      String(process.env.REGISTRATION_NOTIFY_TO || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const replyTo = String(process.env.RESEND_REPLY_TO || notifyTo[0] || "")
    .trim()
    .toLowerCase();
  const fromEmail = String(from.match(/<([^<>]+)>$/)?.[1] || from)
    .trim()
    .toLowerCase();
  if (
    !apiKey ||
    !from ||
    notifyTo.length === 0 ||
    notifyTo.length > 10 ||
    !replyTo ||
    from.length > 320 ||
    /[\r\n]/.test(from) ||
    !VALID_EMAIL.test(fromEmail) ||
    notifyTo.some((email) => email.length > 254 || !VALID_EMAIL.test(email)) ||
    !VALID_EMAIL.test(replyTo)
  ) {
    throw new FunnelError(
      503,
      "NOTIFICATION_NOT_CONFIGURED",
      "Le notifiche non sono momentaneamente disponibili.",
    );
  }
  return { apiKey, from, notifyTo, replyTo };
}

export async function sendResendEmail({
  to,
  subject,
  text,
  html,
  tags = [],
  headers = {},
  idempotencyKey,
}) {
  const config = getResendConfig();
  let response;
  try {
    response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "tiranaoffline.com/1.0",
      },
      body: JSON.stringify({
        from: config.from,
        to: to || config.notifyTo,
        reply_to: config.replyTo,
        subject,
        text,
        html,
        tags,
        headers,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new FunnelError(
      502,
      "NOTIFICATION_UNAVAILABLE",
      "Non è stato possibile registrare la richiesta. Riprova tra poco.",
      { cause },
    );
  }
  if (!response.ok) {
    throw new FunnelError(
      502,
      "NOTIFICATION_UNAVAILABLE",
      "Non è stato possibile registrare la richiesta. Riprova tra poco.",
    );
  }
  return response.json().catch(() => ({}));
}

export function safeErrorResponse(res, error, fallbackMessage) {
  const safeError =
    error instanceof FunnelError
      ? error
      : new FunnelError(500, "INTERNAL_ERROR", fallbackMessage);
  return sendJson(res, safeError.status, {
    error: { code: safeError.code, message: safeError.message },
  });
}
