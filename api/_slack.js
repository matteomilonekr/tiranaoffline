const SLACK_API_URL = "https://slack.com/api/chat.postMessage";
const SLACK_TIMEOUT_MS = 6_000;
const VALID_SLACK_BOT_TOKEN = /^xoxb-[A-Za-z0-9-]{10,}$/;
const VALID_SLACK_CHANNEL_ID = /^C[A-Z0-9]{8,}$/;
const MAX_VALUE_LENGTH = 800;
const MAX_FALLBACK_TEXT_LENGTH = 3_500;

export class SlackNotificationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "SlackNotificationError";
    this.status = status;
    this.code = code;
  }
}

function cleanValue(value, fallback = "Non indicato", maxLength = MAX_VALUE_LENGTH) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return normalized || fallback;
}

function escapeSlackMrkdwn(value) {
  return cleanValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fallbackText(title, fields) {
  return [
    title,
    ...fields.map(([label, value]) => `${label}: ${escapeSlackMrkdwn(value)}`),
  ].join("\n").slice(0, MAX_FALLBACK_TEXT_LENGTH);
}

function messageBlocks(title, fields) {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: title, emoji: true },
    },
    {
      type: "section",
      fields: fields.map(([label, value]) => ({
        type: "mrkdwn",
        text: `*${label}*\n${escapeSlackMrkdwn(value)}`,
      })),
    },
  ];
}

function slackMessage(title, fields) {
  return {
    text: fallbackText(title, fields),
    blocks: messageBlocks(title, fields),
  };
}

function customerName(customer) {
  const fullName = [customer?.firstName, customer?.lastName]
    .map((value) => cleanValue(value, ""))
    .filter(Boolean)
    .join(" ");
  return fullName || cleanValue(customer?.name);
}

function couponLabel(order) {
  const coupon = order?.plan?.coupon;
  const code = cleanValue(
    coupon?.code || order?.couponCode || (typeof coupon === "string" ? coupon : ""),
    "Nessuno",
    80,
  );
  const discountPercent = Number(coupon?.discountPercent);
  if (code === "Nessuno" || !Number.isFinite(discountPercent) || discountPercent <= 0) {
    return code;
  }
  return `${code} (-${discountPercent}%)`;
}

function isFreeTicket(order) {
  return order?.status === "CONFIRMED_FREE" || order?.plan?.price === "0.00";
}

function ticketAmount(order, free) {
  if (free) return "GRATUITO";
  return cleanValue(
    order?.plan?.priceFormatted ||
      order?.priceFormatted ||
      order?.amountFormatted ||
      order?.price ||
      order?.plan?.price,
  );
}

export function buildLeadSlackMessage(registration, registrationId) {
  const title = "🟣 Nuovo lead Tirana Offline Mode";
  const fields = [
    ["Stato", "FORM COMPILATO"],
    ["Record ID", cleanValue(registrationId, "Non disponibile", 100)],
    ["Nome", cleanValue(registration?.name)],
    ["Email", cleanValue(registration?.email)],
    ["Telefono", cleanValue(registration?.phone)],
    ["Referral", cleanValue(registration?.referral)],
    ["Origine", cleanValue(registration?.source || "sito")],
    ["Piano", cleanValue(registration?.plan)],
  ];
  return slackMessage(title, fields);
}

export function buildTicketSlackMessage(order, customer, shareUrl) {
  const free = isFreeTicket(order);
  const title = free
    ? "🟢 Free Pass confermato"
    : "🟡 Bonifico in attesa";
  const fields = [
    ["Stato", free ? "BIGLIETTO CONFERMATO" : "IN ATTESA DI ACCREDITO"],
    ["Record ID", cleanValue(order?.orderId || order?.id, "Non disponibile", 100)],
    ["Nome", customerName(customer)],
    ["Email", cleanValue(customer?.email)],
    ["Telefono", cleanValue(customer?.phone)],
    ["Referral", cleanValue(customer?.referral)],
    ["Piano", cleanValue(order?.plan?.name || order?.planName || order?.planId)],
    ["Importo", ticketAmount(order, free)],
    ["Coupon", couponLabel(order)],
    ["Ticket URL", cleanValue(shareUrl, "Non disponibile", 800)],
  ];
  return slackMessage(title, fields);
}

export function buildPaidTicketSlackMessage(order, customer, shareUrl) {
  const fields = [
    ["Stato", "PAGAMENTO CONFERMATO"],
    ["Record ID", cleanValue(order?.orderId || order?.id, "Non disponibile", 100)],
    ["Nome", customerName(customer)],
    ["Email", cleanValue(customer?.email)],
    ["Telefono", cleanValue(customer?.phone)],
    ["Referral", cleanValue(customer?.referral)],
    ["Piano", cleanValue(order?.plan?.name || order?.planName || order?.planId)],
    ["Importo", ticketAmount(order, false)],
    ["Coupon", couponLabel(order)],
    ["Metodo", "Stripe"],
    ["Ticket URL", cleanValue(shareUrl, "Non disponibile", 800)],
  ];
  return slackMessage("🟢 Pagamento Stripe confermato", fields);
}

export function hasSlackNotificationConfig() {
  return [process.env.SLACK_BOT_TOKEN, process.env.SLACK_CHANNEL_ID]
    .some((value) => String(value || "").trim().length > 0);
}

function getSlackConfig() {
  const token = String(process.env.SLACK_BOT_TOKEN || "").trim();
  const channel = String(process.env.SLACK_CHANNEL_ID || "").trim();

  if (
    !token ||
    !channel ||
    !VALID_SLACK_BOT_TOKEN.test(token) ||
    !VALID_SLACK_CHANNEL_ID.test(channel)
  ) {
    throw new SlackNotificationError(
      503,
      "SLACK_NOT_CONFIGURED",
      "La notifica Slack non è configurata correttamente.",
    );
  }

  return { token, channel };
}

function validateMessage(message) {
  if (
    !message ||
    typeof message !== "object" ||
    typeof message.text !== "string" ||
    !message.text.trim() ||
    message.text.length > 4_000 ||
    !Array.isArray(message.blocks) ||
    message.blocks.length === 0 ||
    message.blocks.length > 50
  ) {
    throw new SlackNotificationError(
      500,
      "SLACK_INVALID_MESSAGE",
      "La notifica Slack non è valida.",
    );
  }
}

function slackUnavailable() {
  return new SlackNotificationError(
    502,
    "SLACK_UNAVAILABLE",
    "La notifica Slack non è disponibile. Riprova tra poco.",
  );
}

export async function sendSlackNotification(message) {
  const config = getSlackConfig();
  validateMessage(message);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  timeout.unref?.();

  let response;
  let payload;
  try {
    response = await fetch(SLACK_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: config.channel,
        text: message.text,
        blocks: message.blocks,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    payload = await response.json();
  } catch {
    throw slackUnavailable();
  } finally {
    clearTimeout(timeout);
  }

  if (
    !response.ok ||
    payload?.ok !== true ||
    payload?.channel !== config.channel ||
    typeof payload?.ts !== "string" ||
    !payload.ts.trim()
  ) {
    throw slackUnavailable();
  }

  return { channel: payload.channel, ts: payload.ts };
}
