(() => {
  "use strict";

  if (document.documentElement.classList.contains("has-event-chrome")) return;
  document.documentElement.classList.add("has-event-chrome");

  const announcement = document.createElement("aside");
  announcement.className = "event-announcement";
  announcement.setAttribute("aria-label", "Iscrizioni evento Tirana Offline Mode");
  announcement.innerHTML = `
    <a class="event-announcement__link" href="/offerta">
      <span class="event-announcement__icon" aria-hidden="true">🚨</span>
      <span class="event-announcement__message">PROSSIMO AUMENTO DI PRICING IL 31 LUGLIO</span>
      <span class="event-announcement__cta">Scopri i ticket ↗</span>
    </a>`;

  const whatsapp = document.createElement("a");
  whatsapp.className = "event-whatsapp";
  whatsapp.href = "https://wa.me/393759916344";
  whatsapp.target = "_blank";
  whatsapp.rel = "noopener noreferrer";
  whatsapp.setAttribute("aria-label", "Contatta Scalers su WhatsApp");
  whatsapp.innerHTML = `
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M26.5 15.5a10.5 10.5 0 0 1-15.7 9.1L5 26l1.5-5.6A10.5 10.5 0 1 1 26.5 15.5Z"></path>
      <path d="M11.2 10.4c.3-.7.7-.7 1.1-.7h.5c.2 0 .5 0 .7.6l1 2.4c.1.3.1.6-.1.8l-.8 1c-.2.2-.3.4-.1.8.5 1.1 1.4 2.1 2.4 2.8 1.2.8 2.1 1.1 2.5 1.2.3.1.6 0 .8-.2l1.2-1.4c.3-.3.6-.3.9-.2l2.2 1c.4.2.6.3.7.5.1.2.1 1-.2 1.9-.3.9-1.8 1.7-2.6 1.8-.7.1-1.7.2-4.6-.9-3.8-1.5-6.3-5.4-6.5-5.7-.2-.3-1.5-2.1-1.5-4 0-.9.2-1.3.4-1.7Z"></path>
    </svg>
    <span class="event-whatsapp__tooltip">Scrivici su WhatsApp</span>`;

  document.body.prepend(announcement);
  document.body.append(whatsapp);
})();
