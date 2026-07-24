import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { FunnelError, getHeader } from "./_funnel.js";

const DEFAULT_META_PIXEL_ID = "2605330299866744";
const DEFAULT_GRAPH_API_VERSION = "v23.0";
const META_TIMEOUT_MS = 8_000;
const PUBLIC_SITE_ORIGINS = new Set([
  "https://tiranaoffline.com",
  "https://www.tiranaoffline.com",
]);
const VALID_PIXEL_ID = /^\d{10,25}$/;
const VALID_GRAPH_VERSION = /^v\d{1,2}\.\d$/;
const VALID_TOKEN = /^[^\s\u0000-\u001F]{40,2048}$/;
const VALID_ORDER_ID = /^TIR-ORD-[A-F0-9]{12}$/;
const VALID_META_COOKIE = /^fb\.1\.\d{10,13}\.[A-Za-z0-9._-]{1,180}$/;

function cleanText(value, maxLength) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) {
    return "";
  }
  return normalized;
}

function canonicalSiteUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !PUBLIC_SITE_ORIGINS.has(url.origin)) return "";
    url.hash = "";
    return url.toString().slice(0, 500);
  } catch {
    return "";
  }
}

function requestIp(req) {
  const raw = getHeader(req, "x-vercel-forwarded-for")
    || getHeader(req, "x-forwarded-for")
    || getHeader(req, "x-real-ip");
  const candidate = String(raw || "").split(",")[0].trim().replace(/^::ffff:/, "");
  return isIP(candidate) ? candidate : "";
}

function cleanMetaCookie(value) {
  const normalized = cleanText(value, 220);
  return VALID_META_COOKIE.test(normalized) ? normalized : "";
}

export function normalizeTrackingContext(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const consent = {
    analytics: raw?.consent?.analytics === true,
    marketing: raw?.consent?.marketing === true,
  };
  const normalized = { consent };
  if (!consent.marketing) return normalized;

  const fbp = cleanMetaCookie(raw.fbp);
  const fbc = cleanMetaCookie(raw.fbc);
  const clientIp = cleanText(raw.clientIp, 64);
  const clientUserAgent = cleanText(raw.clientUserAgent, 512);
  const eventSourceUrl = canonicalSiteUrl(raw.eventSourceUrl);
  if (fbp) normalized.fbp = fbp;
  if (fbc) normalized.fbc = fbc;
  if (clientIp && isIP(clientIp)) normalized.clientIp = clientIp;
  if (clientUserAgent) normalized.clientUserAgent = clientUserAgent;
  if (eventSourceUrl) normalized.eventSourceUrl = eventSourceUrl;
  return normalized;
}

export function captureTrackingContext(req, clientValue) {
  const client = normalizeTrackingContext(clientValue);
  if (!client.consent.marketing) return client;
  return normalizeTrackingContext({
    ...client,
    clientIp: requestIp(req),
    clientUserAgent: getHeader(req, "user-agent"),
    eventSourceUrl: client.eventSourceUrl || "https://www.tiranaoffline.com/checkout",
  });
}

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizedHash(value) {
  const normalized = cleanText(value, 320).toLowerCase();
  return normalized ? hash(normalized) : "";
}

function phoneHash(value) {
  const normalized = String(value || "").replace(/\D/g, "");
  return normalized ? hash(normalized) : "";
}

function assignHashed(userData, key, value) {
  if (value) userData[key] = [value];
}

export function metaPurchaseEventId(orderId) {
  const normalized = String(orderId || "").trim().toUpperCase();
  if (!VALID_ORDER_ID.test(normalized)) {
    throw new FunnelError(400, "META_EVENT_INVALID", "Evento di acquisto non valido.");
  }
  return `tirana.purchase.${normalized}`;
}

export function buildMetaPurchaseEvent({ order, customer, tracking, eventTime = Date.now() }) {
  const normalizedTracking = normalizeTrackingContext(tracking);
  if (!normalizedTracking.consent.marketing) return null;
  const price = Number(order?.plan?.price);
  if (!Number.isFinite(price) || price <= 0 || !order?.plan?.id || !order?.plan?.name) {
    throw new FunnelError(400, "META_EVENT_INVALID", "Evento di acquisto non valido.");
  }

  const userData = {};
  assignHashed(userData, "em", normalizedHash(customer?.email));
  assignHashed(userData, "ph", phoneHash(customer?.phone));
  assignHashed(userData, "fn", normalizedHash(customer?.firstName));
  assignHashed(userData, "ln", normalizedHash(customer?.lastName));
  assignHashed(userData, "ct", normalizedHash(customer?.city));
  assignHashed(userData, "zp", normalizedHash(customer?.postalCode));
  assignHashed(userData, "country", normalizedHash(customer?.countryCode));
  assignHashed(userData, "external_id", normalizedHash(customer?.email));
  if (normalizedTracking.clientIp) userData.client_ip_address = normalizedTracking.clientIp;
  if (normalizedTracking.clientUserAgent) userData.client_user_agent = normalizedTracking.clientUserAgent;
  if (normalizedTracking.fbp) userData.fbp = normalizedTracking.fbp;
  if (normalizedTracking.fbc) userData.fbc = normalizedTracking.fbc;

  return {
    event_name: "Purchase",
    event_time: Math.floor(Number(eventTime) / 1_000),
    event_id: metaPurchaseEventId(order.orderId),
    event_source_url: normalizedTracking.eventSourceUrl || "https://www.tiranaoffline.com/thank-you",
    action_source: "website",
    user_data: userData,
    custom_data: {
      currency: String(order.plan.currency || "EUR").toUpperCase(),
      value: price,
      content_ids: [String(order.plan.id)],
      content_name: String(order.plan.name),
      content_type: "product",
      contents: [{ id: String(order.plan.id), quantity: 1, item_price: price }],
      order_id: String(order.orderId),
      num_items: 1,
    },
  };
}

export function getMetaCapiConfig() {
  const accessToken = String(process.env.META_CAPI_ACCESS_TOKEN || "").trim();
  if (!accessToken) return { configured: false };
  const pixelId = String(process.env.META_PIXEL_ID || DEFAULT_META_PIXEL_ID).trim();
  const graphVersion = String(
    process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
  ).trim();
  if (
    !VALID_TOKEN.test(accessToken)
    || !VALID_PIXEL_ID.test(pixelId)
    || !VALID_GRAPH_VERSION.test(graphVersion)
  ) {
    throw new FunnelError(
      503,
      "META_CAPI_NOT_CONFIGURED",
      "Il tracciamento server-side non è configurato correttamente.",
    );
  }
  const testEventCode = cleanText(process.env.META_TEST_EVENT_CODE, 80);
  return { configured: true, accessToken, pixelId, graphVersion, testEventCode };
}

export async function sendMetaPurchase(input) {
  const event = buildMetaPurchaseEvent(input);
  if (!event) return { status: "skipped-consent", eventId: null };
  const config = getMetaCapiConfig();
  if (!config.configured) {
    return { status: "skipped-config", eventId: event.event_id };
  }
  const body = { data: [event] };
  if (config.testEventCode) body.test_event_code = config.testEventCode;

  let response;
  let payload;
  try {
    response = await fetch(
      `https://graph.facebook.com/${config.graphVersion}/${config.pixelId}/events`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": "tiranaoffline.com/1.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      },
    );
    payload = await response.json();
  } catch (cause) {
    throw new FunnelError(
      502,
      "META_CAPI_UNAVAILABLE",
      "Meta Conversions API non è momentaneamente raggiungibile.",
      { cause },
    );
  }
  if (!response.ok || payload?.error || Number(payload?.events_received) < 1) {
    throw new FunnelError(
      502,
      "META_CAPI_FAILED",
      "Meta Conversions API non ha accettato l’evento.",
    );
  }
  return {
    status: "sent",
    eventId: event.event_id,
    eventsReceived: Number(payload.events_received),
    traceId: String(payload.fbtrace_id || ""),
  };
}
