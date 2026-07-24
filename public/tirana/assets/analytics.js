(function () {
  'use strict';

  const GA4_ID = 'G-PEB7DLKTE4';
  const META_PIXEL_ID = '2605330299866744';
  const PAGE_CONTEXT = document.currentScript?.dataset.analyticsContext || 'generic';
  const CONSENT_KEY = 'tirana.analytics.consent.v1';
  const PENDING_KEY = 'tirana.analytics.pending.v1';
  const FLOW_PREFIX = 'tirana.analytics.flow.v1:';
  const SENT_PREFIX = 'tirana.analytics.sent.v1:';
  const PENDING_MAX_AGE = 30 * 60 * 1000;
  const NAVIGATION_WAIT_LIMIT = 700;
  const POST_DISPATCH_WAIT = 120;

  let consent = readConsent();
  let googleReadyPromise = null;
  let metaReadyPromise = null;
  let consentRoot = null;
  const dispatchInFlight = new Map();

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function readSessionStorage(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeSessionStorage(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeSessionStorage(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Lo storage è un aiuto alla deduplicazione, non blocca il checkout.
    }
  }

  function readConsent() {
    const saved = safeJsonParse(readLocalStorage(CONSENT_KEY), null);
    if (!saved || typeof saved.analytics !== 'boolean' || typeof saved.marketing !== 'boolean') {
      return null;
    }
    return {
      analytics: saved.analytics,
      marketing: saved.marketing,
      updatedAt: String(saved.updatedAt || '')
    };
  }

  function readCookie(name) {
    try {
      const prefix = encodeURIComponent(name) + '=';
      const match = String(document.cookie || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix));
      return match ? decodeURIComponent(match.slice(prefix.length)) : '';
    } catch {
      return '';
    }
  }

  function currentSourceUrl() {
    try {
      const url = new URL(window.location.href);
      if (url.protocol !== 'https:' || !['tiranaoffline.com', 'www.tiranaoffline.com'].includes(url.hostname)) {
        return '';
      }
      url.hash = '';
      return url.toString().slice(0, 500);
    } catch {
      return '';
    }
  }

  function getCheckoutTracking() {
    const selection = {
      analytics: consent?.analytics === true,
      marketing: consent?.marketing === true
    };
    const tracking = { consent: selection };
    if (!selection.marketing) return tracking;
    const fbp = readCookie('_fbp');
    const fbc = readCookie('_fbc');
    const sourceUrl = currentSourceUrl();
    if (/^fb\.1\.\d{10,13}\.[A-Za-z0-9._-]{1,180}$/.test(fbp)) tracking.fbp = fbp;
    if (/^fb\.1\.\d{10,13}\.[A-Za-z0-9._-]{1,180}$/.test(fbc)) tracking.fbc = fbc;
    if (sourceUrl) tracking.eventSourceUrl = sourceUrl;
    return tracking;
  }

  function randomId() {
    return window.crypto?.randomUUID?.()
      || String(Date.now()) + '.' + Math.random().toString(16).slice(2);
  }

  function pricingStage(plan) {
    return Number.isInteger(plan?.pricingStage) ? plan.pricingStage : 'current';
  }

  function flowKey(plan) {
    return FLOW_PREFIX + String(plan.id) + ':' + String(pricingStage(plan));
  }

  function getFlowId(plan) {
    const key = flowKey(plan);
    const existing = readSessionStorage(key);
    if (existing) return existing;
    const created = 'aaw26.' + String(plan.id) + '.' + String(pricingStage(plan)) + '.' + randomId();
    writeSessionStorage(key, created);
    return created;
  }

  function sentKey(vendor, eventName, flowId) {
    return SENT_PREFIX + vendor + ':' + eventName + ':' + flowId;
  }

  function wasSent(vendor, eventName, flowId) {
    return readSessionStorage(sentKey(vendor, eventName, flowId)) === '1';
  }

  function markSent(vendor, eventName, flowId) {
    writeSessionStorage(sentKey(vendor, eventName, flowId), '1');
  }

  function normalizePlan(plan) {
    const value = Number(plan?.price);
    if (!plan || !plan.id || !plan.name || !Number.isFinite(value) || value < 0) return null;
    const rawOriginalPrice = Number(plan?.originalPrice);
    const rawDiscount = Number(plan?.discountAmount);
    return {
      id: String(plan.id),
      name: String(plan.name),
      segment: String(plan.segment || 'event'),
      tier: String(plan.tier || 'ticket'),
      price: value,
      originalPrice: Number.isFinite(rawOriginalPrice) && rawOriginalPrice >= value
        ? rawOriginalPrice
        : value,
      discount: Number.isFinite(rawDiscount) && rawDiscount >= 0 ? rawDiscount : 0,
      couponCode: String(plan?.coupon?.code || ''),
      pricingStage: pricingStage(plan),
      currency: 'EUR'
    };
  }

  function normalizeEventOptions(options = {}) {
    const paymentType = ['stripe', 'bank-transfer'].includes(options.paymentType)
      ? options.paymentType
      : '';
    const transactionId = /^[A-Za-z0-9._:-]{8,100}$/.test(String(options.transactionId || ''))
      ? String(options.transactionId)
      : '';
    const eventId = /^[A-Za-z0-9._:-]{8,160}$/.test(String(options.eventId || ''))
      ? String(options.eventId)
      : '';
    return { paymentType, transactionId, eventId };
  }

  function itemFor(plan) {
    const item = {
      item_id: plan.id,
      item_name: plan.name,
      item_category: 'AI Bootcamp ' + plan.segment,
      item_variant: plan.tier,
      price: plan.price,
      quantity: 1
    };
    if (plan.couponCode) {
      item.coupon = plan.couponCode;
      item.discount = plan.discount;
    }
    return item;
  }

  function readPending() {
    const pending = safeJsonParse(readSessionStorage(PENDING_KEY), []);
    if (!Array.isArray(pending)) return [];
    const cutoff = Date.now() - PENDING_MAX_AGE;
    return pending.filter((entry) => entry && Number(entry.createdAt) >= cutoff).slice(-12);
  }

  function writePending(pending) {
    if (!pending.length) {
      removeSessionStorage(PENDING_KEY);
      return;
    }
    writeSessionStorage(PENDING_KEY, JSON.stringify(pending.slice(-12)));
  }

  function enqueue(vendor, eventName, plan, flowId, options = {}) {
    const pending = readPending();
    const duplicate = pending.find((entry) =>
      entry.vendor === vendor && entry.eventName === eventName && entry.flowId === flowId
    );
    if (duplicate) {
      duplicate.deferUntilCheckout = Boolean(duplicate.deferUntilCheckout || options.deferUntilCheckout);
      duplicate.eventOptions = normalizeEventOptions(options);
      writePending(pending);
      return;
    }
    pending.push({
      vendor,
      eventName,
      plan,
      flowId,
      eventOptions: normalizeEventOptions(options),
      deferUntilCheckout: Boolean(options.deferUntilCheckout),
      createdAt: Date.now()
    });
    writePending(pending);
  }

  function removePending(vendor, eventName, flowId) {
    writePending(readPending().filter((entry) => !(
      entry.vendor === vendor && entry.eventName === eventName && entry.flowId === flowId
    )));
  }

  function loadGoogle() {
    if (googleReadyPromise) return googleReadyPromise;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('set', 'ads_data_redaction', true);
    window.gtag('config', GA4_ID, {
      send_page_view: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_flags: 'SameSite=None;Secure'
    });
    googleReadyPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
      script.dataset.tiranaAnalyticsVendor = 'google';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    return googleReadyPromise;
  }

  function loadMeta() {
    if (metaReadyPromise) return metaReadyPromise;
    const fbq = window.fbq || function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    if (!window.fbq) {
      window.fbq = fbq;
      window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
    }
    metaReadyPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      script.dataset.tiranaAnalyticsVendor = 'meta';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
    return metaReadyPromise;
  }

  function loadAllowedVendors() {
    if (consent?.analytics) loadGoogle();
    if (consent?.marketing) loadMeta();
  }

  function sendGoogle(eventName, plan, flowId, options = {}) {
    const eventOptions = normalizeEventOptions(options);
    window.gtag('event', eventName, {
      currency: plan.currency,
      value: plan.price,
      items: [itemFor(plan)],
      coupon: plan.couponCode || undefined,
      discount: plan.couponCode ? plan.discount : undefined,
      original_price: plan.originalPrice,
      payment_type: eventOptions.paymentType || undefined,
      transaction_id: eventOptions.transactionId || undefined,
      event_id: eventOptions.eventId || flowId + '.' + eventName,
      transport_type: 'beacon'
    });
  }

  function sendMeta(eventName, plan, flowId, options = {}) {
    const eventOptions = normalizeEventOptions(options);
    window.fbq('track', eventName, {
      content_ids: [plan.id],
      content_name: plan.name,
      content_category: 'AI Bootcamp ' + plan.segment + ' / ' + plan.tier,
      content_type: 'product',
      value: plan.price,
      currency: plan.currency,
      coupon: plan.couponCode || undefined,
      discount: plan.couponCode ? plan.discount : undefined,
      original_price: plan.originalPrice,
      payment_type: eventOptions.paymentType || undefined,
      order_id: eventOptions.transactionId || undefined,
      num_items: 1
    }, {
      eventID: eventOptions.eventId || flowId + '.' + eventName
    });
  }

  function dispatch(vendor, eventName, plan, flowId, options = {}) {
    if (wasSent(vendor, eventName, flowId)) return Promise.resolve(false);
    const inFlightKey = vendor + ':' + eventName + ':' + flowId;
    if (dispatchInFlight.has(inFlightKey)) return dispatchInFlight.get(inFlightKey);
    const attempt = (async () => {
      const ready = vendor === 'google' ? await loadGoogle() : await loadMeta();
      if (!ready || wasSent(vendor, eventName, flowId)) return false;
      if (vendor === 'google') sendGoogle(eventName, plan, flowId, options);
      if (vendor === 'meta') sendMeta(eventName, plan, flowId, options);
      markSent(vendor, eventName, flowId);
      removePending(vendor, eventName, flowId);
      return true;
    })().finally(() => dispatchInFlight.delete(inFlightKey));
    dispatchInFlight.set(inFlightKey, attempt);
    return attempt;
  }

  function consentFor(vendor) {
    if (!consent) return null;
    return vendor === 'google' ? consent.analytics : consent.marketing;
  }

  function sendOrQueue(vendor, eventName, plan, flowId, options = {}) {
    const permission = consentFor(vendor);
    if (permission === false) return Promise.resolve(false);
    enqueue(vendor, eventName, plan, flowId, options);
    if (options.deferUntilCheckout && PAGE_CONTEXT !== 'checkout') return Promise.resolve(false);
    if (permission === true) return dispatch(vendor, eventName, plan, flowId, options);
    return Promise.resolve(false);
  }

  async function flushPending(options = {}) {
    const allowDeferred = Boolean(options.allowDeferred || PAGE_CONTEXT === 'checkout');
    const attempts = readPending().map(async (entry) => {
      const permission = consentFor(entry.vendor);
      if (entry.deferUntilCheckout && !allowDeferred) return false;
      if (permission === true) {
        return dispatch(
          entry.vendor,
          entry.eventName,
          entry.plan,
          entry.flowId,
          entry.eventOptions || { deferUntilCheckout: entry.deferUntilCheckout }
        );
      }
      return false;
    });
    await Promise.all(attempts);
    writePending(readPending().filter((entry) => {
      const permission = consentFor(entry.vendor);
      if (entry.deferUntilCheckout && !allowDeferred) return permission !== false;
      return permission !== false && !wasSent(entry.vendor, entry.eventName, entry.flowId);
    }));
  }

  function trackCommerce(googleEvent, metaEvent, rawPlan, options = {}) {
    const plan = normalizePlan(rawPlan);
    if (!plan) return Promise.resolve(false);
    const flowId = /^[A-Za-z0-9._:-]{8,160}$/.test(String(options.flowId || ''))
      ? String(options.flowId)
      : getFlowId(plan);
    const dispatching = Promise.all([
      sendOrQueue('google', googleEvent, plan, flowId, {
        ...normalizeEventOptions(options),
        deferUntilCheckout: Boolean(options.deferGoogleUntilCheckout)
      }),
      sendOrQueue('meta', metaEvent, plan, flowId, normalizeEventOptions(options))
    ]).then((results) => {
      if (!results.some(Boolean)) return true;
      return new Promise((resolve) => window.setTimeout(() => resolve(true), POST_DISPATCH_WAIT));
    });
    const limit = new Promise((resolve) => window.setTimeout(() => resolve(true), NAVIGATION_WAIT_LIMIT));
    return Promise.race([dispatching, limit]);
  }

  function saveConsent(nextConsent) {
    consent = {
      analytics: Boolean(nextConsent.analytics),
      marketing: Boolean(nextConsent.marketing),
      updatedAt: new Date().toISOString()
    };
    writeLocalStorage(CONSENT_KEY, JSON.stringify(consent));
    loadAllowedVendors();
    flushPending();
    hideConsent();
    window.dispatchEvent(new CustomEvent('tirana:consent-updated', { detail: { ...consent } }));
  }

  function consentMarkup() {
    return '<div class="tirana-consent" data-consent-banner role="dialog" aria-modal="false" aria-labelledby="tirana-consent-title">'
      + '<div class="tirana-consent__copy"><small>Privacy e misurazione</small><strong id="tirana-consent-title">Scegli quali strumenti attivare.</strong>'
      + '<p>Google Analytics misura l’uso del percorso. Meta Pixel misura le azioni pubblicitarie. Restano disattivati finché non dai il consenso.</p></div>'
      + '<div class="tirana-consent__choices" data-consent-choices hidden>'
      + '<label><input type="checkbox" data-consent-analytics> <span><strong>Analisi</strong><small>Google Analytics 4</small></span></label>'
      + '<label><input type="checkbox" data-consent-marketing> <span><strong>Marketing</strong><small>Meta Pixel</small></span></label>'
      + '</div><div class="tirana-consent__actions">'
      + '<button type="button" data-consent-reject>Rifiuta</button>'
      + '<button type="button" data-consent-customize>Personalizza</button>'
      + '<button type="button" data-consent-save hidden>Salva scelte</button>'
      + '<button type="button" class="is-primary" data-consent-accept>Accetta tutti</button>'
      + '</div><a href="/privacy">Leggi la Privacy Policy</a></div>';
  }

  function consentStyles() {
    return '.tirana-consent{position:fixed;right:18px;bottom:18px;left:18px;z-index:9999;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px 28px;align-items:end;max-width:1040px;margin:auto;padding:22px;border:1px solid rgba(216,201,255,.34);border-radius:22px;background:rgba(8,7,11,.97);box-shadow:0 24px 90px rgba(0,0,0,.62);color:#f8f6ff;font-family:"Instrument Sans",sans-serif;backdrop-filter:blur(20px)}'
      + '.tirana-consent[hidden]{display:none}.tirana-consent__copy small{display:block;margin-bottom:8px;color:#9b6cff;font:600 9px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase}.tirana-consent__copy strong{display:block;font:650 21px/1.05 "Syne",sans-serif}.tirana-consent__copy p{max-width:650px;margin:10px 0 0;color:#aaa4b7;font-size:13px;line-height:1.45}.tirana-consent__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.tirana-consent button{min-height:42px;padding:0 15px;border:1px solid rgba(216,201,255,.24);border-radius:999px;background:#17131d;color:#f8f6ff;font:600 9px/1 "IBM Plex Mono",monospace;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}.tirana-consent button.is-primary{border-color:#d8c9ff;background:#f8f6ff;color:#050507}.tirana-consent>a{width:max-content;color:#d8c9ff;font-size:11px;text-decoration:underline;text-underline-offset:3px}.tirana-consent__choices{display:flex;grid-column:1/-1;flex-wrap:wrap;gap:10px}.tirana-consent__choices label{display:flex;min-width:220px;padding:13px 15px;gap:10px;align-items:center;border:1px solid rgba(216,201,255,.18);border-radius:15px;background:rgba(255,255,255,.035);cursor:pointer}.tirana-consent__choices input{width:18px;height:18px;accent-color:#9b6cff}.tirana-consent__choices span strong,.tirana-consent__choices span small{display:block}.tirana-consent__choices span strong{font-size:13px}.tirana-consent__choices span small{margin-top:4px;color:#8f8998;font-size:10px}@media(max-width:760px){.tirana-consent{grid-template-columns:1fr;padding:18px}.tirana-consent__actions{justify-content:flex-start}.tirana-consent button{flex:1 1 calc(50% - 8px)}.tirana-consent__choices{grid-column:auto;flex-direction:column}.tirana-consent__choices label{min-width:0}}';
  }

  function showConsent(customize) {
    if (!consentRoot) return;
    const choices = consentRoot.querySelector('[data-consent-choices]');
    const save = consentRoot.querySelector('[data-consent-save]');
    const customizeButton = consentRoot.querySelector('[data-consent-customize]');
    const analyticsInput = consentRoot.querySelector('[data-consent-analytics]');
    const marketingInput = consentRoot.querySelector('[data-consent-marketing]');
    analyticsInput.checked = Boolean(consent?.analytics);
    marketingInput.checked = Boolean(consent?.marketing);
    choices.hidden = !customize;
    save.hidden = !customize;
    customizeButton.hidden = Boolean(customize);
    consentRoot.hidden = false;
    if (customize) analyticsInput.focus();
  }

  function hideConsent() {
    if (consentRoot) consentRoot.hidden = true;
  }

  function mountConsent() {
    const style = document.createElement('style');
    style.dataset.tiranaConsentStyles = 'true';
    style.textContent = consentStyles();
    document.head.appendChild(style);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = consentMarkup();
    consentRoot = wrapper.firstElementChild;
    document.body.appendChild(consentRoot);
    consentRoot.querySelector('[data-consent-reject]').addEventListener('click', () => saveConsent({ analytics: false, marketing: false }));
    consentRoot.querySelector('[data-consent-accept]').addEventListener('click', () => saveConsent({ analytics: true, marketing: true }));
    consentRoot.querySelector('[data-consent-customize]').addEventListener('click', () => showConsent(true));
    consentRoot.querySelector('[data-consent-save]').addEventListener('click', () => saveConsent({
      analytics: consentRoot.querySelector('[data-consent-analytics]').checked,
      marketing: consentRoot.querySelector('[data-consent-marketing]').checked
    }));
    document.querySelectorAll('[data-consent-settings]').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        showConsent(true);
      });
    });
    if (!consent) showConsent(false);
    else hideConsent();
  }

  window.TiranaAnalytics = Object.freeze({
    ids: Object.freeze({ ga4: GA4_ID, metaPixel: META_PIXEL_ID }),
    getConsent: () => consent ? { ...consent } : null,
    getCheckoutTracking,
    openConsentSettings: () => showConsent(true),
    trackAddToCart: (plan) => trackCommerce('add_to_cart', 'AddToCart', plan, {
      deferGoogleUntilCheckout: true
    }),
    trackBeginCheckout: (plan) => trackCommerce('begin_checkout', 'InitiateCheckout', plan),
    trackAddPaymentInfo: (plan, paymentType = 'bank-transfer') => trackCommerce(
      'add_payment_info',
      'AddPaymentInfo',
      plan,
      { paymentType }
    ),
    trackCompleteRegistration: (plan) => trackCommerce('sign_up', 'CompleteRegistration', plan),
    trackPurchase: (plan, transactionId, eventId) => trackCommerce('purchase', 'Purchase', plan, {
      paymentType: 'stripe',
      transactionId,
      eventId,
      flowId: 'purchase.' + String(transactionId || '')
    })
  });

  loadAllowedVendors();
  flushPending({ allowDeferred: PAGE_CONTEXT === 'checkout' });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountConsent, { once: true });
  } else {
    mountConsent();
  }
})();
