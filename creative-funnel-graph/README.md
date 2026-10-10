# Creative Funnel Graph

Tutte le ads Meta che stai facendo girare in un'unica vista 3D. Le creative che si somigliano diventano una sola card con il conteggio, e ogni card sta nel funnel in base a dove Meta ha speso: nuovi utenti, pubblico ingaggiato o clienti esistenti.

Gira in locale, legge Meta in sola lettura e si installa con una riga nel Terminale.

## Perché

Andromeda raggruppa le ads con creative simili sotto la stessa entità: condividono apprendimento, delivery e costi. Trenta statiche dello stesso prodotto con inquadrature diverse contano come una. Gestione inserzioni mostra righe, e le righe nascondono quanto le ads si somigliano. Creative Funnel Graph le mette una accanto all'altra.

## Cosa fa

- Mostra tutte le creative attive fianco a fianco, al posto di una tabella da scorrere.
- Raggruppa le ads con la stessa creativa in una card con il conteggio (`12×`), così i doppioni si vedono subito.
- Riorganizza la vista per formato, angolo, persona, creator, hook (rilevati dai nomi delle ads) o campagna.
- Riorganizza per **tipologia di asset** (statiche, video, UGC, caroselli), **tipologia di UGC** (unboxing, reveal / prima-dopo, testimonianza, routine / GRWM, tutorial, reaction, POV, intervista) e **offerta** (BOGO, sconto %, sconto in valuta, bundle, abbonamento, spedizione gratuita, omaggio, garanzia, evento promo, solo urgenza), lette dal tipo di creativa, dal nome dell'ad e dal copy.
- Nella somiglianza creativa, **Troppo simili**: i gruppi di creative con lo stesso creator, lo stesso gancio, lo stesso testo o la stessa immagine (scegli quali criteri devono condividere), evidenziati nella mappa 3D e nel dettaglio di ogni creativa.
- Posiziona ogni ad nel funnel in base a dove Meta ha speso:
  - **Top of funnel**: nuovi utenti (prospecting)
  - **Middle of funnel**: pubblico ingaggiato, frequenza ancora bassa
  - **Bottom of funnel**: pubblico ingaggiato, frequenza alta (saturo)
  - **Riattivazione**: clienti esistenti
- Al clic su una card: spesa e ROAS giornalieri, ripartizione per segmento, posizionamenti e retention del video.
- Interfaccia in italiano e in inglese (segue la lingua del sistema, si cambia nelle impostazioni).

## Installazione

Su Mac (Apple Silicon o Intel), nel Terminale:

```bash
curl -fsSL https://raw.githubusercontent.com/matteomilonekr/tiranaoffline/main/creative-funnel-graph/install.sh | bash
```

L'installer:

1. usa Node.js 18+ se è già installato, altrimenti scarica una copia privata in `~/.creative-funnel-graph/runtime` (non tocca il sistema e non chiede la password);
2. copia l'app in `~/.creative-funnel-graph/app`;
3. crea **Creative Funnel Graph** in `~/Applications`, con finestra nativa se sono presenti gli strumenti da riga di comando di Xcode (altrimenti si apre in una finestra di Chrome, Brave o Edge, oppure in Safari);
4. aggiunge il comando `creative-funnel-graph` in `~/.local/bin`;
5. apre l'app.

Per aggiornare, rilancia la stessa riga. Per provare un branch: `FUNNEL_GRAPH_REF=nome-branch` prima di `bash`.

Senza installer, da questa cartella:

```bash
node server.mjs --open     # http://127.0.0.1:4747
```

## Collegare Meta

All'apertura vedi il **brand demo** (dati di esempio). Per vedere i tuoi account clicca **Collega Meta** e incolla un token di accesso con il permesso `ads_read`:

1. apri [Graph API Explorer](https://developers.facebook.com/tools/explorer/) e scegli un'app che gestisci;
2. in **Permissions** aggiungi `ads_read` e clicca **Generate Access Token**;
3. incolla il token nell'app.

Il token di Graph API Explorer scade dopo poche ore. Per un token che non scade crea un **System User** in Impostazioni aziendali → Utenti di sistema, assegnagli gli account pubblicitari e genera un token con `ads_read`.

In alternativa puoi impostare il token come variabile d'ambiente: `META_ACCESS_TOKEN=... node server.mjs`. Se hai un'app Meta con Facebook Login configurata su `http://127.0.0.1:4747/oauth.html`, imposta `META_APP_ID` e nell'app compare il pulsante **Continua con Facebook**.

## Come funziona

**Creative simili.** Due ads finiscono nella stessa card se usano lo stesso asset (stesso `video_id` o stesso `image_hash`) oppure se le loro anteprime si somigliano: per ogni creativa l'app calcola un hash percettivo a 256 bit (la struttura dell'immagine) e una griglia di colori 3×3 (la palette). Se entrambe le distanze stanno sotto soglia, le ads vengono raggruppate. La soglia si regola in **Impostazioni → Raggruppa le creative simili** (rigido, normale, largo). Meta non espone l'Entity ID tramite API: questo è un'approssimazione visiva di come Andromeda raggruppa le creative.

**Posizione nel funnel.** L'app legge la spesa per segmento di pubblico con il breakdown `user_segment_key` dell'API Insights (le campagne Advantage+ con segmenti di pubblico configurati nelle impostazioni dell'account). Il segmento con più spesa decide il livello; la spesa sul pubblico ingaggiato si divide tra *in riscaldamento* e *saturo* in base alla frequenza (soglia regolabile, scalata sulla durata del periodo). Le ads senza dati di segmento vengono posizionate dai nomi di campagna e gruppo di inserzioni (`RT`, `retargeting`, `prospecting`, `winback`…) e, se i nomi non dicono nulla, da frequenza e CPMr (costo per 1.000 persone raggiunte) confrontati con le mediane dell'account. Queste card hanno il bordo tratteggiato.

**Formato, angolo, persona, creator, hook.** Vengono letti dai nomi delle ads in tre passaggi: coppie esplicite (`angle:prezzo`, `fmt=ugc`, `@creator`, `H3`), parole note (UGC, statico, carosello, pain point, testimonial, mamme, 40+…) e posizione nel nome, quando molte ads condividono la stessa struttura (`data_formato_angolo_persona_creator_hook`). Se la tua convenzione è diversa, scrivila in **Impostazioni → Convenzione di naming**, per esempio `{date}_{product}_{format}_{angle}_{persona}_{creator}_{hook}`.

**Dettaglio.** Un solo report filtrato per gli ID delle ads dello stack restituisce la spesa giornaliera, il valore degli acquisti, i posizionamenti (`publisher_platform`, `platform_position`) e, per i video, `video_play_curve_actions` (la curva di retention secondo per secondo) con i quartili come riserva.

## Privacy e sicurezza

- Sola lettura: tutte le chiamate a Meta sono GET. L'unica POST crea un report asincrono quando un account è troppo grande per una risposta immediata; il report legge dati e non modifica nulla.
- Il token resta sul tuo computer in `~/.creative-funnel-graph/config.json` con permessi `600` e non torna mai al browser.
- Il server ascolta solo su `127.0.0.1`. Le API rispondono solo a richieste con un header dell'app e un host locale, quindi un sito esterno non può leggere i tuoi dati attraverso il server.
- Il proxy delle immagini scarica solo dai CDN di Meta e salva la cache in `~/.creative-funnel-graph/cache`.

## Struttura

```
server.mjs              server locale (Node 18+, nessuna dipendenza)
lib/                    client Graph API, snapshot, dettaglio, proxy immagini, configurazione
public/                 app web: scena 3D (Three.js), interfaccia, grafici
public/js/naming.js     lettura di formato, angolo, persona, creator e hook dai nomi
public/js/funnel.js     posizione nel funnel da segmenti, nomi e consegna
public/js/stacks.js     raggruppamento delle creative simili
public/js/demo/         brand demo e generatore delle creative di esempio
macos/                  finestra nativa (Swift), launcher, icona
install.sh              installer da una riga
tests/                  test (node --test)
```

## Sviluppo

```bash
node server.mjs          # avvia senza aprire il browser
npm test                 # test di logica, server (con una Graph API finta) e MANIFEST
node scripts/manifest.mjs   # aggiorna MANIFEST dopo aver aggiunto file all'app
node scripts/build-demo.mjs # demo statica pubblicabile (solo brand demo)
```

Per cambiare nome all'app: `public/js/brand.js`, `APP_NAME` in `install.sh` e `CFBundleIdentifier` in `macos/Info.plist`.

## Limiti

- La spesa per segmento arriva solo dalle campagne che la riportano (Advantage+ sales con i segmenti di pubblico definiti nelle impostazioni dell'account). Il resto viene stimato e mostrato tratteggiato.
- Il raggruppamento è visivo: due video diversi con la stessa inquadratura iniziale possono finire nella stessa card. La soglia si può rendere più rigida.
- L'installer supporta macOS e Linux. Su Windows serve Node.js 18+ e `node server.mjs --open`.
- La vista disegna fino a 320 card (le più grandi per spesa); la legenda conta comunque tutte le ads.
