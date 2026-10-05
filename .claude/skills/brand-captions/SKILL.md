---
name: brand-captions
description: Monta video da una cartella di clip grezze e consegna un MP4 finito, pronto da pubblicare o per le ads — taglia pause e ripetizioni, aggiunge sottotitoli con parole evidenziate, hook/opener, titoli, punch word, etichette ed end card nei font, colori e animazioni del brand (letti dal sito o dalla brand guide al primo avvio, poi salvati). Usa questa skill ogni volta che l'utente vuole montare, editare o sottotitolare video o clip (Reels, TikTok, Shorts, ads, talking head, demo prodotto, backstage, girato col telefono), anche se dice solo "monta i video nella cartella X", "aggiungi i sottotitoli", "fammi un reel da queste clip", "edit the videos in my launch-day folder", "caption this clip", oppure vuole cambiare stile, brand, formato o testi di un video già fatto con questa skill.
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/bc.py *) Bash(python3 "${CLAUDE_SKILL_DIR}/scripts/bc.py" *) Bash(python ${CLAUDE_SKILL_DIR}/scripts/bc.py *) Bash(python "${CLAUDE_SKILL_DIR}/scripts/bc.py" *)
---

# Brand Captions

Una cartella di clip grezze entra, un video finito esce: montato (pause e ripetizioni tagliate),
sottotitolato con parole evidenziate, con hook, titoli, punch word, etichette ed end card — tutto
nei font, nei colori e nello stile di animazione del brand. L'utente parla in linguaggio
naturale; tu fai il montatore. Funziona tutto in locale sul computer dell'utente.

## Come parli con l'utente

L'utente spesso non ha mai usato un terminale. Parla nella sua lingua, con frasi brevi e
senza gergo (niente "venv", "ASS", "JSON", "transcript"). Fai una domanda alla volta e solo
quando serve davvero. Una prima volta tipica è così:

> monta i video nella cartella lancio
> ● Ho trovato 6 clip. Un unico video con tutte, o ogni clip per conto suo?
> un video
> ● Un'ultima cosa prima di iniziare. Hai un sito, dei file, una brand guide o qualcosa che posso usare per analizzare il tuo brand e impostare lo stile giusto?
> panificiorossi.it
> ● Fatto. Colori e font sono salvati, non te lo chiederò più.
> ● Finito. lancio.mp4 è nella tua cartella, con sottotitoli e titoli nel tuo stile.

Durante le attese lunghe (installazione, ascolto delle clip, render) scrivi una riga su cosa
sta succedendo e quanto ci vuole circa. Quando uno script fallisce stampa `✗ problema` e
`→ cosa fare`: spiegalo in parole semplici e proponi il passo successivo (vedi
`references/troubleshooting.md`). I dettagli tecnici solo se l'utente li chiede.

## Comandi

Tutto passa da un unico script. Qui sotto `BC` vuol dire:

```
python3 ${CLAUDE_SKILL_DIR}/scripts/bc.py
```

`${CLAUDE_SKILL_DIR}` è la cartella di questa skill (se qui non vedi un percorso vero, usa la
"Base directory" indicata quando la skill viene caricata; metti il percorso tra virgolette se
contiene spazi). Su Windows usa `python` invece di `python3`. Ogni comando stampa i
progressi e chiude con una riga `RESULT {…}` in JSON con i dati utili (percorsi, durate,
errori).

## Il flusso

### 1. Controlla il computer

Esegui `BC doctor`. Se chiude con `READY` vai avanti senza dire nulla.
Se c'è qualcosa da sistemare:

- **Strumenti o modello vocale mancanti** (prima volta): di' all'utente che è una
  preparazione da fare una volta sola (da 1 a 5 minuti, 1-2 GB a seconda del computer) ed
  esegui `BC doctor --install` con il timeout massimo (10 minuti) o in background.
- **FFmpeg mancante**: spiega che serve per lavorare sui video e proponi il comando che
  `doctor` mostra (es. `brew install ffmpeg` su Mac, `winget install --id Gyan.FFmpeg -e`
  su Windows). Chiedi prima di installare. Se il comando richiede la password del computer
  (Homebrew, `sudo`), chiedi all'utente di incollarlo lui nel Terminale e di avvisarti.
- **Python mancante** (`python3: command not found`): su Mac `xcode-select --install`
  oppure `brew install python`; su Windows `winget install Python.Python.3.12`.

### 2. Trova le clip

Se l'utente nomina una cartella ("la cartella lancio"), trovala: percorso esatto, cartella
corrente, poi Desktop, Download, Filmati/Movies, Documenti
(`find ~ -maxdepth 4 -type d -iname "lancio*" 2>/dev/null | head`). Se ce ne sono diverse,
chiedi quale. Poi `BC scan <cartella>`: elenca le clip (durata, formato, audio).
Se l'utente indica un singolo video ("aggiungi i sottotitoli a questo video"), passa
direttamente il file a `prepare`: il risultato sarà `<nome>-edited.mp4` accanto all'originale.

### 3. Un video o uno per clip?

Con più di una clip, se l'utente non l'ha già detto, chiedi: "Ho trovato N clip. Un unico
video con tutte, o ogni clip per conto suo?". Un video = `--mode one`, uno per clip =
`--mode each`. Con una sola clip non chiedere nulla.

### 4. Il brand (solo la prima volta)

`BC brand list` mostra i brand salvati e quello predefinito.

- **C'è un brand predefinito** e nulla fa pensare a un altro → usalo senza chiedere.
- **Più brand salvati** (agenzie, clienti) e non è chiaro quale → chiedi una volta, poi
  passa `--brand <slug>` a `prepare`.
- **Nessun brand** → fai la domanda sul brand (sito, file, brand guide…). Poi segui
  `references/brand-setup.md`: analisi del sito con `BC brand scan <url>` (o lettura dei
  file che ti dà), scelta di stile, colori, font, logo ed end card, salvataggio con
  `BC brand save ~/.brand-captions/brand-draft.json`. Il salvataggio (circa mezzo minuto)
  crea un'immagine di anteprima (`sample` nel RESULT): guardala con lo strumento Read e
  correggi se qualcosa non va (contrasto, logo sbagliato, font poco leggibile, numeri strani).
  Poi conferma con una frase: "Colori e font sono salvati, non te lo chiederò più."
- **Niente sito né file** → salva un brand minimo (`{"name": "<nome>", "style": "clean"}`):
  parte da impostazioni pulite che si possono cambiare dopo.

### 5. Ascolta le clip

```
BC prepare <cartella> --mode one|each [--brand <slug>]
```

Trascrive tutte le clip con i tempi di ogni parola (la prima volta può scaricare il modello
vocale) e scrive la bozza di montaggio: `<cartella>/.brand-captions/plan.json` (un video)
oppure `<cartella>/.brand-captions/plans/<clip>.json` (uno per clip). La lingua viene
riconosciuta da sola; usa `--language it` solo se l'utente lo chiede o il risultato è sbagliato.
Le frasi con `"note": "unsure words: …"` contengono parole capite male con buona probabilità:
correggile in base al contesto.

### 6. Monta: qui sei il montatore

Leggi la bozza e trasformala in un montaggio fatto bene, con il gusto di un video editor
esperto di social. Prima di modificarla leggi `references/editing-guide.md` (come scegliere
hook, punch word, etichette e parole da evidenziare) e `references/plan-format.md` (il formato
esatto, gli ancoraggi temporali e tutte le opzioni). L'essenziale:

- **Correggi la trascrizione** (nomi del brand, prodotti, numeri, punteggiatura) senza
  riscrivere quello che la persona dice: i sottotitoli devono corrispondere all'audio.
- **Ripetizioni ed errori**: la bozza segna già le false partenze probabili
  (`"keep": false` oppure `~~parole tagliate~~`). Verifica e aggiungi quelle che vedi tu;
  le frasi fuori tema ("sta registrando?", "aspetta, rifaccio") vanno tolte.
- **Parole evidenziate**: metti tra `*asterischi*` le parole chiave (numeri, risultati,
  prodotto, contrasti). Poche: circa una ogni due o tre righe di sottotitolo.
- **Ordine delle clip** (un video): se serve, sposta in alto la clip con l'apertura più forte.
- **Sovrapposizioni**: quasi sempre un hook nei primi secondi; punch word nei momenti
  chiave (circa una ogni 6-10 secondi, non di più); etichette nelle demo di prodotto; un
  titolo fisso in alto per i video che spiegano qualcosa; l'end card se il brand ce l'ha
  (è già nella bozza: controlla che la CTA abbia ancora senso, es. un evento già passato).

Modifica il file con lo strumento Edit. Non aggiungere, dividere o unire frasi: cambia solo
`text`, `keep`, `caption`, l'ordine delle clip, le impostazioni e le sovrapposizioni.

### 7. Render e controllo qualità

```
BC render <cartella>/.brand-captions/plan.json        # un video
BC render <cartella> --all                            # uno per clip
```

Il `RESULT` contiene `output` (il video finito) e `preview` (un'immagine con i momenti
chiave). **Guarda sempre l'anteprima** con lo strumento Read prima di dire che hai finito:
testi leggibili e non tagliati, nessun testo sopra un volto o sul prodotto, evidenziazioni
giuste, hook e end card a posto. Se qualcosa non va, sistema il piano e rifai il render
(le parti già tagliate sono in cache, il secondo render è più veloce). Per vedere un
momento preciso più in grande: `BC frames <video> --at 3.2,7.5 --width 720` (immagine nella
cartella di lavoro, mai tra le clip dell'utente).

### 8. Consegna

Messaggio breve: dove si trova il video e una riga su cosa hai fatto, ad esempio
"Finito. lancio.mp4 è nella tua cartella: ho tolto 14 secondi di pause e una ripetizione,
aggiunto l'hook «Monto i video in 2 minuti» e la scheda finale con il tuo sito."
Poi chiedi se vuole cambiare qualcosa.

## Richieste successive

Le modifiche si fanno sul piano e poi `BC render` di nuovo, senza riascoltare le clip:

| L'utente chiede | Cosa cambi |
|---|---|
| sottotitoli più grandi / più piccoli | `settings.caption_size` (es. 1.15 / 0.9) |
| sottotitoli più in alto / più in basso | `settings.caption_y` (0-1, normale ≈ 0.70) |
| tutto minuscolo / maiuscolo | `settings.case`: `lower` / `upper` / `as-is` |
| parola evidenziata mentre la dice | `settings.highlight`: `active` (o `both`) |
| tagli meno stretti / non tagliare le pause | `settings.cut`: `natural` / `none` |
| niente zoom sui tagli | `settings.zoom_cuts: false` |
| formato quadrato / 4:5 / orizzontale | `format`: `1:1` / `4:5` / `16:9` |
| musica di sottofondo | `settings.music: {"file": "brano.mp3"}` (`"volume"`: 1 = normale, 0.5 più bassa, 1.5 più alta) |
| togliere la scheda finale | togli l'overlay `endcard` (o `"enabled": false`) |
| file dei sottotitoli | `settings.srt: true` (crea un .srt accanto al video) |
| cambiare colori, font, logo, CTA | aggiorna il brand (`references/brand-setup.md`) e rifai il render |
| nuovo cliente / altro brand | nuovo profilo brand, poi `prepare --brand <slug>` |

Se l'utente aggiunge clip alla cartella, rifai `prepare` (le clip già ascoltate restano in
cache; il piano precedente viene salvato come `plan.prev.json`, riporta le tue modifiche).

## Dove stanno le cose

- Video finiti: nella cartella delle clip (`<nome cartella>.mp4`) o in `edited/` (uno per clip).
- File di lavoro: `<cartella>/.brand-captions/` (si può cancellare con `BC clean <cartella>`).
- Brand, impostazioni, modello vocale, strumenti: `~/.brand-captions/`.
