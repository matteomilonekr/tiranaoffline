(function () {
  'use strict';

  const STORAGE_KEY = 'call.funnel.v1';
  const API_URL = '/api/call-applications';
  const CONFIRMED_PATH = '/call/confermata';
  const DISQUALIFIED_PATH = '/call/non-idoneo';
  const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'per'];
  const EMBED_PREFIXES = [
    'https://www.youtube-nocookie.com/embed/',
    'https://www.youtube.com/embed/',
    'https://player.vimeo.com/video/',
    'https://www.loom.com/embed/',
    'https://fast.wistia.net/embed/'
  ];
  // Devono coincidere con BOOKING_PROVIDERS in api/call-applications.js e con frame-src della CSP.
  const BOOKING_HOSTS = ['calendly.com', 'cal.com', 'app.cal.com', 'api.leadconnectorhq.com'];
  const SEGMENT_PARAM = {
    agenzie: 'agenzia',
    agenzia: 'agenzia',
    freelancer: 'freelancer',
    coach: 'coach'
  };

  // Varianti hero per gli ad set: /call?per=agenzie | freelancer | coach
  const COPY = {
    agenzia: {
      pill: 'Per agenzie da 3 a 30 persone che vogliono scalare senza assumere a ogni nuovo cliente',
      headline: 'Dacci 90 giorni e trasformiamo la tua agenzia in un’<em>operazione AI-first</em>: più clienti gestiti, con lo stesso team.',
      sub: 'Report, copy ads, creatività e onboarding passano a un sistema di agenti costruito sui tuoi processi. Il team torna a fare <strong>strategia e relazione con i clienti</strong>.'
    },
    freelancer: {
      pill: 'Per freelancer e consulenti che hanno venduto tutte le proprie ore',
      headline: 'Dacci 90 giorni e costruiamo l’<em>AI OS</em> che ti fa lavorare come un team, anche da solo.',
      sub: 'Il sistema si prende la parte ripetitiva della delivery e l’acquisizione dei clienti. Tu alzi i prezzi o prendi più clienti, <strong>senza lavorare la sera</strong>.'
    },
    coach: {
      pill: 'Per coach e formatori che vendono con le call e sono stanchi di inseguire i lead',
      headline: 'Dacci 90 giorni e installiamo l’<em>AI OS</em> che riempie il tuo calendario di call qualificate.',
      sub: 'Content OS, follow-up automatici e un setter AI su WhatsApp lavorano i lead al posto tuo. Tu entri <strong>solo nelle call che contano</strong> e l’onboarding dei clienti va da sé.'
    }
  };

  function readStore() {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function writeStore(patch) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStore(), ...patch }));
    } catch {
      // Lo storage serve solo a personalizzare le pagine successive.
    }
  }

  function randomId() {
    return window.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }

  function captureTracking() {
    const params = new URLSearchParams(window.location.search);
    const tracking = { ...(readStore().tracking || {}) };
    let changed = false;
    TRACKING_KEYS.forEach((key) => {
      const value = params.get(key);
      if (value) {
        tracking[key] = value.slice(0, 120);
        changed = true;
      }
    });
    if (changed) writeStore({ tracking });
    return tracking;
  }

  function safeEmbed(value) {
    const src = String(value || '').trim();
    return EMBED_PREFIXES.some((prefix) => src.startsWith(prefix)) ? src : '';
  }

  function isBookingUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && BOOKING_HOSTS.includes(url.hostname);
    } catch {
      return false;
    }
  }

  /* Video con facade: l'iframe si carica solo al click. */
  function initVideos() {
    document.querySelectorAll('[data-video]').forEach((frame) => {
      const facade = frame.querySelector('.video-facade');
      if (!facade) return;
      const src = safeEmbed(frame.dataset.embed);
      if (!src) {
        facade.disabled = true;
        frame.querySelector('.video-pending')?.removeAttribute('hidden');
        return;
      }
      facade.addEventListener('click', () => {
        const iframe = document.createElement('iframe');
        iframe.src = src + (src.includes('?') ? '&' : '?') + 'autoplay=1';
        iframe.title = frame.dataset.title || 'Video';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        iframe.allowFullscreen = true;
        facade.replaceWith(iframe);
      }, { once: true });
    });
  }

  function personalizeName() {
    const name = String(readStore().firstName || '').trim();
    document.querySelectorAll('[data-first-name]').forEach((node) => {
      node.textContent = name ? ', ' + name : '';
    });
  }

  function applySegment(segment) {
    const copy = COPY[segment];
    if (!copy) return;
    document.querySelectorAll('[data-copy]').forEach((node) => {
      const value = copy[node.dataset.copy];
      if (value) node.innerHTML = value;
    });
    document.querySelectorAll('[data-segment-card]').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.segmentCard === segment);
    });
    const radio = document.querySelector('input[name="segment"][value="' + segment + '"]');
    if (radio) radio.checked = true;
  }

  /* Barra CTA mobile: visibile dopo la hero, nascosta quando il form è a schermo. */
  function initMobileCta() {
    const bar = document.querySelector('[data-mobile-cta]');
    const hero = document.querySelector('.hero');
    const apply = document.getElementById('candidatura');
    if (!bar || !hero || !apply || !('IntersectionObserver' in window)) return;
    const visible = { hero: true, apply: false };
    const update = () => bar.classList.toggle('is-visible', !visible.hero && !visible.apply);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        visible[entry.target === hero ? 'hero' : 'apply'] = entry.isIntersecting;
      });
      update();
    }, { threshold: 0.05 });
    observer.observe(hero);
    observer.observe(apply);
  }

  /* Prenotazione completata: Calendly e Cal.com avvisano la pagina con postMessage. */
  let booked = false;
  function onBooked() {
    if (booked) return;
    booked = true;
    writeStore({ booked: true });
    const store = readStore();
    const tracking = window.TiranaAnalytics?.trackSchedule?.({
      eventId: store.applicationId,
      segment: store.segment
    });
    Promise.resolve(tracking).finally(() => window.location.assign(CONFIRMED_PATH));
  }

  function listenForBooking() {
    window.addEventListener('message', (event) => {
      let host = '';
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (!BOOKING_HOSTS.includes(host)) return;
      const data = event.data && typeof event.data === 'object' ? event.data : {};
      const calendly = data.event === 'calendly.event_scheduled';
      const cal = data.originator === 'CAL' && /^bookingSuccessful(V2)?$/.test(String(data.type || ''));
      if (calendly || cal) onBooked();
    });
  }

  function initForm() {
    const form = document.getElementById('application-form');
    if (!form) return;

    const steps = Array.from(form.querySelectorAll('.step'));
    const back = form.querySelector('[data-back]');
    const next = form.querySelector('[data-next]');
    const error = form.querySelector('.form-error');
    const label = document.querySelector('[data-step-label]');
    const bar = document.querySelector('.progress span');
    const idempotencyKey = 'call-' + randomId();
    let index = 0;
    let submitting = false;

    function nextLabel() {
      return index === steps.length - 1
        ? 'Vedi il calendario <span class="arrow" aria-hidden="true">→</span>'
        : 'Continua <span class="arrow" aria-hidden="true">→</span>';
    }

    function show(target, focus) {
      index = target;
      steps.forEach((step, position) => { step.hidden = position !== target; });
      back.hidden = target === 0;
      next.innerHTML = nextLabel();
      if (label) label.textContent = (target + 1) + ' di ' + steps.length;
      if (bar) bar.style.width = ((target + 1) / (steps.length + 1)) * 100 + '%';
      error.textContent = '';
      if (focus) steps[target].querySelector('legend')?.focus({ preventScroll: true });
    }

    function checked(name) {
      return form.querySelector('input[name="' + name + '"]:checked');
    }

    function markInvalid(field, invalid) {
      field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      return invalid;
    }

    function validateStep(step) {
      const kind = step.dataset.step;
      if (['segment', 'revenue', 'team', 'readiness'].includes(kind)) {
        return checked(kind) ? '' : 'Scegli una delle opzioni per continuare.';
      }
      if (kind === 'bottlenecks') {
        return checked('bottlenecks') ? '' : 'Scegli almeno un’area in cui perdi tempo.';
      }
      if (kind === 'contact') {
        const { firstName, lastName, email, phone, privacy } = form.elements;
        const problems = [
          markInvalid(firstName, !firstName.value.trim()) && 'Inserisci il tuo nome.',
          markInvalid(lastName, !lastName.value.trim()) && 'Inserisci il tuo cognome.',
          markInvalid(email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) && 'Inserisci un’email valida.',
          markInvalid(phone, phone.value.replace(/\D/g, '').length < 6) && 'Inserisci un numero WhatsApp valido.',
          !privacy.checked && 'Per continuare accetta l’informativa privacy.'
        ].filter(Boolean);
        return problems[0] || '';
      }
      return '';
    }

    function collect() {
      const data = new FormData(form);
      return {
        segment: data.get('segment'),
        revenue: data.get('revenue'),
        team: data.get('team'),
        bottlenecks: data.getAll('bottlenecks'),
        challenge: String(data.get('challenge') || ''),
        readiness: data.get('readiness'),
        firstName: String(data.get('firstName') || '').trim(),
        lastName: String(data.get('lastName') || '').trim(),
        email: String(data.get('email') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        link: String(data.get('link') || '').trim(),
        website: String(data.get('website') || ''),
        privacy: form.elements.privacy.checked,
        tracking: captureTracking()
      };
    }

    function showBooking(booking, firstName) {
      const panel = document.getElementById('booking-step');
      form.hidden = true;
      document.querySelector('[data-form-top]')?.setAttribute('hidden', '');
      if (bar) bar.style.width = '100%';
      panel.hidden = false;
      personalizeName();

      if (booking && isBookingUrl(booking.url)) {
        const iframe = document.createElement('iframe');
        iframe.src = booking.url;
        iframe.title = 'Calendario per prenotare la AI OS Strategy Call';
        panel.querySelector('[data-booking-frame]').appendChild(iframe);
        panel.querySelector('[data-booking-link]').href = booking.url;
      } else {
        panel.querySelector('[data-booking-ready]').hidden = true;
        panel.querySelector('[data-booking-manual]').hidden = false;
      }

      document.getElementById('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.querySelector('[data-booking-title]').focus({ preventScroll: true });
      if (firstName) document.title = 'Scegli giorno e ora | AI OS Strategy Call';
    }

    async function submit() {
      if (submitting) return;
      submitting = true;
      next.disabled = true;
      next.textContent = 'Invio in corso…';
      const payload = collect();

      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error?.message || 'Non siamo riusciti a inviare la candidatura. Riprova tra poco.');
        }

        writeStore({
          firstName: payload.firstName,
          applicationId: data.applicationId || '',
          segment: payload.segment,
          qualified: Boolean(data.qualified)
        });

        if (!data.qualified) {
          window.location.assign(data.next || DISQUALIFIED_PATH);
          return;
        }

        window.TiranaAnalytics?.trackLead?.({ eventId: data.applicationId, segment: payload.segment });
        showBooking(data.booking, payload.firstName);
      } catch (cause) {
        error.textContent = cause instanceof Error && cause.message
          ? cause.message
          : 'Connessione assente. Controlla la rete e riprova.';
        submitting = false;
        next.disabled = false;
        next.innerHTML = nextLabel();
      }
    }

    function advance() {
      const problem = validateStep(steps[index]);
      if (problem) {
        error.textContent = problem;
        return;
      }
      if (index < steps.length - 1) show(index + 1, true);
      else submit();
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      advance();
    });

    back.addEventListener('click', () => {
      if (index > 0) show(index - 1, true);
    });

    // Domande a scelta singola: si passa allo step successivo appena si risponde.
    form.addEventListener('change', (event) => {
      const input = event.target;
      if (input.type !== 'radio') return;
      error.textContent = '';
      const step = steps[index];
      if (!step.contains(input)) return;
      window.setTimeout(() => {
        if (steps[index] === step && index < steps.length - 1) show(index + 1, true);
      }, 260);
    });

    form.addEventListener('input', (event) => {
      if (event.target.getAttribute('aria-invalid') === 'true') event.target.setAttribute('aria-invalid', 'false');
    });

    show(0, false);
  }

  function initLanding() {
    const tracking = captureTracking();
    const segment = SEGMENT_PARAM[String(tracking.per || '').toLowerCase()];
    if (segment) applySegment(segment);
    initForm();
    initMobileCta();
    listenForBooking();
  }

  function initConfirmed() {
    // Se il calendario ha fatto il redirect dentro l'iframe, porta la conferma a tutta pagina.
    if (window.top !== window.self) {
      try {
        window.top.location.replace(window.location.href);
        return;
      } catch {
        // Se il browser blocca la navigazione, la pagina resta leggibile anche nel riquadro.
      }
    }
    personalizeName();
    const store = readStore();
    if (store.applicationId) {
      window.TiranaAnalytics?.trackSchedule?.({ eventId: store.applicationId, segment: store.segment });
    }
  }

  function init() {
    const page = document.body.dataset.page;
    initVideos();
    if (page === 'landing') initLanding();
    if (page === 'confirmed') initConfirmed();
    if (page === 'disqualified') personalizeName();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
