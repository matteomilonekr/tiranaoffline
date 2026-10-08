# LinkedIn MCP

Server MCP che permette a Claude (Claude Desktop, Claude Code o qualsiasi client MCP) di scrivere, controllare, programmare e pubblicare contenuti sul tuo profilo LinkedIn usando le API ufficiali di LinkedIn.

Formati supportati:

- post di solo testo
- immagine singola o galleria (2-20 immagini)
- documento / carosello PDF (anche PPT, PPTX, DOC, DOCX)
- video MP4
- articolo / link con anteprima (titolo, descrizione e copertina presi in automatico dalla pagina)
- sondaggio
- repost con commento
- primo commento automatico (utile per mettere il link fuori dal post)

In più: anteprima con il taglio del "…vedi altro", conteggio caratteri e avvisi, conversione automatica di **grassetto**/*corsivo* in Unicode (LinkedIn non supporta il markdown), bozze, programmazione, modifica ed eliminazione dei post pubblicati.

## Tool disponibili

| Tool | Cosa fa |
|---|---|
| `linkedin_get_profile` | Account collegato, scadenza del token, permessi |
| `linkedin_preview_post` | Controlla un post senza pubblicarlo: testo finale, caratteri, anteprima "…vedi altro", avvisi |
| `linkedin_publish_post` | Pubblica subito (testo, immagini, PDF, video, articolo, sondaggio, repost) |
| `linkedin_edit_post` | Modifica il testo di un post già pubblicato |
| `linkedin_delete_post` | Elimina un post |
| `linkedin_add_comment` | Commenta un post o risponde a un commento |
| `linkedin_save_draft` | Crea o aggiorna una bozza, con data di pubblicazione opzionale |
| `linkedin_list_drafts` / `linkedin_get_draft` | Elenca o legge le bozze |
| `linkedin_publish_draft` / `linkedin_delete_draft` | Pubblica o elimina una bozza |
| `linkedin_list_published` | Storico dei post pubblicati da qui, con link |

Prompt pronti (nel menu prompt del client): `write_linkedin_post`, `repurpose_for_linkedin`, `linkedin_content_plan`.

Claude è istruito a mostrarti il testo finale e a pubblicare solo dopo una tua conferma esplicita.

## Installazione

Serve Node.js 20.12 o superiore.

### 1. Crea l'app LinkedIn (una volta sola, ~5 minuti)

1. Vai su <https://www.linkedin.com/developers/apps> e clicca **Create app**.
2. Nome a piacere (es. "Il mio LinkedIn MCP"), associa una tua **Pagina aziendale LinkedIn** (obbligatoria per creare l'app: va bene anche quella della tua attività) e carica un logo.
3. Nella scheda **Settings**, verifica l'app con la pagina aziendale (pulsante **Verify**).
4. Nella scheda **Products** richiedi questi due prodotti (sono gratuiti e attivi subito):
   - **Share on LinkedIn** → permesso `w_member_social` (pubblicare)
   - **Sign In with LinkedIn using OpenID Connect** → permessi `openid`, `profile` (sapere chi sei)
5. Nella scheda **Auth**:
   - copia **Client ID** e **Primary Client Secret**;
   - in **Authorized redirect URLs for your app** aggiungi `http://localhost:8765/callback`.

### 2. Configura e collega il tuo account

```bash
cd linkedin-mcp
npm install
cp .env.example .env      # poi inserisci LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET
npm run auth              # si apre il browser: accedi e autorizza
npm run status            # verifica: nome, scadenza token, permessi
```

Il token viene salvato in `~/.linkedin-mcp/token.json` (leggibile solo dal tuo utente) e dura **60 giorni**: quando scade, rilancia `npm run auth`. `npm run status` ti dice quanti giorni mancano.

Se il browser non riesce a tornare su `localhost` (es. sei su un server remoto) usa `npm run auth -- --manual` e incolla l'indirizzo a cui LinkedIn ti rimanda.

### 3. Collega il server a Claude

**Claude Code**

```bash
claude mcp add linkedin -s user -- node /percorso/assoluto/linkedin-mcp/src/index.js
```

**Claude Desktop**: in *Impostazioni → Sviluppatore → Modifica configurazione* (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "node",
      "args": ["/percorso/assoluto/linkedin-mcp/src/index.js"]
    }
  }
}
```

Riavvia Claude. Il file `.env` viene letto in automatico, non serve ripetere le credenziali nella configurazione.

## Come usarlo

Esempi di richieste a Claude:

- "Scrivi un post LinkedIn sul lancio dell'evento di Tirana, tono diretto, fammi vedere l'anteprima e salvalo in bozza."
- "Pubblica il carosello `~/Desktop/guida-ai.pdf` con questo testo e metti il link alla landing nel primo commento."
- "Trasforma questo articolo in un sondaggio LinkedIn."
- "Prepara il piano editoriale delle prossime 2 settimane, 3 post a settimana alle 8:30, e salvali come bozze programmate."
- "Correggi il refuso nel post che ho pubblicato stamattina."

Scrittura del testo:

- `**grassetto**`, `*corsivo*`, `# titoli` e `* elenchi` vengono convertiti in caratteri Unicode che LinkedIn mostra in grassetto/corsivo (le lettere accentate restano normali). Disattivabile con `markdown: false`.
- Gli hashtag (`#AI`) restano cliccabili.
- Per taggare una persona o un'azienda: `@[Nome](urn:li:person:ID)` o `@[Azienda](urn:li:organization:ID)`.
- Le parentesi e gli altri caratteri speciali vengono gestiti in automatico (senza escape LinkedIn tronca o rovina il testo pubblicato via API).
- Immagini, PDF e video possono essere percorsi locali o URL pubblici.

### Post programmati

LinkedIn non offre la programmazione via API per i profili personali, quindi le bozze con `scheduledFor` vengono pubblicate da `npm run publish-due`. Lancialo periodicamente con cron (il computer deve essere acceso):

```bash
crontab -e
# ogni 15 minuti
*/15 * * * * cd /percorso/assoluto/linkedin-mcp && /usr/bin/env node src/cli.js publish-due >> ~/.linkedin-mcp/cron.log 2>&1
```

Una bozza in pubblicazione viene bloccata per 30 minuti, così due esecuzioni sovrapposte non la pubblicano due volte.

## Limiti delle API LinkedIn da conoscere

- **Statistiche e lettura del feed**: LinkedIn riserva la lettura dei post e delle metriche dei profili personali (`r_member_social`) ai partner approvati. Per questo lo storico (`linkedin_list_published`) è un registro locale dei post pubblicati da qui.
- **Pagine aziendali**: per pubblicare come pagina serve il permesso `w_organization_social`, incluso nel prodotto *Community Management API* che LinkedIn concede su richiesta. Una volta approvato, aggiungilo a `LINKEDIN_SCOPES`, rifai `npm run auth` e passa `author: urn:li:organization:<id>` (o imposta `LINKEDIN_AUTHOR_URN`).
- **Commenti**: a seconda dell'app LinkedIn può richiedere la *Community Management API*. Se il primo commento non passa, il post resta comunque pubblicato e Claude ti mostra l'errore.
- **Anteprima dei link**: le API non generano da sole la card del link; il server legge titolo, descrizione e immagine Open Graph della pagina. Se la pagina non ha un'immagine compatibile (JPG/PNG/GIF) il post esce senza copertina, oppure passala tu con `article.thumbnail`.
- **Versione API**: il server usa la versione `202609`. LinkedIn supporta ogni versione per almeno un anno; quando verrà dismessa, imposta `LINKEDIN_API_VERSION` a una versione più recente.

## Variabili d'ambiente

| Variabile | Default | Descrizione |
|---|---|---|
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | – | Credenziali dell'app, servono per `npm run auth` |
| `LINKEDIN_REDIRECT_URI` | `http://localhost:8765/callback` | Deve coincidere con quello registrato nell'app |
| `LINKEDIN_SCOPES` | `openid profile w_member_social` | Permessi richiesti durante `npm run auth` |
| `LINKEDIN_ACCESS_TOKEN` | – | Token già pronto (es. dal Token Generator di LinkedIn): ha la precedenza sul file |
| `LINKEDIN_AUTHOR_URN` | il tuo profilo | Autore di default dei post |
| `LINKEDIN_API_VERSION` | `202609` | Header `LinkedIn-Version` |
| `LINKEDIN_MCP_HOME` | `~/.linkedin-mcp` | Cartella di token, bozze e storico |

## Sviluppo

```bash
npm test
```

I test simulano le API LinkedIn (nessuna chiamata reale) e coprono formattazione del testo, upload di immagini/documenti/video, articoli, sondaggi, bozze, OAuth e il server MCP via stdio.

Struttura:

- `src/index.js`: avvio del server MCP (stdio)
- `src/server.js`: tool e prompt MCP
- `src/publisher.js`: validazione e pubblicazione dei post
- `src/linkedin.js`: client delle API LinkedIn (Posts, Images, Documents, Videos, Comments)
- `src/text.js`: formattazione, escape del formato "little", analisi del testo
- `src/media.js`: file locali/URL e metadati Open Graph
- `src/drafts.js`, `src/store.js`: bozze, programmazione e salvataggio su file
- `src/auth.js`, `src/cli.js`: OAuth e comandi `auth`, `status`, `logout`, `publish-due`
