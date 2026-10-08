# Hook Vault MCP

Server MCP per creare contenuti LinkedIn partendo da ciò che funziona su Instagram.
Dà a Claude (o a qualsiasi client MCP) accesso a:

- **Database di ganci**: 114 template in italiano con `[segnaposto]` ed esempio già compilato, divisi in 12 tipi (contro-intuitivo, lista, storia, errore, risultato, domanda…) e in 13 nicchie.
- **Database di reel Instagram reali** divisi per nicchia: views, like, commenti, durata, creator, gancio estratto (dalla trascrizione del parlato quando disponibile) e tipo di gancio. Vedi [Dati inclusi](#dati-inclusi).
- **Strumenti LinkedIn**: brief per post di testo, caroselli e video, trasformazione di un reel in post, punteggio dell'apertura prima del "…altro".
- **Ampliamento del database** via [ScrapeCreators](https://scrapecreators.com): nuove ricerche per nicchia, import di singoli reel, trascrizioni.

## Tool

| Tool | Cosa fa | Crediti |
|---|---|---|
| `list_niches` | Nicchie con numero di ganci, reel, trascrizioni e views mediane; tipi di gancio | – |
| `search_hooks` | Cerca ganci per nicchia, tipo e parole chiave (`shuffle_seed` per variare) | – |
| `fill_hook` | Compila i `[segnaposto]` di un gancio con valori reali | – |
| `search_videos` | Cerca reel per nicchia, parole chiave, views minime, lingua, tipo di gancio; ordina per `views`, `outlier`, `engagement`, `recent` | – |
| `get_video` | Reel completo con trascrizione + template LinkedIn dello stesso tipo di gancio | 1 se `fetch_transcript` |
| `niche_report` | Cosa funziona in una nicchia: tipi di gancio nel quartile migliore, durata, creator, top reel | – |
| `analyze_hook` | Classifica un gancio e restituisce template LinkedIn equivalenti e reel simili | – |
| `linkedin_post_brief` | Brief completo: pubblico, struttura per formato, ganci pre-compilati, reel sorgente, regole, CTA per obiettivo | – |
| `score_linkedin_hook` | Punteggio 0-100 dell'apertura + avvisi sul resto del post | – |
| `save_hook` | Salva un tuo gancio nel database personale | – |
| `discover_reels` | Cerca nuovi reel per una nicchia e li aggiunge al database | 1 per pagina (+1 per trascrizione) |
| `import_reel` | Importa un reel specifico da URL, con trascrizione | 1-2 |

**Prompt pronti:** `post-da-reel` (dal reel che ha performato meglio al post LinkedIn) e `piano-settimanale` (piano editoriale per nicchia).

**`outlier_score`** = views del reel ÷ views mediane della sua nicchia. Un reel con 8.0 ha fatto 8 volte la mediana: è il segnale più utile per capire quale gancio ha funzionato *in quella nicchia*, al netto della dimensione dell'account.

## Installazione

Serve Node.js 20 o superiore.

```bash
cd hook-vault-mcp
npm install
npm test
```

### Claude Code

```bash
claude mcp add hook-vault --scope user \
  --env SCRAPECREATORS_API_KEY=la-tua-chiave \
  -- node /percorso/assoluto/hook-vault-mcp/src/index.js
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hook-vault": {
      "command": "node",
      "args": ["/percorso/assoluto/hook-vault-mcp/src/index.js"],
      "env": { "SCRAPECREATORS_API_KEY": "la-tua-chiave" }
    }
  }
}
```

La chiave ScrapeCreators è facoltativa: senza, tutti i tool di lettura funzionano sul database incluso; servono solo per `discover_reels`, `import_reel` e `get_video` con `fetch_transcript`.

### Server HTTP (hosting)

```bash
PORT=3333 HOOK_VAULT_TOKEN=un-token-lungo HOOK_VAULT_DATA_DIR=/data npm run start:http
```

Espone Streamable HTTP su `/mcp` (stateless) e `/health`. Con `HOOK_VAULT_TOKEN` i client devono inviare `Authorization: Bearer <token>`:

```bash
claude mcp add --transport http hook-vault https://tuo-dominio/mcp --header "Authorization: Bearer un-token-lungo"
```

Su hosting serverless il filesystem è temporaneo: monta un volume persistente su `HOOK_VAULT_DATA_DIR` se vuoi conservare ganci salvati e reel importati.

## Variabili d'ambiente

| Variabile | Default | Uso |
|---|---|---|
| `SCRAPECREATORS_API_KEY` | – | Import di reel e trascrizioni |
| `HOOK_VAULT_DATA_DIR` | `~/.hook-vault` | Ganci personali (`user-hooks.json`) e reel importati (`user-videos.json`) |
| `PORT` | `3333` | Porta in modalità HTTP |
| `HOOK_VAULT_TOKEN` | – | Token Bearer richiesto in modalità HTTP |
| `MCP_TRANSPORT` | `stdio` | `http` equivale a `--http` |

## Esempi di richieste a Claude

- *"Quali tipi di gancio funzionano meglio nella nicchia vendite? Dammi 3 template da usare questa settimana."*
- *"Prendi il reel con l'outlier score più alto in ai-tech, leggi la trascrizione e trasformalo in un post LinkedIn per founder di PMI."*
- *"Valuta questa apertura e riscrivila finché non supera 80: …"*
- *"Cerca reel nuovi su 'cold email' per la nicchia vendite, con le trascrizioni dei 3 migliori."*

## Dati inclusi

I file in `data/` sono il database di partenza, in sola lettura:

- `niches.json`: 13 nicchie con pubblico LinkedIn e ricerche Instagram predefinite.
- `hooks.json`: 114 template scritti a mano (50 universali + 5 per nicchia). Sono template, non statistiche: le prove di performance vengono dai reel.
- `videos.json`: reel raccolti con la ricerca reel di ScrapeCreators (risultati indicizzati da Google) a ottobre 2026.

Limiti da conoscere:

- Le views della ricerca reel sono quelle restituite da Instagram al momento della raccolta e cambiano nel tempo. Il campione è quello trovato dalle ricerche per parola chiave, non l'intero Instagram.
- Il tipo di gancio è assegnato con regole (italiano e inglese), non da un modello: va letto come etichetta indicativa.
- I punti di troncamento del "…altro" (circa 140 caratteri su mobile, 210 su desktop) sono indicativi e LinkedIn li modifica nel tempo.

Per aggiornare il database incluso con risposte grezze di ScrapeCreators salvate su file:

```bash
node scripts/import-reels.mjs search --niche marketing --query "marketing tips" risposta.json
node scripts/import-reels.mjs transcripts-dir cartella-con-<shortcode>.txt/
```

## Insieme a Buzzfy

[Buzzfy](https://buzzfy.co/mcp) offre un MCP per gestire il **tuo** account Instagram (statistiche, commenti, DM, pubblicazione) e ricerca reel nel suo playbook. Hook Vault copre la parte che manca lì: il database di ganci e il passaggio da Instagram a LinkedIn. Puoi collegarli entrambi:

```bash
claude mcp add --transport http --scope user buzzfy https://mcp.buzzfy.co/mcp
claude mcp login buzzfy
```

## Struttura

```
src/index.js          avvio stdio / HTTP
src/server.js         tool, prompt e istruzioni MCP
src/store.js          database in memoria, ricerca, report di nicchia
src/hook-types.js     tassonomia e classificatore dei ganci
src/linkedin.js       regole LinkedIn, brief e punteggio apertura
src/normalize.js      normalizzazione delle risposte ScrapeCreators
src/scrapecreators.js client API
scripts/import-reels.mjs  import di risposte salvate nel database incluso
```
