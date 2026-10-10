# VSL Call Funnel · AI OS Strategy Call

Funnel di candidatura per agenzie, freelancer e coach. Struttura "Direct VSL Call Funnel":

```
Ads ──► /call (VSL + candidatura) ──┬─► qualificato ──► calendario ──► /call/confermata ──► pre-call ──► call
                                    └─► non idoneo ──► /call/non-idoneo (Scalers+)
```

| Step | Dove | Cosa fa |
|---|---|---|
| 1. Ads | [`script-vsl.md`](./script-vsl.md#3-hook-per-le-ads-step-1-della-mappa) | 5 hook per segmento. Link `/call?per=agenzie\|freelancer\|coach` + UTM |
| 2. Landing | `public/call/index.html` | VSL, per chi è, problema, prove, piano 90 giorni, candidatura in 6 step, garanzia, FAQ |
| 3a. Booked | calendario incorporato → `public/call/confermata/` | Prossimi passi, video pre-call, dati da preparare |
| 3b. Non idoneo | `public/call/non-idoneo/` | Uscita onesta verso Scalers+ |
| 4. Pre-call | [`sequenza-pre-call.md`](./sequenza-pre-call.md) | Email, WhatsApp, video selfie, recupero no-show |

## Qualifica

La decide il server (`api/call-applications.js`), non il browser:

- **Non idoneo** se il fatturato è sotto 3.000 €/mese oppure se la risposta all'investimento è "non ho budget".
- **Priorità A** se qualificato, fatturato da 10.000 €/mese in su e "Sì, se il piano ha senso".
- **Priorità B** tutti gli altri qualificati.

L'URL del calendario viene restituito solo ai qualificati: chi non passa la qualifica non lo vede neanche nel codice della pagina.

## Personalizzazione per segmento

`?per=agenzie`, `?per=freelancer`, `?per=coach` cambiano pill, headline e sottotitolo della hero, evidenziano la card del segmento e preselezionano la prima domanda. I testi sono nell'oggetto `COPY` di `public/call/assets/call-funnel.js`. Senza parametro resta la versione generica.

## Configurazione

### Variabili Vercel

| Variabile | Obbligatoria | Note |
|---|---|---|
| `CALL_BOOKING_URL` | Sì, per mostrare il calendario | Link dell'evento su `calendly.com`, `cal.com` / `app.cal.com` o `api.leadconnectorhq.com`. Nome ed email vengono precompilati. Senza questa variabile il qualificato vede "ti scriviamo su WhatsApp entro 24 ore" |
| `CALL_FUNNEL_WEBHOOK_URL` | No | HTTPS. Riceve ogni candidatura (`event: "call_application"`) per CRM, Make, Zapier, n8n o GoHighLevel |
| `CALL_FUNNEL_WEBHOOK_SECRET` | No | Almeno 32 caratteri. Firma il body in `X-Call-Funnel-Signature: sha256=<hmac>` |
| `RESEND_*`, `REGISTRATION_NOTIFY_TO` | Già presenti | Email interna per ogni candidatura, oggetto `[CALL][QUALIFICATO-A]`, `[CALL][QUALIFICATO-B]` o `[CALL][NON-IDONEO]` |
| `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` | Già presenti | Notifica Slack per ogni candidatura |

### Calendario

1. Crea l'evento "AI OS Strategy Call" da 45 minuti.
2. Imposta il redirect dopo la prenotazione su `https://www.tiranaoffline.com/call/confermata`. Con Calendly e Cal.com il funnel intercetta anche l'evento di prenotazione e porta l'utente alla conferma da solo; il redirect è la rete di sicurezza.
3. Attiva promemoria email e SMS dal tool, usando i testi in `sequenza-pre-call.md`.

### Video

- **VSL:** URL embed in `data-embed` del primo `.video-frame` di `public/call/index.html`.
- **Pre-call:** URL embed in `data-embed` del `.video-frame` di `public/call/confermata/index.html`.

Sono accettati solo URL embed di `youtube-nocookie.com`, `youtube.com`, `player.vimeo.com`, `loom.com` e `fast.wistia.net` (stessa lista di `frame-src` nella CSP di `vercel.json`). Finché `data-embed` è vuoto, il riquadro mostra "Il video arriva a breve".

### Tracking

Con il consenso del banner cookie già presente:

- `Lead` (Meta) / `generate_lead` (GA4) solo per i candidati **qualificati**, così le campagne ottimizzano su chi può comprare.
- `Schedule` (Meta) / `book_appointment` (GA4) alla prenotazione.

Gli eventi usano l'ID candidatura come `eventID`, quindi non vengono contati due volte tra landing e pagina di conferma.

## Da confermare prima di andare live

- **Garanzia "10 ore a settimana o lavoriamo gratis":** è il cuore della headline. Verifica che sia sostenibile e come la misuri nei contratti.
- **Prezzo e durata del programma:** la pagina non li mostra e rimanda alla call. La FAQ "quanto tempo devo dedicarci" resta volutamente generica.
- **Soglia di qualifica a 3.000 €/mese:** cambiala in `qualifyCallApplication` se il ticket del programma lo richiede.
- **Informativa privacy:** `/privacy` oggi descrive l'evento di Tirana. Va estesa ai dati raccolti dalla candidatura (fatturato, team, WhatsApp).
- **Dominio:** il funnel è indipendente dal sito dell'evento (cartella `public/call/` + `api/call-applications.js`) e si può spostare su un altro dominio aggiornando `canonical`, `og:url` e il redirect del calendario.
