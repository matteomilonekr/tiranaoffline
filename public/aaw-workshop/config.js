// Configurazione del funnel /aaw-workshop: la leggono sia la landing sia il checkout.
// Compila questi valori prima di mandare traffico.
window.AAW_WORKSHOP_CONFIG = {
  // Opzionale: webhook (Make, Zapier, n8n, Apps Script) che riceve i contatti.
  // Evento "lead" quando si compila la landing, evento "checkout" quando si passa al pagamento.
  leadWebhookUrl: "",

  // Opzionale: scadenza REALE del prezzo di lancio, es. "2026-10-12T23:59:00+02:00". Vuoto = nessun countdown.
  offerEndsAt: "",
  // Opzionale: prezzo pieno realmente praticato dopo la scadenza. 0 = nessun prezzo barrato.
  listPrice: 0,

  // Opzionale: URL embed del video di vendita (YouTube, Vimeo, Loom). Vuoto = solo copertina.
  vslEmbedUrl: "",

  // Opzioni mostrate nel checkout in "Seleziona il prodotto". La prima è il Replay Pass venduto dalla landing.
  // checkoutUrl: Stripe Payment Link del prodotto. Vuoto = la richiesta d'ordine arriva via email a Matteo.
  // checkoutUrlWithBump: Payment Link del prodotto insieme all'order bump (serve solo se attivi il bump).
  products: [
    {
      id: "replay-pass",
      name: "AI Acceleration Week Replay Pass",
      description: "Le 7 registrazioni integrali, lo Start Here da 60 minuti, la Mappa dei colli di bottiglia, il Loop Operativo Canvas e il percorso in 7 giorni.",
      price: 27,
      checkoutUrl: "",
      checkoutUrlWithBump: "",
    },
  ],

  // Opzionale: order bump nel riquadro del checkout. null = nascosto. Esempio:
  // bump: {
  //   name: "Nome dell'aggiunta",
  //   price: 17,
  //   interval: "",           // "" = pagamento unico, oppure "mese" o "anno"
  //   headline: "Aggiungi … a soli 17 euro",
  //   description: "Cosa ottiene chi spunta la casella.",
  //   includes: "Elenco sintetico dei contenuti.",
  // },
  bump: null,
};
