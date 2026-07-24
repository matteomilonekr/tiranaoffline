import { timingSafeEqual } from "node:crypto";

// Proxy admin: legge le prenotazioni dal foglio Iscritti via Apps Script.
// Nasconde URL e segreto del webhook, protetto da ADMIN_DASHBOARD_TOKEN.
const APPS_SCRIPT_TIMEOUT_MS = 8_000;
const APPS_SCRIPT_USER_AGENT = "tiranaoffline.com/1.0";
const VALID_APPS_SCRIPT_PATH = /^\/macros\/s\/[^/]+\/exec$/;

function tokenMatches(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function getAppsScriptConfig() {
  const webhookUrl = String(process.env.GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
  const webhookSecret = String(process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || "").trim();
  if (!webhookUrl || webhookSecret.length < 32) return null;
  let parsed;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "script.google.com" ||
    !VALID_APPS_SCRIPT_PATH.test(parsed.pathname)
  ) {
    return null;
  }
  return { webhookUrl: parsed.toString(), webhookSecret };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, {
      error: { code: "METHOD_NOT_ALLOWED", message: "Metodo non consentito." },
    });
  }

  const adminToken = String(process.env.ADMIN_DASHBOARD_TOKEN || "").trim();
  const provided = String(req.headers["x-admin-token"] || "").trim();
  if (!adminToken || !provided || !tokenMatches(provided, adminToken)) {
    return sendJson(res, 401, {
      error: { code: "UNAUTHORIZED", message: "Token amministratore non valido." },
    });
  }

  const config = getAppsScriptConfig();
  if (!config) {
    return sendJson(res, 502, {
      error: {
        code: "SHEET_NOT_CONFIGURED",
        message: "Registro iscritti non configurato. Apps Script da aggiornare.",
      },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(config.webhookUrl, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": APPS_SCRIPT_USER_AGENT,
      },
      body: JSON.stringify({ secret: config.webhookSecret, action: "bookings" }),
    });
  } catch {
    clearTimeout(timeout);
    return sendJson(res, 502, {
      error: {
        code: "SHEET_UNAVAILABLE",
        message: "Registro iscritti non raggiungibile. Riprova tra poco.",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return sendJson(res, 502, {
      error: {
        code: "SHEET_INVALID",
        message: "Apps Script da aggiornare: risposta non valida.",
      },
    });
  }

  if (!response.ok || payload?.ok !== true || !Array.isArray(payload?.bookings)) {
    return sendJson(res, 502, {
      error: {
        code: "BOOKINGS_UNSUPPORTED",
        message: "Apps Script da aggiornare: azione bookings non disponibile.",
      },
    });
  }

  return sendJson(res, 200, {
    ok: true,
    bookings: payload.bookings,
    count: payload.bookings.length,
  });
}
