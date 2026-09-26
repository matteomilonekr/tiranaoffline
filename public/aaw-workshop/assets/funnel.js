// Funzioni condivise dal funnel /aaw-workshop (landing e checkout).
(() => {
  "use strict";

  const CONTACT_EMAIL = "matteo@milonematteo.com";
  const LEAD_KEY = "aaw-workshop.lead.v1";
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const DEFAULT_PRODUCT = {
    id: "replay-pass",
    name: "AI Acceleration Week Replay Pass",
    description: "",
    price: 27,
    checkoutUrl: "",
    checkoutUrlWithBump: "",
  };

  const source = window.AAW_WORKSHOP_CONFIG || {};
  const products = (Array.isArray(source.products) && source.products.length ? source.products : [DEFAULT_PRODUCT])
    .map((product) => ({ ...DEFAULT_PRODUCT, ...product, price: Number(product.price) || 0 }));
  const bump = source.bump && source.bump.name
    ? { interval: "", headline: "", description: "", includes: "", ...source.bump, price: Number(source.bump.price) || 0 }
    : null;
  const config = Object.freeze({
    leadWebhookUrl: String(source.leadWebhookUrl || ""),
    offerEndsAt: String(source.offerEndsAt || ""),
    listPrice: Number(source.listPrice) || 0,
    vslEmbedUrl: String(source.vslEmbedUrl || ""),
    products,
    bump,
  });

  const params = new URLSearchParams(window.location.search);

  const euro = (value) => {
    const amount = Number(value) || 0;
    return `€${Number.isInteger(amount) ? amount : amount.toFixed(2).replace(".", ",")}`;
  };

  const utm = () => {
    const values = {};
    UTM_KEYS.forEach((key) => {
      const value = params.get(key);
      if (value) values[key] = value;
    });
    return values;
  };

  const withUtm = (href) => {
    const url = new URL(href, window.location.href);
    Object.entries(utm()).forEach(([key, value]) => {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    });
    return url.href;
  };

  const httpsUrl = (href) => {
    try {
      const url = new URL(href, window.location.href);
      return /^https?:$/.test(url.protocol) ? url : null;
    } catch {
      return null;
    }
  };

  // Il checkout ritrova nome, email e telefono senza metterli nell'URL.
  const saveLead = (lead) => {
    try {
      window.sessionStorage.setItem(LEAD_KEY, JSON.stringify(lead));
    } catch {
      // Navigazione privata o storage bloccato: il checkout parte con i campi vuoti.
    }
  };

  const loadLead = () => {
    try {
      return JSON.parse(window.sessionStorage.getItem(LEAD_KEY) || "null") || {};
    } catch {
      return {};
    }
  };

  const send = (event, data) => {
    if (!config.leadWebhookUrl) return Promise.resolve();
    const body = JSON.stringify({
      event,
      ...data,
      page: window.location.origin + window.location.pathname,
      submittedAt: new Date().toISOString(),
      ...utm(),
    });
    // text/plain evita il preflight CORS: Make, Zapier, n8n e Apps Script leggono comunque il JSON.
    return fetch(config.leadWebhookUrl, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body,
    }).catch(() => {});
  };

  const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  // Link di pagamento con email precompilata (Stripe) e UTM; null se manca o non è valido.
  const paymentUrl = (href, email) => {
    const url = href ? httpsUrl(href) : null;
    if (!url) return null;
    if (/(^|\.)stripe\.com$/.test(url.hostname) && email) url.searchParams.set("prefilled_email", email);
    return withUtm(url.href);
  };

  const mailto = (subject, lines) =>
    `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n").trim())}`;

  window.AAWFunnel = Object.freeze({
    CONTACT_EMAIL,
    config,
    euro,
    utm,
    withUtm,
    httpsUrl,
    saveLead,
    loadLead,
    send,
    pause,
    paymentUrl,
    mailto,
  });
})();
