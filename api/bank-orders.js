import {
  assertExpectedPricingStage,
  assertPlanAvailability,
  getInventorySnapshot,
  getPlan,
  getQueryParam,
  validateCustomer,
} from "./paypal/_shared.js";
import { applyCouponToPlan } from "./_coupons.js";
import {
  BANK_DETAILS,
  FunnelError,
  PUBLIC_PLAN_IDS,
  assertTrustedJsonRequest,
  createBankOrderToken,
  createRecordId,
  createTicketShareToken,
  escapeHtml,
  getIdempotencyKey,
  methodNotAllowed,
  readJsonBody,
  safeErrorResponse,
  sendResendEmail,
  sendJson,
  verifyBankOrderToken,
} from "./_funnel.js";
import { syncTicketToGoogleSheets } from "./_google-sheets.js";
import {
  buildTicketSlackMessage,
  hasSlackNotificationConfig,
  sendSlackNotification,
} from "./_slack.js";

const PUBLIC_SITE_ORIGIN = "https://www.tiranaoffline.com";
const EVENT_CONTACT_EMAIL = "evento@tiranaoffline.com";
const WHATSAPP_GROUP_URL =
  "https://chat.whatsapp.com/INqwNswve0XB5PENoWuUX9?s=cl&p=i&ilr=0&amv=0";
const WHATSAPP_GROUP_IMAGE_URL =
  `${PUBLIC_SITE_ORIGIN}/tirana/assets/workshop-builder-pass-whatsapp.jpg`;
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

function assertNoClientPricing(body) {
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

function bankReference(orderId) {
  return `TIRANA OFFLINE ${orderId}`;
}

function isFreePlan(plan) {
  return plan?.price === "0.00";
}

function couponPricingFields(plan) {
  if (!plan.coupon) return [["Importo", plan.priceFormatted]];
  return [
    ["Prezzo originale", plan.originalPriceFormatted],
    ["Coupon", `${plan.coupon.code} (-${plan.coupon.discountPercent}%)`],
    ["Sconto", plan.discountAmountFormatted],
    ["Importo finale", plan.priceFormatted],
  ];
}

function couponTextLines(plan) {
  if (!plan.coupon) return [];
  return [
    `Coupon: ${plan.coupon.code} (-${plan.coupon.discountPercent}%)`,
    `Prezzo originale: ${plan.originalPriceFormatted}`,
    `Sconto: ${plan.discountAmountFormatted}`,
  ];
}

function orderFields(order, customer) {
  if (isFreePlan(order.plan)) {
    return [
      ["Record", order.orderId],
      ["Stato", "BIGLIETTO CONFERMATO"],
      ["Pagamento", "NON RICHIESTO"],
      ["Registrazione", order.registrationId],
      ["Piano", order.plan.name],
      ...couponPricingFields(order.plan),
      ["Nome", `${customer.firstName} ${customer.lastName}`],
      ["Email", customer.email],
      ["Telefono", customer.phone],
      ["Referral", customer.referral || "Non indicato"],
    ];
  }
  return [
    ["Record", order.orderId],
    ["Stato", "IN ATTESA DI ACCREDITO"],
    ["Registrazione", order.registrationId],
    ["Piano", order.plan.name],
    ...couponPricingFields(order.plan),
    ["Causale", order.reference],
    ["Nome", `${customer.firstName} ${customer.lastName}`],
    ["Email", customer.email],
    ["Telefono", customer.phone],
    ["Referral", customer.referral || "Non indicato"],
    ["Ragione sociale", customer.companyName],
    ["Indirizzo", customer.address],
    ["Città", customer.city],
    ["Paese", customer.countryCode],
    ["Codice postale", customer.postalCode],
    ["Partita IVA o codice fiscale", customer.taxId],
  ];
}

function fieldsAsText(fields) {
  return fields.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function fieldsAsHtml(fields) {
  return `<table>${fields
    .map(
      ([label, value]) =>
        `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

async function notifyInternal(order, customer, idempotencyKey) {
  const fields = orderFields(order, customer);
  const free = isFreePlan(order.plan);
  return sendResendEmail({
    subject: free
      ? `[TIRANA][FREE PASS] ${order.orderId} · ${order.plan.name}`
      : `[TIRANA][BONIFICO] ${order.orderId} · ${order.plan.name}`,
    text: free
      ? `Nuovo Free Pass confermato.\n\n${fieldsAsText(fields)}`
      : `Nuovo biglietto tramite bonifico.\n\n${fieldsAsText(fields)}`,
    html: free
      ? `<p><strong>Nuovo Free Pass confermato.</strong></p>${fieldsAsHtml(fields)}`
      : `<p><strong>Nuovo biglietto tramite bonifico.</strong></p>${fieldsAsHtml(fields)}`,
    tags: [
      { name: "event", value: "tirana-offline" },
      { name: "record_type", value: free ? "free-ticket" : "bank-order" },
      { name: "payment_status", value: free ? "confirmed-free" : "pending" },
    ],
    headers: {
      "X-Tirana-Record-Type": free ? "free-ticket" : "bank-order",
      "X-Tirana-Record-Id": order.orderId,
      "X-Tirana-Registration-Id": order.registrationId,
      "X-Tirana-Payment-Status": free ? "confirmed-free" : "pending",
    },
    idempotencyKey: free
      ? `tirana-free-internal-${idempotencyKey}`
      : `tirana-bank-internal-${idempotencyKey}`,
  });
}

function publicTicketDisplayName(customer) {
  const initial = Array.from(String(customer.lastName || "").trim())[0] || "";
  return `${customer.firstName}${initial ? ` ${initial.toUpperCase()}.` : ""}`;
}

function planAccessLabel(plan) {
  const participants = Number(plan.participantCount) || 1;
  const builderSlots = Number(plan.builderSlots) || 0;
  const people = participants === 1 ? "1 partecipante" : `${participants} partecipanti`;
  const access = builderSlots === 0
    ? "Workshop Pass"
    : builderSlots === 1
      ? "1 posto Live Building"
      : `${builderSlots} posti Live Building`;
  return `${people} · ${access}`;
}

function publicTicketUrl(shareToken) {
  return `${PUBLIC_SITE_ORIGIN}/ticket?token=${encodeURIComponent(shareToken)}`;
}

function ticketShareLinks(shareUrl) {
  const copy = `Io ci sarò a Tirana Offline Mode, 4 e 5 settembre 2026. ${shareUrl}`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(copy)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
  };
}

function freeCustomerEmailText(order, customer, shareUrl) {
  const shareLinks = ticketShareLinks(shareUrl);
  return [
    "TIRANA OFFLINE MODE",
    "4 e 5 settembre 2026 · Piramide di Tirana, Albania",
    "",
    `Ciao ${customer.firstName},`,
    "",
    "il tuo Free Pass per il Workshop di Tirana Offline Mode è confermato.",
    "",
    "STATO: BIGLIETTO CONFERMATO",
    "PAGAMENTO: NON RICHIESTO",
    "",
    "IL TUO TICKET",
    `Nominativo: ${customer.firstName} ${customer.lastName}`,
    `Ticket: ${order.plan.name}`,
    `Accessi: ${planAccessLabel(order.plan)}`,
    `Codice biglietto: ${order.orderId}`,
    ...couponTextLines(order.plan),
    "Importo finale: GRATUITO",
    `Apri il biglietto personalizzato: ${shareUrl}`,
    `Condividi su WhatsApp: ${shareLinks.whatsapp}`,
    `Condividi su LinkedIn: ${shareLinks.linkedin}`,
    "",
    "Il tuo posto per le sessioni del Workshop mattutino è confermato. Non devi effettuare alcun pagamento.",
    "",
    "GRUPPO WHATSAPP WORKSHOP + BUILDER PASS",
    "Iscriviti al gruppo dell’evento:",
    WHATSAPP_GROUP_URL,
    "",
    `Contatta l’assistenza: ${EVENT_CONTACT_EMAIL}`,
    "WhatsApp: https://wa.me/393759916344",
    "",
    "A presto a Tirana,",
    "Team Scalers",
  ].join("\n");
}

function customerEmailText(order, customer, shareUrl) {
  const shareLinks = ticketShareLinks(shareUrl);
  return [
    "TIRANA OFFLINE MODE",
    "4 e 5 settembre 2026 · Piramide di Tirana, Albania",
    "",
    `Ciao ${customer.firstName},`,
    "",
    "il tuo biglietto per Tirana Offline Mode è stato registrato.",
    "",
    "STATO: IN ATTESA DI ACCREDITO",
    "",
    "IL TUO TICKET",
    `Nominativo: ${customer.firstName} ${customer.lastName}`,
    `Ticket: ${order.plan.name}`,
    `Accessi: ${planAccessLabel(order.plan)}`,
    `Codice biglietto: ${order.orderId}`,
    ...couponTextLines(order.plan),
    `${order.plan.coupon ? "Importo finale" : "Importo"}: ${order.plan.priceFormatted}`,
    `Apri il biglietto personalizzato: ${shareUrl}`,
    `Condividi su WhatsApp: ${shareLinks.whatsapp}`,
    `Condividi su LinkedIn: ${shareLinks.linkedin}`,
    "",
    "GRUPPO WHATSAPP WORKSHOP + BUILDER PASS",
    "Iscriviti al gruppo dell’evento:",
    WHATSAPP_GROUP_URL,
    "",
    "PER COMPLETARE IL BIGLIETTO",
    "Effettua il bonifico utilizzando esattamente i dati riportati qui sotto.",
    "",
    `Beneficiario: ${BANK_DETAILS.beneficiary}`,
    `Indirizzo: ${BANK_DETAILS.address}`,
    `Banca: ${BANK_DETAILS.bank}`,
    `IBAN: ${BANK_DETAILS.iban}`,
    `SWIFT / BIC: ${BANK_DETAILS.swift}`,
    ...couponTextLines(order.plan),
    `${order.plan.coupon ? "Importo finale" : "Importo"}: ${order.plan.priceFormatted}`,
    "CAUSALE OBBLIGATORIA DA INSERIRE NEL BONIFICO:",
    order.reference,
    "",
    "Inserisci la causale senza modificarla. Ci permette di associare il pagamento al tuo biglietto.",
    "",
    "Il ticket non è ancora confermato. Riceverai una nuova email non appena avremo verificato l’accredito.",
    "",
    `Contatta l’assistenza: ${EVENT_CONTACT_EMAIL}`,
    "WhatsApp: https://wa.me/393759916344",
    "",
    "A presto a Tirana,",
    "Team Scalers",
  ].join("\n");
}

function customerEmailRow(label, value, options = {}) {
  const background = options.highlight ? "#171126" : "#100D17";
  const valueFont = options.mono
    ? '"Courier New", Courier, monospace'
    : '"Trebuchet MS", Arial, sans-serif';
  return `<tr><td style="padding:15px 16px;border-bottom:1px solid #2C2238;background:${background};color:#BBA0FF;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;vertical-align:top;width:34%;">${escapeHtml(label)}</td><td style="padding:15px 16px;border-bottom:1px solid #2C2238;background:${background};color:#F8F6FF;font-family:${valueFont};font-size:14px;font-weight:700;line-height:1.5;overflow-wrap:anywhere;word-break:break-word;word-wrap:break-word;vertical-align:top;">${escapeHtml(value)}</td></tr>`;
}

function freeCustomerEmailHtml(order, customer, shareUrl) {
  const firstName = escapeHtml(customer.firstName);
  const fullName = escapeHtml(`${customer.firstName} ${customer.lastName}`);
  const planName = escapeHtml(order.plan.name);
  const accessLabel = escapeHtml(planAccessLabel(order.plan));
  const orderId = escapeHtml(order.orderId);
  const safeShareUrl = escapeHtml(shareUrl);
  const shareLinks = ticketShareLinks(shareUrl);
  const whatsappShareUrl = escapeHtml(shareLinks.whatsapp);
  const linkedinShareUrl = escapeHtml(shareLinks.linkedin);
  const whatsappGroupUrl = escapeHtml(WHATSAPP_GROUP_URL);
  const whatsappGroupImageUrl = escapeHtml(WHATSAPP_GROUP_IMAGE_URL);
  const eventContactEmail = escapeHtml(EVENT_CONTACT_EMAIL);
  const couponLabel = escapeHtml(
    `${order.plan.coupon?.code || "SOLOFREEPASS"} · ACCESSO GRATUITO`,
  );

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Tirana Offline Mode</title>
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    @media only screen and (max-width: 600px) {
      .email-shell { width: 100% !important; }
      .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
      .email-title { font-size: 32px !important; line-height: 1.04 !important; }
      .email-meta { display: block !important; width: 100% !important; text-align: left !important; padding-top: 12px !important; }
      .email-ticket-title { font-size: 30px !important; }
      .email-share-button { display: block !important; margin: 0 0 9px !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#050507;color:#F8F6FF;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${firstName}, il tuo Free Pass per il Workshop è confermato.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#050507;border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 12px;">
      <table class="email-shell" role="article" aria-roledescription="email" aria-label="Free Pass confermato per Tirana Offline Mode" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#100D17;border:1px solid #2C2238;border-collapse:collapse;box-shadow:0 24px 70px rgba(0,0,0,.45);">
        <tr><td style="height:7px;background:#9B6CFF;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="email-pad" style="padding:26px 30px 34px;background:#0B0910;color:#F8F6FF;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;font-weight:900;letter-spacing:.01em;vertical-align:middle;"><span style="display:inline-block;margin-right:9px;padding:5px 9px;border-radius:999px;background:#9B6CFF;color:#050507;">+</span>SCALERS / OFFLINE MODE</td>
              <td class="email-meta" align="right" style="font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;letter-spacing:.1em;vertical-align:middle;color:#AAA4B7;">TIRANA / 04-05.09.2026</td>
            </tr>
          </table>
          <div style="margin-top:32px;"><span style="display:inline-block;padding:8px 11px;border:1px solid #9B6CFF;background:#171126;color:#D8C9FF;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;">Free Pass confermato</span></div>
          <h1 class="email-title" style="margin:20px 0 14px;color:#F8F6FF;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:40px;line-height:1;letter-spacing:-.045em;text-transform:uppercase;">Il tuo posto è confermato.<br><span style="color:#9B6CFF;">Ci vediamo a Tirana.</span></h1>
          <p style="margin:0;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:15px;line-height:1.6;">4 e 5 settembre 2026<br><strong style="color:#F8F6FF;">Piramide di Tirana, Albania</strong></p>
        </td></tr>
        <tr><td class="email-pad" style="padding:30px 30px 12px;background:#100D17;color:#F8F6FF;">
          <p style="margin:0 0 12px;font-family:'Trebuchet MS',Arial,sans-serif;font-size:17px;line-height:1.55;">Ciao ${firstName},</p>
          <p style="margin:0 0 24px;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:15px;line-height:1.65;">il tuo accesso gratuito alle sessioni mattutine del <strong style="color:#F8F6FF;">Workshop di Tirana Offline Mode</strong> è confermato. Non devi effettuare alcun pagamento.</p>

          <table data-email-ticket="personalized" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F8F6FF;border:6px solid #17141C;border-collapse:separate;color:#09070D;box-shadow:0 24px 70px rgba(0,0,0,.35);">
            <tr><td style="padding:24px 24px 12px;background:#F8F6FF;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;color:#09070D;">
                <tr>
                  <td style="font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:19px;font-weight:900;letter-spacing:-.04em;text-transform:uppercase;">SCALERS+</td>
                  <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;line-height:1.35;letter-spacing:.05em;">4 + 5 SETTEMBRE<br>2026 · TIRANA</td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:36px 24px 18px;background:#FAF7FF;">
              <span style="display:block;margin-bottom:16px;color:#30243F;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Due giorni, una build-challenge</span>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
                <td style="padding:10px 11px;background:#09070D;box-shadow:5px 5px 0 #7C3CFF;color:#FFFFFF;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:24px;font-weight:900;line-height:1;">AI</td>
                <td class="email-ticket-title" style="padding-left:13px;color:#09070D;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:38px;font-weight:900;line-height:.9;letter-spacing:-.06em;text-transform:uppercase;">BOOTCAMP</td>
              </tr></table>
              <span style="display:inline-block;margin-top:17px;padding:7px 10px;border:1px solid #30243F;border-radius:999px;background:#FFFFFF;color:#120B1C;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;letter-spacing:.12em;">●&nbsp; offline-mode</span>
              <p style="margin:23px 0 0;color:#17101F;font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.45;">AI, ADV, organico, vendita e contenuti dentro un sistema operativo da portare nel tuo business.</p>
            </td></tr>
            <tr><td style="height:38px;padding:0 24px;background:#FAF7FF;color:#09070D;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:900;letter-spacing:2px;white-space:nowrap;overflow:hidden;">|||| ||| |||||| || ||||| ||| |||||| ||||</td></tr>
            <tr><td style="padding:0 18px 18px;background:#D9C6FF;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#FFFFFF;border:1px solid #9B6CFF;border-collapse:collapse;">
                <tr><td style="padding:16px 17px;color:#09070D;">
                  <strong style="display:block;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:18px;line-height:1.15;text-transform:uppercase;">${fullName}</strong>
                  <strong style="display:block;margin-top:8px;font-family:'Trebuchet MS',Arial,sans-serif;font-size:15px;line-height:1.3;">${planName}</strong>
                  <span style="display:block;margin-top:7px;color:#251535;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;line-height:1.4;letter-spacing:.04em;text-transform:uppercase;">${accessLabel}</span>
                  <span style="display:block;margin-top:9px;color:#5A4A68;font-family:'Courier New',Courier,monospace;font-size:8px;font-weight:700;line-height:1.4;">${couponLabel} · BIGLIETTO CONFERMATO</span>
                </td><td width="90" align="center" style="padding:16px 12px;border-left:1px solid #D8C9FF;color:#09070D;font-family:'Courier New',Courier,monospace;">
                  <strong style="display:block;font-size:13px;">GRATUITO</strong>
                  <span style="display:block;margin-top:8px;font-size:8px;line-height:1.35;">${orderId}</span>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;border-collapse:collapse;"><tr><td>
            <a class="email-share-button" data-share="open" href="${safeShareUrl}" style="display:inline-block;margin:0 7px 9px 0;padding:14px 17px;background:#9B6CFF;border:1px solid #9B6CFF;color:#050507;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.04em;text-decoration:none;">APRI IL BIGLIETTO ↗</a>
            <a class="email-share-button" data-share="whatsapp" href="${whatsappShareUrl}" style="display:inline-block;margin:0 7px 9px 0;padding:14px 17px;background:#F8F6FF;border:1px solid #D8C9FF;color:#09070D;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.04em;text-decoration:none;">WHATSAPP ↗</a>
            <a class="email-share-button" data-share="linkedin" href="${linkedinShareUrl}" style="display:inline-block;margin:0 0 9px;padding:14px 17px;background:#171126;border:1px solid #9B6CFF;color:#D8C9FF;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.04em;text-decoration:none;">LINKEDIN ↗</a>
          </td></tr></table>

          <table data-email-group="workshop-builder-pass" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:24px;border:1px solid #493766;background:#171126;border-collapse:collapse;">
            <tr><td style="padding:10px;background:#FFFDF5;"><a href="${whatsappGroupUrl}" style="display:block;text-decoration:none;"><img src="${whatsappGroupImageUrl}" width="568" alt="Anteprima del gruppo WhatsApp Workshop + Builder PASS" style="display:block;width:100%;max-width:568px;height:auto;border:0;background:#FFFDF5;" /></a></td></tr>
            <tr><td style="padding:22px 20px 24px;background:#171126;color:#F8F6FF;">
              <span style="display:block;margin-bottom:10px;color:#C4B5FD;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">Community privata / Tirana 2026</span>
              <h2 style="margin:0 0 12px;color:#F8F6FF;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:24px;line-height:1.08;letter-spacing:-.03em;text-transform:uppercase;">Iscriviti al gruppo dell’evento Workshop + Builder PASS</h2>
              <p style="margin:0 0 18px;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;line-height:1.6;">Ricevi aggiornamenti organizzativi e comunicazioni dedicate ai partecipanti.</p>
              <a data-group-cta="whatsapp" href="${whatsappGroupUrl}" style="display:inline-block;padding:14px 18px;background:#C4B5FD;border:1px solid #C4B5FD;color:#050507;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.05em;text-decoration:none;">ENTRA NEL GRUPPO ↗</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td class="email-pad" style="padding:24px 30px 34px;background:#100D17;color:#F8F6FF;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#171126;border:1px solid #7C3CFF;border-collapse:collapse;">
            <tr><td style="padding:18px;color:#F8F6FF;font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;line-height:1.6;"><strong style="display:block;margin-bottom:5px;color:#D8C9FF;">Pagamento non richiesto.</strong>Il tuo Free Pass è già confermato e pronto da usare.</td></tr>
          </table>
          <p style="margin:18px 0 0;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:13px;line-height:1.6;">Contatta l’assistenza: <a href="mailto:${eventContactEmail}" style="color:#D8C9FF;font-weight:700;text-decoration:underline;">${eventContactEmail}</a></p>
        </td></tr>
        <tr><td class="email-pad" style="padding:24px 30px;background:#050507;border-top:1px solid #2C2238;color:#F8F6FF;">
          <p style="margin:0;font-family:'Trebuchet MS',Arial,sans-serif;font-size:13px;line-height:1.5;"><strong>A presto a Tirana,<br>Team Scalers</strong></p>
          <p style="margin:16px 0 0;color:#81798C;font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.6;"><a href="https://www.tiranaoffline.com" style="color:#D8C9FF;text-decoration:none;">TIRANAOFFLINE.COM</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://www.tiranaoffline.com/privacy" style="color:#D8C9FF;text-decoration:none;">PRIVACY</a><br>${orderId}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function customerEmailHtml(order, customer, shareUrl) {
  const firstName = escapeHtml(customer.firstName);
  const fullName = escapeHtml(`${customer.firstName} ${customer.lastName}`);
  const planName = escapeHtml(order.plan.name);
  const accessLabel = escapeHtml(planAccessLabel(order.plan));
  const orderId = escapeHtml(order.orderId);
  const price = escapeHtml(order.plan.priceFormatted);
  const reference = escapeHtml(order.reference);
  const safeShareUrl = escapeHtml(shareUrl);
  const shareLinks = ticketShareLinks(shareUrl);
  const whatsappShareUrl = escapeHtml(shareLinks.whatsapp);
  const linkedinShareUrl = escapeHtml(shareLinks.linkedin);
  const whatsappGroupUrl = escapeHtml(WHATSAPP_GROUP_URL);
  const whatsappGroupImageUrl = escapeHtml(WHATSAPP_GROUP_IMAGE_URL);
  const eventContactEmail = escapeHtml(EVENT_CONTACT_EMAIL);
  const couponRows = order.plan.coupon
    ? [
        customerEmailRow(
          "Coupon",
          `${order.plan.coupon.code} (-${order.plan.coupon.discountPercent}%)`,
          { highlight: true },
        ),
        customerEmailRow("Prezzo originale", order.plan.originalPriceFormatted),
        customerEmailRow("Sconto", order.plan.discountAmountFormatted),
      ]
    : [];
  const bankRows = [
    customerEmailRow("Beneficiario", BANK_DETAILS.beneficiary),
    customerEmailRow("Indirizzo", BANK_DETAILS.address),
    customerEmailRow("Banca", BANK_DETAILS.bank),
    customerEmailRow("IBAN", BANK_DETAILS.iban, { mono: true }),
    customerEmailRow("SWIFT / BIC", BANK_DETAILS.swift, { mono: true }),
    ...couponRows,
    customerEmailRow(order.plan.coupon ? "Importo finale" : "Importo", order.plan.priceFormatted),
  ].join("");

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Tirana Offline Mode</title>
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    @media only screen and (max-width: 600px) {
      .email-shell { width: 100% !important; }
      .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
      .email-title { font-size: 32px !important; line-height: 1.04 !important; }
      .email-meta { display: block !important; width: 100% !important; text-align: left !important; padding-top: 12px !important; }
      .email-ticket-title { font-size: 30px !important; }
      .email-share-button { display: block !important; margin: 0 0 9px !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#050507;color:#F8F6FF;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${firstName}, il tuo ticket personalizzato è pronto. Trovi anche importo, IBAN e causale esatta.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#050507;border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 12px;">
      <table class="email-shell" role="article" aria-roledescription="email" aria-label="Conferma biglietto Tirana Offline Mode" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#100D17;border:1px solid #2C2238;border-collapse:collapse;box-shadow:0 24px 70px rgba(0,0,0,.45);">
        <tr><td style="height:7px;background:#9B6CFF;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="email-pad" style="padding:26px 30px 34px;background:#0B0910;color:#F8F6FF;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;font-weight:900;letter-spacing:.01em;vertical-align:middle;"><span style="display:inline-block;margin-right:9px;padding:5px 9px;border-radius:999px;background:#9B6CFF;color:#050507;">+</span>SCALERS / OFFLINE MODE</td>
              <td class="email-meta" align="right" style="font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;letter-spacing:.1em;vertical-align:middle;color:#AAA4B7;">TIRANA / 04-05.09.2026</td>
            </tr>
          </table>
          <div style="margin-top:32px;"><span style="display:inline-block;padding:8px 11px;border:1px solid #9B6CFF;background:#171126;color:#D8C9FF;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;">In attesa di accredito</span></div>
          <h1 class="email-title" style="margin:20px 0 14px;color:#F8F6FF;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:40px;line-height:1;letter-spacing:-.045em;text-transform:uppercase;">Biglietto registrato.<br><span style="color:#9B6CFF;">Ci vediamo a Tirana.</span></h1>
          <p style="margin:0;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:15px;line-height:1.6;">4 e 5 settembre 2026<br><strong style="color:#F8F6FF;">Piramide di Tirana, Albania</strong></p>
        </td></tr>
        <tr><td class="email-pad" style="padding:30px 30px 12px;background:#100D17;color:#F8F6FF;">
          <p style="margin:0 0 12px;font-family:'Trebuchet MS',Arial,sans-serif;font-size:17px;line-height:1.55;">Ciao ${firstName},</p>
          <p style="margin:0 0 24px;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:15px;line-height:1.65;">abbiamo registrato il tuo biglietto per <strong style="color:#F8F6FF;">Tirana Offline Mode</strong>. Il pass qui sotto è personalizzato e pronto da aprire o condividere.</p>

          <table data-email-ticket="personalized" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F8F6FF;border:6px solid #17141C;border-collapse:separate;color:#09070D;box-shadow:0 24px 70px rgba(0,0,0,.35);">
            <tr><td style="padding:24px 24px 12px;background:#F8F6FF;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;color:#09070D;">
                <tr>
                  <td style="font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:19px;font-weight:900;letter-spacing:-.04em;text-transform:uppercase;">SCALERS+</td>
                  <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;line-height:1.35;letter-spacing:.05em;">4 + 5 SETTEMBRE<br>2026 · TIRANA</td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:36px 24px 18px;background:#FAF7FF;">
              <span style="display:block;margin-bottom:16px;color:#30243F;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Due giorni, una build-challenge</span>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
                <td style="padding:10px 11px;background:#09070D;box-shadow:5px 5px 0 #7C3CFF;color:#FFFFFF;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:24px;font-weight:900;line-height:1;">AI</td>
                <td class="email-ticket-title" style="padding-left:13px;color:#09070D;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:38px;font-weight:900;line-height:.9;letter-spacing:-.06em;text-transform:uppercase;">BOOTCAMP</td>
              </tr></table>
              <span style="display:inline-block;margin-top:17px;padding:7px 10px;border:1px solid #30243F;border-radius:999px;background:#FFFFFF;color:#120B1C;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;letter-spacing:.12em;">●&nbsp; offline-mode</span>
              <p style="margin:23px 0 0;color:#17101F;font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.45;">AI, ADV, organico, vendita e contenuti dentro un sistema operativo da portare nel tuo business.</p>
            </td></tr>
            <tr><td style="height:38px;padding:0 24px;background:#FAF7FF;color:#09070D;font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:900;letter-spacing:2px;white-space:nowrap;overflow:hidden;">|||| ||| |||||| || ||||| ||| |||||| ||||</td></tr>
            <tr><td style="padding:0 18px 18px;background:#D9C6FF;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#FFFFFF;border:1px solid #9B6CFF;border-collapse:collapse;">
                <tr><td style="padding:16px 17px;color:#09070D;">
                  <strong style="display:block;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:18px;line-height:1.15;text-transform:uppercase;">${fullName}</strong>
                  <strong style="display:block;margin-top:8px;font-family:'Trebuchet MS',Arial,sans-serif;font-size:15px;line-height:1.3;">${planName}</strong>
                  <span style="display:block;margin-top:7px;color:#251535;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:700;line-height:1.4;letter-spacing:.04em;text-transform:uppercase;">${accessLabel}</span>
                  <span style="display:block;margin-top:9px;color:#5A4A68;font-family:'Courier New',Courier,monospace;font-size:8px;font-weight:700;line-height:1.4;">TICKET REGISTRATO · CONFERMA DOPO ACCREDITO</span>
                </td><td width="90" align="center" style="padding:16px 12px;border-left:1px solid #D8C9FF;color:#09070D;font-family:'Courier New',Courier,monospace;">
                  <strong style="display:block;font-size:13px;">${price}</strong>
                  <span style="display:block;margin-top:8px;font-size:8px;line-height:1.35;">${orderId}</span>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;border-collapse:collapse;"><tr><td>
            <a class="email-share-button" data-share="open" href="${safeShareUrl}" style="display:inline-block;margin:0 7px 9px 0;padding:14px 17px;background:#9B6CFF;border:1px solid #9B6CFF;color:#050507;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.04em;text-decoration:none;">APRI IL BIGLIETTO ↗</a>
            <a class="email-share-button" data-share="whatsapp" href="${whatsappShareUrl}" style="display:inline-block;margin:0 7px 9px 0;padding:14px 17px;background:#F8F6FF;border:1px solid #D8C9FF;color:#09070D;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.04em;text-decoration:none;">WHATSAPP ↗</a>
            <a class="email-share-button" data-share="linkedin" href="${linkedinShareUrl}" style="display:inline-block;margin:0 0 9px;padding:14px 17px;background:#171126;border:1px solid #9B6CFF;color:#D8C9FF;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.04em;text-decoration:none;">LINKEDIN ↗</a>
          </td></tr></table>
          <p style="margin:4px 0 0;color:#81798C;font-family:'Trebuchet MS',Arial,sans-serif;font-size:12px;line-height:1.55;">Instagram non permette la condivisione diretta da email: apri il biglietto, fai uno screenshot e pubblicalo nella tua storia.</p>

          <table data-email-group="workshop-builder-pass" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:24px;border:1px solid #493766;background:#171126;border-collapse:collapse;">
            <tr><td style="padding:10px;background:#FFFDF5;">
              <a href="${whatsappGroupUrl}" style="display:block;text-decoration:none;">
                <img src="${whatsappGroupImageUrl}" width="568" alt="Anteprima del gruppo WhatsApp Workshop + Builder PASS" style="display:block;width:100%;max-width:568px;height:auto;border:0;background:#FFFDF5;" />
              </a>
            </td></tr>
            <tr><td style="padding:22px 20px 24px;background:#171126;color:#F8F6FF;">
              <span style="display:block;margin-bottom:10px;color:#C4B5FD;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">Community privata / Tirana 2026</span>
              <h2 style="margin:0 0 12px;color:#F8F6FF;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:24px;line-height:1.08;letter-spacing:-.03em;text-transform:uppercase;">Iscriviti al gruppo dell’evento Workshop + Builder PASS</h2>
              <p style="margin:0 0 18px;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;line-height:1.6;">Ricevi aggiornamenti organizzativi e comunicazioni dedicate ai partecipanti.</p>
              <a data-group-cta="whatsapp" href="${whatsappGroupUrl}" style="display:inline-block;padding:14px 18px;background:#C4B5FD;border:1px solid #C4B5FD;color:#050507;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.05em;text-decoration:none;">ENTRA NEL GRUPPO ↗</a>
              <p style="margin:14px 0 0;color:#81798C;font-family:'Courier New',Courier,monospace;font-size:9px;line-height:1.55;word-break:break-all;"><a href="${whatsappGroupUrl}" style="color:#C4B5FD;text-decoration:underline;">${whatsappGroupUrl}</a></p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td class="email-pad" style="padding:24px 30px 10px;background:#100D17;color:#F8F6FF;">
          <p style="margin:0 0 10px;color:#BBA0FF;font-family:'Courier New',Courier,monospace;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">02 / Coordinate bonifico</p>
          <h2 style="margin:0 0 15px;font-family:'Arial Black','Trebuchet MS',Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-.025em;text-transform:uppercase;">Completa il pagamento</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #2C2238;border-collapse:collapse;">${bankRows}</table>
        </td></tr>
        <tr><td class="email-pad" style="padding:16px 30px 0;background:#100D17;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#9B6CFF;border:1px solid #9B6CFF;border-collapse:collapse;">
            <tr><td style="padding:19px;color:#050507;font-family:'Trebuchet MS',Arial,sans-serif;">
              <span style="display:block;margin-bottom:9px;font-family:'Courier New',Courier,monospace;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;">Causale obbligatoria da inserire nel bonifico</span>
              <strong style="display:block;font-family:'Courier New',Courier,monospace;font-size:17px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word;word-wrap:break-word;">${reference}</strong>
            </td></tr>
          </table>
        </td></tr>
        <tr><td class="email-pad" style="padding:12px 30px 10px;background:#100D17;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#171126;border:1px solid #7C3CFF;border-collapse:collapse;">
            <tr><td style="padding:16px;color:#F8F6FF;font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;line-height:1.55;"><strong style="display:block;margin-bottom:4px;color:#D8C9FF;">Usa la causale esatta.</strong>Non modificarla: ci permette di associare il pagamento al tuo biglietto.</td></tr>
          </table>
        </td></tr>
        <tr><td class="email-pad" style="padding:18px 30px 34px;background:#100D17;color:#F8F6FF;">
          <p style="margin:0 0 20px;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:14px;line-height:1.65;"><strong style="color:#F8F6FF;">Il biglietto sarà confermato dopo la verifica dell’accredito.</strong> Riceverai una nuova email quando il pagamento sarà stato associato al biglietto.</p>
          <a href="https://wa.me/393759916344" style="display:inline-block;padding:14px 18px;background:#D8C9FF;border:1px solid #D8C9FF;color:#050507;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:900;letter-spacing:.05em;text-decoration:none;">ASSISTENZA WHATSAPP ↗</a>
          <p style="margin:18px 0 0;color:#AAA4B7;font-family:'Trebuchet MS',Arial,sans-serif;font-size:13px;line-height:1.6;">Contatta l’assistenza: <a href="mailto:${eventContactEmail}" style="color:#D8C9FF;font-weight:700;text-decoration:underline;">${eventContactEmail}</a></p>
        </td></tr>
        <tr><td class="email-pad" style="padding:24px 30px;background:#050507;border-top:1px solid #2C2238;color:#F8F6FF;">
          <p style="margin:0;font-family:'Trebuchet MS',Arial,sans-serif;font-size:13px;line-height:1.5;"><strong>A presto a Tirana,<br>Team Scalers</strong></p>
          <p style="margin:16px 0 0;color:#81798C;font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.6;">Contatta l’assistenza: <a href="mailto:${eventContactEmail}" style="color:#D8C9FF;text-decoration:none;">${eventContactEmail}</a><br><a href="https://www.tiranaoffline.com" style="color:#D8C9FF;text-decoration:none;">TIRANAOFFLINE.COM</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="https://www.tiranaoffline.com/privacy" style="color:#D8C9FF;text-decoration:none;">PRIVACY</a><br>${orderId}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function notifyCustomer(order, customer, idempotencyKey, shareUrl) {
  const free = isFreePlan(order.plan);
  return sendResendEmail({
    to: [customer.email],
    subject: free
      ? "Tirana Offline Mode | Il tuo Free Pass è confermato"
      : "Tirana Offline Mode | Il tuo biglietto è registrato",
    text: free
      ? freeCustomerEmailText(order, customer, shareUrl)
      : customerEmailText(order, customer, shareUrl),
    html: free
      ? freeCustomerEmailHtml(order, customer, shareUrl)
      : customerEmailHtml(order, customer, shareUrl),
    tags: [
      { name: "event", value: "tirana-offline" },
      { name: "record_type", value: free ? "free-ticket" : "bank-instructions" },
    ],
    headers: {
      "X-Tirana-Record-Type": free ? "free-ticket" : "bank-instructions",
      "X-Tirana-Record-Id": order.orderId,
      "X-Tirana-Payment-Status": free ? "confirmed-free" : "pending",
    },
    idempotencyKey: free
      ? `tirana-free-customer-${idempotencyKey}`
      : `tirana-bank-customer-${idempotencyKey}`,
  });
}

function notifySlack(order, customer, shareUrl) {
  return sendSlackNotification(buildTicketSlackMessage(order, customer, shareUrl));
}

function notificationStatus(result, channel, orderId) {
  if (result.status === "fulfilled") return "sent";
  console.warn("[tirana] notifica biglietto rinviata", {
    recordId: orderId,
    channel,
    code: String(result.reason?.code || "NOTIFICATION_UNAVAILABLE"),
    status: Number(result.reason?.status) || 502,
  });
  return "deferred";
}

async function createBankOrder(req, res) {
  assertTrustedJsonRequest(req);
  const body = await readJsonBody(req);
  assertNoClientPricing(body);
  const planId = String(body?.planId || "").trim();
  if (!PUBLIC_PLAN_IDS.includes(planId)) {
    throw new FunnelError(400, "INVALID_PLAN", "Seleziona un piano valido.");
  }

  const inventory = getInventorySnapshot();
  const plan = applyCouponToPlan(
    getPlan(planId, { allowLegacy: true, inventory }),
    body?.couponCode,
  );
  assertExpectedPricingStage(plan, body.expectedPricingStage);
  assertPlanAvailability(plan, inventory);
  const free = isFreePlan(plan);
  const customer = validateCustomer(body.customer, { requireBilling: !free });
  const requestIdempotencyKey = getIdempotencyKey(
    req,
    `${plan.id}:${plan.coupon?.code || "standard"}:${customer.email}`,
  );
  const idempotencyKey = plan.coupon?.code
    ? createRecordId(
        "TIR-IDEM",
        `${requestIdempotencyKey}:${plan.coupon.code}`,
      )
    : requestIdempotencyKey;
  const registrationId = createRecordId(
    "TIR-REG",
    `${plan.id}:${customer.email}:${idempotencyKey}`,
  );
  const orderId = createRecordId(
    "TIR-ORD",
    `${registrationId}:${plan.id}:${idempotencyKey}`,
  );
  const order = {
    orderId,
    registrationId,
    plan,
    planId: plan.id,
    pricingStage: plan.pricingStage,
    price: plan.price,
    couponCode: plan.coupon?.code || "",
    status: free ? "CONFIRMED_FREE" : "PENDING_BANK_TRANSFER",
    reference: free ? "" : bankReference(orderId),
  };
  const token = createBankOrderToken(order);
  const shareToken = createTicketShareToken({
    displayName: publicTicketDisplayName(customer),
    planId: plan.id,
  });
  const shareUrl = publicTicketUrl(shareToken);

  await syncTicketToGoogleSheets(order, customer, shareUrl);
  const notificationJobs = [
    notifyInternal(order, customer, idempotencyKey),
    notifyCustomer(order, customer, idempotencyKey, shareUrl),
  ];
  if (hasSlackNotificationConfig()) {
    notificationJobs.push(notifySlack(order, customer, shareUrl));
  }
  const notificationResults = await Promise.allSettled(notificationJobs);
  const notifications = {
    internal: notificationStatus(notificationResults[0], "internal-email", orderId),
    customer: notificationStatus(notificationResults[1], "customer-email", orderId),
  };
  if (notificationResults[2]) {
    notificationStatus(notificationResults[2], "slack", orderId);
  }
  return sendJson(res, 201, {
    ok: true,
    orderId,
    status: order.status,
    token,
    shareToken,
    shareUrl,
    notifications,
    next: `/thank-you?payment=${free ? "free" : "bank"}&token=${encodeURIComponent(token)}&share=${encodeURIComponent(shareToken)}`,
  });
}

function getBankOrder(req, res) {
  const token = getQueryParam(req, "token").trim();
  const payload = verifyBankOrderToken(token);
  const plan = applyCouponToPlan(
    getPlan(payload.pid, { allowLegacy: true, stage: payload.stage }),
    payload.coupon,
    { allowInactive: true },
  );
  if (plan.price !== payload.price) {
    throw new FunnelError(409, "ORDER_MISMATCH", "I dati del biglietto non coincidono.");
  }
  const free = isFreePlan(plan);
  const response = {
    orderId: payload.oid,
    registrationId: payload.rid,
    status: free ? "CONFIRMED_FREE" : "PENDING_BANK_TRANSFER",
    plan,
  };
  if (!free) {
    response.bank = BANK_DETAILS;
    response.reference = `TIRANA OFFLINE ${payload.oid}`;
  }
  return sendJson(res, 200, response);
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") return await createBankOrder(req, res);
    if (req.method === "GET") return getBankOrder(req, res);
    return methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    if (error?.status && !(error instanceof FunnelError)) {
      return sendJson(res, Number(error.status) || 500, {
        error: {
          code: error.code || "ORDER_ERROR",
          message: error.message || "Non è stato possibile creare il biglietto.",
        },
      });
    }
    return safeErrorResponse(
      res,
      error,
      "Non è stato possibile creare il biglietto tramite bonifico.",
    );
  }
}
