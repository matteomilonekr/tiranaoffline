# Evento Scalers Offline Mode Tirana 2026

Landing page, pagina offerta e checkout dell'evento di Tirana con Stripe Checkout e bonifico bancario.

## Rotte pubbliche

- `/`: landing page evento
- `/offerta`: offerte, prezzi e capacità
- `/checkout?plan=solo-mid`: checkout del piano selezionato
- `/thank-you`: conferma del pagamento Stripe oppure istruzioni per il bonifico
- `/ticket?token=...`: biglietto personalizzato condivisibile, senza dati bancari
- `/privacy`: informativa privacy dell’evento e del checkout
- `/refund-policy`: policy di rimborso, cancellazione e condizioni di acquisto
- `/call`: VSL call funnel per agenzie, freelancer e coach (candidatura, calendario, `/call/confermata`, `/call/non-idoneo`). Dettagli in [`docs/call-funnel/`](docs/call-funnel/README.md)

## Catalogo attivo

Il checkout accetta sei identificativi commerciali, organizzati nelle sezioni Solo, Agency e Company. Ogni sezione propone un Mid Ticket e un Full Ticket. Agency Mid include 1 Builder Pass, Company Mid ne include 3. Agency e Company includono una call di onboarding nel Mid e nel Full. Solo la include nel Full.

| ID | Offerta | Persone alle mattine | Persone al Live Building | Account Skool | Durata Skool | Founder | Early | Early Plus | Regular | Late | Final |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `solo-mid` | Workshop Pass | 1 | 0 | 1 | 1 mese | €97 | €137 | €177 | €217 | €257 | €297 |
| `solo-full` | Builder Pass + Solo OS | 1 | 1 | 1 | 1 mese | €397 | €497 | €597 | €697 | €797 | €897 |
| `agency-mid` | Workshop Pass + Agency OS | 3 | 1 | 3 | 3 mesi | €597 | €697 | €797 | €897 | €997 | €1.097 |
| `agency-full` | Builder Pass + Agency OS | 3 | 3 | 3 | 6 mesi | €997 | €1.197 | €1.397 | €1.597 | €1.797 | €1.997 |
| `company-mid` | Workshop Pass + Company OS | 3 | 3 | 3 | 6 mesi | €997 | €1.097 | €1.197 | €1.297 | €1.397 | €1.497 |
| `company-full` | Builder Pass + Company OS | 3 | 3 | 3 | 12 mesi | €1.997 | €2.297 | €2.597 | €2.897 | €3.197 | €3.497 |

I Workshop Pass includono le due mattine, il corso completo Claude Code 2.0 e l'accesso ai 7 Live Workshop dentro Scalers+. Il Workshop Pass Solo consegna assessment, mappa delle priorità e roadmap operativa, ma non include l'AI Solo OS. I Builder Pass aggiungono il Live Building, dove Claude Code IDE + CLI, Codex Desktop + CLI e Hermes Agent vengono usati dal vivo nelle sessioni pomeridiane. L'AI Solo OS è incluso esclusivamente nel Builder Pass Solo Full. Agency Mid include 1 Builder Pass, Company Mid ne include 3. Solo include 1 mese su Scalers+ in entrambi i pass. Agency include 3 mesi nel Mid e 6 mesi nel Full. Company include 6 mesi nel Mid e 12 mesi nel Full. Agency e Company includono una call di onboarding nel Mid e nel Full. Solo la include nel Full.

Solo Full include Vault Standard, WhatsApp Agent, AI Creatives, MCP Meta Agent con 260M di Ads, Social Scraper OS V2, MCP Meta Ads + Google Ads, LinkedIn Vault e MCP Meta Agent OS collegato a 100M di Ads.

I precedenti ID `workshop-pass`, `builder-solo-os`, `builder-agency-os` e `builder-company-os` non sono più vendibili. Rimangono nel catalogo interno esclusivamente per verificare e riconciliare ordini storici creati prima della migrazione.

## Fasi di prezzo

Per tutti i piani, il prezzo cambia esclusivamente alle deadline indicate. I posti assegnati aggiornano disponibilità e sold out, ma non anticipano gli aumenti.

Deadline:

- Founder fino al 31 luglio 2026 alle 23:59.
- Early fino al 2 agosto 2026 alle 23:59.
- Early Plus fino al 12 agosto 2026 alle 23:59.
- Regular fino al 22 agosto 2026 alle 23:59.
- Late fino al 1 settembre 2026 alle 23:59.
- Final dal 2 settembre 2026.

Soglie per i Workshop Pass, calcolate sui 150 partecipanti totali:

- Founder da 0 a 24 posti assegnati.
- Early da 25 a 49.
- Early Plus da 50 a 74.
- Regular da 75 a 99.
- Late da 100 a 124.
- Final da 125.

Soglie condivise dai Builder Pass, calcolate sui 60 slot Builder:

- Founder da 0 a 9 slot assegnati.
- Early da 10 a 19.
- Early Plus da 20 a 29.
- Regular da 30 a 39.
- Late da 40 a 49.
- Final da 50.

La capacità è di 150 partecipanti totali, di cui massimo 60 Builder. Solo Mid consuma 1 posto totale. Agency Mid consuma 3 posti totali e 1 slot Builder. Company Mid consuma 3 posti totali e 3 slot Builder. I Full consumano 1 posto totale e 1 slot Builder nel Solo, 3 posti totali e 3 slot Builder nei piani Agency e Company.

La pagina mostra sempre il prezzo attuale e il prossimo prezzo. Le soglie dei posti sono usate soltanto per la disponibilità.

## Configurazione Stripe

Il checkout usa Stripe Checkout ospitato. Prezzo, valuta, piano e coupon vengono determinati esclusivamente dagli endpoint serverless. Il browser riceve soltanto l’URL della sessione Stripe e non può inviare prezzi. I dati del cliente necessari al webhook vengono cifrati prima di essere inseriti nei metadati della sessione.

Variabili richieste:

```dotenv
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

In produzione le prime due chiavi devono appartenere entrambe alla modalità live. `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` devono rimanere esclusivamente nelle variabili server di Vercel e non devono mai essere inserite nei file pubblici o in variabili `VITE_*`.

Il webhook pubblico è `POST /api/stripe/webhook` e deve ricevere almeno l’evento `checkout.session.completed`. La firma viene verificata sul corpo raw con tolleranza di cinque minuti. Un pagamento viene confermato soltanto quando Stripe restituisce sessione completa, stato pagato, valuta e importo attesi. Il bonifico resta sempre selezionabile e rimane nello stato `IN ATTESA DI ACCREDITO` fino alla verifica manuale.

Prima di aprire Stripe, il checkout richiede l’accettazione esplicita della Policy di rimborso e delle condizioni di acquisto, versione `2026-07-22-v1`. Il server rifiuta richieste senza accettazione o con una versione diversa. Versione, URL e fonte dell’accettazione vengono registrate nei metadati della Checkout Session e del PaymentIntent. La pagina Stripe mostra inoltre un richiamo alla policy accanto al pulsante di pagamento. Il riepilogo inviato via email conserva il link alla versione pubblica.

La policy offre il rimborso volontario entro 14 giorni di calendario dall’acquisto e comunque non oltre il 14 agosto 2026 alle 23:59, ora di Tirana. In caso di annullamento definitivo è previsto il rimborso integrale dell’importo effettivamente pagato. In caso di rinvio o modifica sostanziale, il cliente ha 14 giorni dalla comunicazione per chiedere il rimborso. Le richieste accettate vengono avviate sul metodo originario senza commissioni Scalers. Stripe indica normalmente 5-10 giorni lavorativi per la visibilità dell’accredito presso la banca del cliente.

## Tracking revenue

La pagina di conferma invia `purchase` a Google Analytics 4 e `Purchase` al Meta Pixel soltanto dopo che l’endpoint server ha verificato una sessione Stripe `complete` e `paid`. Il codice ordine viene usato come `transaction_id` GA4 per evitare duplicati.

Il webhook Stripe invia anche `Purchase` a Meta Conversions API quando il cliente ha accettato la categoria marketing. Pixel e CAPI condividono lo stesso `event_id`, quindi Meta può deduplicare i due segnali. Email, telefono, nome e località vengono normalizzati e trasformati in hash SHA-256 prima dell’invio server-side. Il tracking non blocca mai la consegna del ticket se Meta non è raggiungibile.

Variabili server:

```dotenv
META_PIXEL_ID=2605330299866744
META_CAPI_ACCESS_TOKEN=
META_GRAPH_API_VERSION=v23.0
META_TEST_EVENT_CODE=
```

`META_TEST_EVENT_CODE` è opzionale e deve essere usata soltanto durante una verifica temporanea nella sezione Test Events. `META_CAPI_ACCESS_TOKEN` deve appartenere al Pixel configurato e non deve essere inserita nel codice pubblico, nei log o in variabili `VITE_*`.

## Configurazione Resend

Le notifiche interne e le email con coordinate bancarie, ticket personalizzato e pulsanti di condivisione vengono inviate tramite Resend usando l’endpoint server-side `POST /emails`. Il link social usa un token separato dal riepilogo bancario e non espone codice ordine, importo, IBAN o causale.

Variabili disponibili:

```dotenv
RESEND_API_KEY=
RESEND_FROM=Scalers <evento@tiranaoffline.com>
RESEND_REPLY_TO=evento@tiranaoffline.com
REGISTRATION_NOTIFY_TO=matteo@milonematteo.com,evento@tiranaoffline.com
```

Il dominio usato in `RESEND_FROM` deve essere verificato dentro Resend. `REGISTRATION_NOTIFY_TO` accetta fino a 10 indirizzi separati da virgola e viene usata soltanto per le notifiche interne. Se `RESEND_REPLY_TO` è vuota, le risposte vengono indirizzate al primo indirizzo configurato. `RESEND_API_KEY` deve rimanere esclusivamente nelle variabili server di Vercel e non deve essere inserita nei file pubblici o in variabili `VITE_*`.

## Configurazione Slack

Le notifiche operative per nuovi lead, pagamenti Stripe confermati, bonifici in attesa e Free Pass confermati possono essere inviate in un canale Slack tramite la Web API `chat.postMessage`.

Variabili server richieste per attivare l’integrazione:

```dotenv
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C...
```

Crea una Slack App con un bot, aggiungi lo scope OAuth `chat:write`, installa o reinstalla l’app nel workspace e invita il bot nel canale di destinazione. Copia il Bot User OAuth Token che inizia con `xoxb-` e l’ID del canale che inizia con `C`. Entrambe le variabili devono essere valide: una configurazione parziale viene rifiutata senza effettuare richieste a Slack.

`SLACK_BOT_TOKEN` deve rimanere esclusivamente nelle variabili server di Vercel. Non inserirlo nei file pubblici, nei log o in variabili `VITE_*`. I messaggi includono soltanto nome, email, telefono, referral, origine del lead, piano, importo, coupon, record ID e URL del ticket. Non includono indirizzo, dati fiscali, IBAN o causale del bonifico.

## Registro automatico Google Sheets

Ogni lead ricevuto dall’endpoint di registrazione e ogni biglietto creato con bonifico o confermato da Stripe vengono registrati nel foglio privato [Tirana Offline Mode 2026 - Iscritti](https://docs.google.com/spreadsheets/d/1NS959SkVwmUZ_1iF-b75d8SybHjfA6bHjv5y5R9fb0M/edit). Il salvataggio avviene server-side prima delle email di conferma.

Il webhook Apps Script è versionato in `google-apps-script/Code.gs`. Usa l’ID biglietto o l’ID registrazione come chiave univoca e `LockService` per evitare righe duplicate anche durante retry o richieste concorrenti. Se un lead senza biglietto usa la stessa email del checkout, la riga viene completata con i dati del ticket. Il tab `_Config` è nascosto e contiene il segreto condiviso.

Variabili richieste in produzione:

```dotenv
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_WEBHOOK_SECRET=
GOOGLE_SHEETS_REQUIRED=true
```

`GOOGLE_SHEETS_WEBHOOK_URL` deve essere l’URL `/exec` della Web App. Se il registro è configurato come obbligatorio e Google Sheets non conferma la scrittura, il checkout non restituisce il ticket e può essere ripetuto con la stessa chiave di idempotenza senza creare doppioni. Le istruzioni di pubblicazione sono in `google-apps-script/README.md`.

## Inventario manuale opzionale

Senza contatori configurati, l'API espone soltanto le capacità massime e il pricing avanza in base alle deadline.

Per fornire uno snapshot manuale dei posti già assegnati si possono impostare entrambe le variabili:

```dotenv
AAW26_TOTAL_ASSIGNED=0
AAW26_BUILDER_ASSIGNED=0
```

I due valori devono essere impostati insieme. `AAW26_TOTAL_ASSIGNED` accetta valori da 0 a 150, mentre `AAW26_BUILDER_ASSIGNED` accetta valori da 0 a 60. Il conteggio Builder deve rimanere coerente con il totale.

Questi contatori sono manuali e non atomici:

- non vengono incrementati dal checkout;
- non prenotano un posto durante il pagamento;
- non gestiscono ordini concorrenti, scadenze, annullamenti o rimborsi;
- il bonifico non aggiorna automaticamente i valori;
- richiedono un aggiornamento operativo delle variabili Vercel.

Non devono quindi essere presentati come inventario automatico in tempo reale. Servono come snapshot server side per applicare soglie, mostrare disponibilità e bloccare una vendita quando il valore manuale indica capienza insufficiente.

Per un inventario automatico affidabile serve uno storage transazionale con prenotazione atomica prima della creazione della sessione Stripe, idempotenza, scadenza degli hold, conferma dopo il pagamento e gestione dei webhook. Un contatore in memoria dentro una funzione serverless non è sufficiente e può causare overselling.

## Sviluppo locale

Installa le dipendenze e avvia il progetto attraverso Vercel CLI, così sono disponibili anche gli endpoint serverless:

```bash
npm install
vercel dev
```

Esegui i contratti automatici:

```bash
npm test
```

## Verifica e pubblicazione

```bash
npm run build
vercel build --yes
vercel --prod
```

Prima della pubblicazione in produzione:

- configura `RESEND_API_KEY`, `RESEND_FROM` e `REGISTRATION_NOTIFY_TO` su Vercel;
- verifica il dominio del mittente nel pannello Resend e controlla la consegna di una notifica interna e di una conferma cliente;
- configura `SLACK_BOT_TOKEN` e `SLACK_CHANNEL_ID` su Vercel, poi verifica nel canale un lead, un bonifico pending e un Free Pass confermato;
- pubblica `google-apps-script/Code.gs`, configura le tre variabili Google Sheets e verifica che un retry non aggiunga una seconda riga;
- configura le tre variabili Stripe su Vercel e registra il webhook live;
- configura `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` e `META_GRAPH_API_VERSION`, poi verifica un evento deduplicato Pixel e CAPI nella diagnostica Meta;
- se usi l'inventario manuale, configura entrambi i contatori e verifica che siano aggiornati;
- completa un acquisto sandbox per ciascuna delle sei offerte;
- verifica il blocco a 150 partecipanti totali e a 60 Builder;
- verifica ogni passaggio di fase per deadline e soglia;
- completa un acquisto Stripe in modalità test e verifica il webhook `checkout.session.completed`;
- completa un ordine di prova con bonifico e verifica coordinate, importo, causale e pulsante WhatsApp;
- verifica che la thank you page mostri successo solo per una sessione Stripe `complete` e `paid`;
- verifica che un vecchio ordine resti riconciliabile, ma che un ID legacy non possa creare un nuovo ordine;
- sottoponi Privacy, Termini e policy di rimborso definitive alla revisione legale di Scalers+;
- verifica che il webhook Stripe aggiorni Google Sheets e invii le notifiche con chiavi di idempotenza stabili.
