# Motion as Code

**Workflow guide / starter kit.** Motion graphics fatte con il codice e guidate da una voce fuori campo, senza aprire After Effects. Copia la cartella nel tuo progetto, avvia l'anteprima, lancia il prompt demo. Con lo stesso kit puoi fare anche il film di lancio di un prodotto in 60 secondi: struttura, prompt e regole sono nella [sezione 06](#06--launch-film-dal-prodotto-al-film-in-60-secondi).

`1920×1080 · 60 fps · TypeScript + three.js · bun + Vite` · Motore visivo: [pdoom-video](https://github.com/mexicat/pdoom-video) di mexicat (MIT), vedi [Crediti](#crediti-e-licenza).

---

## 01 · Panoramica: cosa contiene

Il kit è un esempio completo e funzionante del flusso **prompt → codice → render → video**. Produce un video esplicativo in italiano di 97,7 secondi, 1920×1080 a 60 fps. La voce fuori campo comincia così: *"E se ti dicessi che puoi creare motion graphics come questa senza nemmeno aprire After Effects?"*

Niente è animato a mano con i keyframe. Ogni scena (una **tavola**, in inglese *plate*) è un file TypeScript che disegna ogni fotogramma come funzione del tempo. I tempi delle singole parole della voce dicono a ogni tavola quando animarsi, quindi l'immagine resta agganciata alla voce.

Siccome è tutto codice, puoi chiedere a Claude di cambiare l'animazione e poi ri-renderizzare. Può essere un colore, una velocità, una transizione o una tavola nuova: non devi spostare centinaia di keyframe.

| 1 · Voce | 2 · Allineamento | 3 · Tavole | 4 · Anteprima | 5 · Render | 6 · Suono |
|---|---|---|---|---|---|
| `audio/voiceover.mp3` | `align_vo.py` `audio_vo.py` | `scenes/*.ts` `timeline.ts` | vite `:5173` | `render.ts` Chrome, ffmpeg | `sfx_mix.py` mux ffmpeg |

Ogni fotogramma è una funzione pura del tempo, quindi l'anteprima nel browser e l'MP4 esportato sono identici.

Per ri-temporizzare il video, cambia la voce e rilancia il passo 2: le tavole ritrovano le loro parole per contenuto.

---

## 02 · Setup: installazione in cinque minuti

**Cosa c'è nella cartella.** `motion-as-code/` è autosufficiente. Copiala così com'è nella cartella del tuo progetto, mantenendo la struttura, perché gli script usano percorsi relativi.

| Cartella / file | A cosa serve |
|---|---|
| `app/` | Il renderer: motore, tavole, timeline, font, script di render. |
| `audio/` | La voce fuori campo e i 28 effetti sonori. |
| `data/` | Tempi delle parole e analisi audio già calcolati: puoi vedere l'anteprima subito. |
| `analysis/` | Script di allineamento, mix degli effetti, effetti procedurali e voce demo (`tts/`). Il modello ONNX di allineamento (~320 MB) va in `analysis/models/` e serve solo per allineare una voce nuova: lo crea una volta `export_model.py`. |
| `README.md`, `LICENSE.pdoom-engine`, `.claude/` | Questa guida, la licenza del motore, la configurazione di anteprima con un clic. |

Restano fuori dal repository `out/` (i render), `app/node_modules/` (lo ricrea l'installazione) e `analysis/models/`. In questo repository la cartella è esclusa anche dal deploy Vercel (`.vercelignore`).

**Requisiti.**

- **bun** ([bun.sh](https://bun.sh)): installa i pacchetti ed esegue gli script.
- **Google Chrome**: il renderer lo pilota in modalità headless per disegnare i fotogrammi. Va bene anche un altro Chromium, vedi [Problemi](#12--aiuto-problemi-e-crediti).
- **ffmpeg** con libx264: trasforma i fotogrammi in MP4 e mixa il suono.
- **Python + [uv](https://docs.astral.sh/uv/)**: serve solo per allineare una voce nuova, rifare il mix degli effetti o generare una voce demo. I comandi qui sotto usano `uv run …`; se hai installato uv con pip, scrivi `python -m uv run …`.

Primo avvio, dalla cartella `motion-as-code/`:

```sh
cd app
bun install
bunx vite
```

Apri `http://localhost:5173` e premi spazio per far partire il video insieme alla voce. Se più avanti il render non trova Chrome, vedi [Problemi](#12--aiuto-problemi-e-crediti).

---

## 03 · Workflow: passo per passo

### 1. Anteprima (live)

L'anteprima è il ciclo veloce. Modifichi il file di una tavola, la pagina si ricarica da sola e scorri fino al momento che hai cambiato.

| Tasto | Azione |
|---|---|
| spazio | play / pausa |
| ← / → | ±1 s (5 s con shift) |
| `,` e `.` | un fotogramma indietro / avanti |
| `[` e `]` | tavola precedente / successiva |
| `l` | loop della tavola corrente |
| `h` | nasconde l'interfaccia |
| `f` | schermo intero |
| `m` | muto |

Parametri dell'URL:

- `?t=35` parte da 35 s.
- `?mix=1` suona il mix completo (`out/mix.wav`, passo 4: voce, effetti e base musicale) al posto della sola voce.

### 2. Controlla singoli fotogrammi mentre lavori

```sh
cd app
bun scripts/render.ts stills --t 41.5,47 --only code --out ../out/wip
```

Renderizza singoli fotogrammi, qui la tavola `code` a 41,5 s e a 47 s, così puoi controllare un dettaglio senza renderizzare tutto il video. Con `--only` si carica solo quella tavola, quindi è più veloce.

`bun scripts/render.ts sheet --from 50 --to 57 --n 12` mette 12 fotogrammi in un foglio provini. Con `--cuts` prende quattro fotogrammi attorno a ogni taglio.

### 3. Renderizza il video

```sh
cd app
bun run render
```

È lo script npm di `package.json`. Usa il motion blur automatico (da 4 a 12 sotto-fotogrammi), shutter 0.5 e CRF 17, e scrive `out/motion-as-code.mp4`. Flag utili:

| Flag | Effetto |
|---|---|
| `--samples 4` | Bozza più veloce: nei movimenti rapidi si vedono copie a scatti. |
| `--samples auto` | Più sotto-fotogrammi dove il movimento è veloce (default dello script). |
| `--scale 2` | 4K, 3840×2160. |
| `--workers 1` | Un solo Chrome alla volta (default 2). Usalo su una macchina senza GPU, vedi [Problemi](#12--aiuto-problemi-e-crediti). |
| `--from 50 --to 57` | Solo un intervallo, in secondi. |
| `--fps 30` | 30 fotogrammi al secondo invece di 60: metà del tempo, lo standard dei film di lancio. |

### 4. Suono: effetti, musica e mix

Tutto il suono è sintetizzato, nessun campione esterno:

- **Effetti:** in `audio/sfx` ci sono 28 effetti sonori, generati da `analysis/make_sfx.py`. In `analysis/sfx_mix.py` c'è un cue sheet di circa 570 cue, ricavato dagli stessi tempi delle parole che usano le tavole.
- **Musica:** la base a 120 bpm di `analysis/music.py` (cassa, hi-hat in levare, clap sul 2 e sul 4, basso e pad su La minore – Fa – Do – Sol) è arrangiata sugli stessi momenti. Parte sulla rivelazione, si ferma secca sul ⏎ del prompt, riparte sul taglio "folle", respira sotto le spiegazioni, resta sola col pad sulla domanda finale e viene tagliata dall'implosione.
- **Mix:** la voce passa da un passa-alto a 80 Hz e da un compressore leggero (3:1 sopra -20 dB). Effetti e musica condividono una stanza di riverbero e si abbassano sotto la voce, fino a 7 dB gli effetti e fino a 9 dB la musica. Il mix è normalizzato a -14 LUFS, il volume a cui normalizzano Instagram e YouTube, con true peak sotto -1,5 dBTP.

Non serve ri-renderizzare: rifai il mix, poi copi l'immagine e aggiungi l'audio.

```sh
uv run --no-project --with numpy python analysis/sfx_mix.py
cd out
ffmpeg -i motion-as-code.mp4 -i mix.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -shortest motion-as-code_sfx.mp4
```

Per alzare o abbassare un effetto cambia il suo valore in dB nel cue sheet; per spostarlo cambia la sua espressione di tempo. Per l'arrangiamento della musica modifica `arrangement()` in `music.py`, per il suo volume `MUSIC_DB` in `sfx_mix.py`. `--list` stampa tutti i cue, `--no-music` fa il mix senza base, `--stems cartella` scrive anche voce, effetti e musica separati, per rifinire il mix in un editor.

### 5. Cambia la voce

1. Sostituisci `audio/voiceover.mp3`.
2. Aggiorna `SCRIPT` in `analysis/align_vo.py`. In `SPOKEN` scrivi come si pronunciano numeri, sigle e parole inglesi: per esempio `mcp → "emme ci pi"`, `3d → "tre di"`, `keyframe → "chifreim"`.
3. Solo la prima volta, crea il modello di allineamento:
   ```sh
   uv run --no-project --with torch --with transformers --with onnx --with onnxruntime python analysis/export_model.py
   ```
4. Rilancia allineamento e analisi audio:
   ```sh
   uv run --no-project --with onnxruntime --with numpy python analysis/align_vo.py
   uv run --no-project --with numpy python analysis/audio_vo.py
   ```

Le tavole trovano le loro parole per contenuto (`lineOf`, `phraseOf`, `wordOf`). Se tieni lo stesso testo, ogni animazione si ri-temporizza da sola sulla nuova lettura.

**Una voce italiana gratis, in locale.** La voce del demo è sintetica, generata con [Qwen3-TTS](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base) (Apache 2.0) da `analysis/tts/voice.py`. Il procedimento:

1. Descrivi a parole la voce che vuoi.
2. Il modello legge tutto il testo in una sola ripresa.
3. Da quella ripresa ritagli 7–8 secondi puliti come riferimento.
4. Con quella voce di riferimento, ogni riga viene generata a parte, ciascuna con il suo seed.
5. Whisper ricontrolla le righe e lo script le monta in `audio/voiceover.mp3`.

I comandi sono in testa allo script e i testi in `analysis/tts/lines.json`, con le grafie che il modello legge correttamente.

Per il ritmo di un reel, `assemble` accetta due opzioni. `--tighten 0.2` accorcia a 0,2 s le pause dentro ogni riga. `--tempo 1.3` accelera tutta la lettura del 30% senza alzare il tono (Rubber Band, tramite ffmpeg).

### 6. Taglio verticale per Reel e Shorts

```sh
python3 analysis/vertical.py
```

Prende `out/motion-as-code_sfx.mp4` e scrive `out/motion-as-code_9x16.mp4` (1080×1920), senza ri-renderizzare:

- il film sta a tutta larghezza, su una copia di sé sfocata e scurita;
- sotto, la voce diventa didascalie karaoke grandi: ogni parola si accende in arancio mentre viene detta, per chi guarda senza audio;
- tutto il testo resta fuori dai 250 px in alto e dai 350 px in basso, dove Instagram mette i suoi pulsanti e le sue didascalie;
- le frasi lunghe vanno a capo in pagine di due righe al massimo, mai su un articolo o una preposizione.

`--video` e `--out` scelgono i file; serve solo Python 3 e un ffmpeg con libass.

### 7. Controllo finale prima di consegnare

```sh
uv run --no-project --with numpy --with pillow python analysis/qc.py out/showreel_sfx.mp4 --film showreel --sec 20
```

Controlla il file finito, quello con il suono, e scrive `out/<film>/qc/`:
- `report.md`: cosa passa e cosa no, con i secondi;
- `sheet.jpg`: un fotogramma al secondo;
- `board.jpg`: ogni taglio e ogni transizione, da 0,3 s prima a 0,3 s dopo.

Esce con errore se qualcosa non va.

| Controllo | Cosa vuole |
|---|---|
| `format-*` | la misura del film (1080×1920 o 1920×1080), fps costanti, H.264 + AAC in yuv420p, la durata entro il 5% di `--sec` |
| `loudness` | -14 LUFS integrati (±1) e un picco vero non oltre -1 dBTP |
| `no-flat-frames` | niente nero, bianco o un colore solo per più di 0,1 s: lo schermo non resta mai vuoto. Avvisa anche dei lampi più brevi. |
| `no-freeze` | niente che stia fermo per più di 2 s. Il confronto si fa con la grana sfocata via, perché la grana del post cambia a ogni fotogramma e un'inquadratura bloccata sotto la grana resta bloccata. |

Un momento voluto (lo stacco dal nero dell'apertura, un flash su un taglio, il cartello finale che resta) va in `films/<film>/qc.json`, così non conta come errore:

```json
{ "allow": [[17.95, 18.25, "il flash bianco sul taglio dell'outro"]] }
```

Con `--allow 17.8-18.4` lo fai una volta sola, da riga di comando.

Quello che un programma non vede lo guardi tu, sul foglio e sulla lavagna dei tagli:
- **Testo dentro i margini:** almeno il 5% dai bordi, mai tagliato, mai sopra un altro testo per sbaglio.
- **Testo leggibile:** contrasto di almeno 4,5:1 con quello che ha dietro, e a schermo abbastanza a lungo da leggerlo due volte (circa parole ÷ 3 + 1 secondi).
- **Parole giuste:** nomi, numeri e grafia controllati sulle fonti. Niente che le fonti non dicano.
- **Sincrono:** ogni parola chiave arriva con la sua immagine entro 2 fotogrammi; i colpi della musica cadono sui tagli.
- **Ogni fotogramma ha senso:** nessun mezzo secondo vuoto dopo un taglio, nessuna transizione che passa da un fotogramma rotto.

Quando trovi un errore nuovo, aggiungilo a questa lista: diventa una regola del tuo studio per i prossimi video.

---

## 04 · Riferimento: come si incastra il progetto

| Percorso | Ruolo |
|---|---|
| `audio/voiceover.mp3` | La voce fuori campo (sintetica, vedi sopra). |
| `audio/sfx/` | I 28 effetti sonori (`analysis/make_sfx.py`, sintesi procedurale in numpy). |
| `data/lyrics.json` | Tempi parola per parola, prodotti da `align_vo.py`. Usa il forced alignment CTC con wav2vec2 (ONNX quantizzato) e li rifinisce sui silenzi dell'audio. |
| `data/audio.json` | Inviluppi di volume della voce, attacchi di parole e sillabe, griglia di battute nominale. Prodotto da `audio_vo.py`. |
| `app/src/engine/` | Il motore di pdoom-video (WebGL, post-processing, tipografia, tratti). Non toccarlo. |
| `app/src/scenes/_vo.ts` | Toolkit condiviso: camera 2D, la penna del plotter, parole karaoke nello spazio della scena, carta millimetrata. |
| `app/src/scenes/*.ts` | Le nove tavole. |
| `app/src/timeline.ts` | Quando suona ogni tavola. I tagli cadono nella pausa subito prima di ogni frase. |
| `app/scripts/render.ts` | Renderer offline: Chrome headless → fotogrammi grezzi → ffmpeg. |
| `analysis/sfx_mix.py`, `analysis/music.py` | Cue sheet degli effetti, base musicale e mix (voce, stanza, ducking, -14 LUFS). |
| `analysis/vertical.py` | Il taglio verticale 1080×1920 con le didascalie karaoke. |
| `edit/` | Edit as code: `edit.py` monta un reel da una registrazione seguendo una EDL, `transcribe.py` fa la trascrizione con i tempi delle parole. |
| `app/public/plates/`, `app/plates.json` | Miniature delle tavole per la pellicola della tavola `frames` (`bun scripts/render.ts plates`). |

### Le nove tavole

| Tavola | Tempo (s) | Testo |
|---|---|---|
| hook | 0,0 – 12,5 | E se ti dicessi… / E no, non è un MCP per After Effects |
| model | 12,5 – 20,6 | Questo è Claude Code / Invece di controllare After Effects… |
| prompt | 20,6 – 33,1 | Per esempio: "Crea una sequenza cinematografica…" |
| crazy | 33,1 – 39,0 | Ed è qui che diventa folle / non genera direttamente un MP4 |
| code | 39,0 – 50,5 | Scrive l'animazione stessa, come codice… definito matematicamente nel tempo |
| frames | 50,5 – 57,1 | Renderizzata fotogramma per fotogramma e trasformata in un video |
| pipeline | 57,1 – 67,4 | After Effects, livelli, keyframe… contro prompt, codice, render, video |
| edits | 67,4 – 86,8 | Procedurale / i quattro comandi / centinaia di keyframe |
| verdict | 86,8 – 97,7 | Sostituisce After Effects? Non proprio… è pazzesco (torna in loop al fotogramma 0) |

### Scrivere o modificare una tavola

Una tavola è una classe che estende `Scene` (`app/src/engine/scene.ts`) ed è esportata come default. La regola che conta: **tutto deve essere una funzione deterministica del tempo**. Il motore chiama `render(f, out)` una volta per fotogramma con:

- `f.t` tempo della voce, `f.lt` tempo dall'inizio della tavola, `f.p` avanzamento da 0 a 1 nella tavola;
- `f.a` le caratteristiche audio in quel momento (inviluppo della voce, impulsi);
- `f.seeked` vero dopo uno scrub: le tavole con stato si azzerano lì.

Per aggiungere una tavola crea `app/src/scenes/latuatavola.ts`, poi aggiungi a `timeline.ts` una riga `E('latuatavola', 'latuatavola', inizio, fine)`. I tempi d'inizio vengono dal testo: per esempio `cut('Questo è Claude Code')` taglia 0,18 s prima della prima parola di quella frase.

Il prompt d'esempio mostrato nel video, nella tavola *prompt*, prende la scomposizione in token da `app/src/scenes/prompt-data.ts`. Modifica quel file per cambiare le parole e i token candidati che mostra.

---

## 05 · Prompt demo: copia questo in Claude

Dopo aver copiato la cartella nel tuo progetto, apri Claude in quella cartella e invia il prompt qui sotto. Il prompt:

1. verifica l'installazione;
2. fa una modifica visibile;
3. ti guida a usare la tua voce.

Non viene renderizzato niente per intero senza il tuo permesso.

```text
Ho aggiunto il progetto "Motion as Code" in motion-as-code/. Leggi prima motion-as-code/README.md,
poi app/src/timeline.ts e app/src/engine/scene.ts, così capisci come funzionano tavole e tempi.

Passo 1 - verifica:
  cd motion-as-code/app, esegui bun install, avvia l'anteprima con bunx vite e conferma che il video
  parte su localhost:5173 senza errori in console. Dimmi cosa vedi.

Passo 2 - una piccola modifica per provare che funziona:
  Nella tavola 'verdict' (app/src/scenes/verdict.ts), fai restare lo slam finale a tutto schermo
  "PAZZESCO." 0,3 s in più prima dell'implosione. Deve restare una funzione pura del tempo e il loop
  al fotogramma 0 deve restare intatto. Renderizza un fotogramma nel nuovo momento con:
  bun scripts/render.ts stills --t 95.8 --only verdict --out ../out/wip
  e mostramelo.

Passo 3 - rendilo mio:
  Chiedimi la mia voce (mp3) e il testo. Poi aggiorna analysis/align_vo.py (SCRIPT e SPOKEN), rilancia
  allineamento e analisi audio, e dimmi quali tagli in timeline.ts hanno bisogno di nuove frasi di ancoraggio.

Regole: non modificare app/src/engine/. Non lanciare il render completo in 4K senza chiedermelo.
Spiega ogni modifica in una o due frasi prima di farla.
```

Il passo 2 tocca la costante `HOLD` di `verdict.ts`, oggi 0,4 s. A 95,8 s oggi le lettere stanno già collassando verso la scintilla; con 0,3 s in più la scritta è ancora ferma a tutto schermo.

### Idee per i tuoi prompt successivi

- "Rendi più morbida e più lenta la transizione verso la tavola *code*."
- "Cambia il colore d'accento da arancio segnale a blu elettrico ovunque."
- "Rallenta del 20% la tavola *pipeline* senza cambiare i tempi della voce."
- "Aggiungi una nuova tavola tra *frames* e *pipeline* che mostra una barra di caricamento."
- "Renderizza tutto il video con --samples 4 come bozza veloce."

Il prompt d'esempio letto nel video è questo: *"Crea una sequenza cinematografica di quindici secondi, con tipografia cinetica, transizioni fluide tra le forme, elementi 3D e movimenti di camera continui."* Puoi incollarlo in Claude per provare l'idea così com'è.

---

## 06 · Launch film: dal prodotto al film in 60 secondi

Lo stesso kit fa anche il film di lancio di un prodotto: 60 secondi a 1920×1080, tutto disegnato dal codice. Interfaccia, inclinazioni 3D, vetro, personaggio e suoni nascono dal codice: niente generatori di immagini o video, niente stock, niente registrazioni dello schermo. Metodo, struttura e prompt vengono dalla guida *The 60-second launch film made with Claude* di Saksham Gupta, adattati a questo kit.

**Una differenza con la guida originale.** Lì l'immagine viene prima e la voce si scrive alla fine, sul montaggio. Qui comanda la voce:

1. scrivi il copione insieme al beat sheet, una frase breve per beat;
2. generalo e allinealo;
3. ogni tavola parte sulla sua frase.

Per allungare un beat allunghi la pausa nella voce, non sposti keyframe. Con la voce locale la pausa è il campo `pause` in `analysis/tts/lines.json`.

### La struttura: Problema → Soluzione → Showcase → CTA

Ogni secondo ha un compito. Se uno sconosciuto non capisce a cosa serve nel primo secondo, tutto il resto non conta.

| Atto | 60 s | 40 s | Cosa succede | Tecniche |
|---|---|---|---|---|
| 1 · Problema | 0–12 | 0–8 | Apri sul dolore di chi guarda, non sul tuo logo. Tipografia cinetica su un caos visivo: carte, chiamate, riunioni che si sovrappongono, un badge che conta fino a 99+. Chiudi su una frase che nomina il dolore. | testo mascherato · glitch · camera shake · implosione |
| 2 · Soluzione | 12–19 | 8–13 | Il caos collassa in un punto e il punto diventa il logo, con nome e promessa in una riga. La finestra del prodotto sale in 3D: è il ponte verso la demo. | morph di forme · riflesso che scorre · lettere con overshoot · tilt prospettico |
| 3 · Showcase | 19–49 | 13–32 | Funzioni usate, mai elencate. Un cursore scrive, clicca e trascina; la camera fa un push-in di 2× su ogni azione; ogni beat porta al successivo. | typing · volo ad arco · drag con sollevamento e tilt · contatori · follow-cam · anelli di hover |
| 4 · CTA | 49–60 | 32–40 | Tre payoff brevi, poi logo, tagline e una sola azione. Si ricollassa nel punto, così il film va in loop. | reveal mascherati · caos → ordine · lettere che salgono · loop |

Il taglio da 40 secondi ha gli stessi compiti con meno funzioni: tre invece di quattro.

### I riferimenti: Claude non può indovinare il tuo prodotto

È il passo che quasi tutti saltano, ed è per questo che i video fatti con l'AI sembrano template. Claude non mette mai i tuoi screenshot nel film: li legge e ricostruisce ogni schermata in codice, con lo stesso layout, le stesse etichette e lo stesso tipo di dati, ma animabile. Prepara la cartella prima di aprire Claude:

```text
refs/
  screenshots/   ← 10–20 schermate, nominate per schermata: 03-pipeline.png
  logo.svg
  brand.md       ← cinque righe: colori, font, un aggettivo per il feeling, cosa evitare
  voice.mp3      ← arriva dopo
```

| Riferimento | Perché serve | Esempio |
|---|---|---|
| **Indispensabili** | | |
| 10–20 screenshot | Layout, etichette, gerarchia, la forma dei tuoi dati. Uno per ogni schermata che vuoi nel film. | le schermate del prodotto |
| Logo | La rivelazione e la card finale. SVG se ce l'hai. | icona dell'app + marchio |
| Colori e font | Ogni fotogramma resta nel tuo brand invece del solito "viola da AI". | nero #050605, accento #A8F25A, Inter Tight |
| Il dolore, in una riga | Diventa i primi 12 secondi. | "I team lavorano su strumenti che non si parlano" |
| 3–5 funzioni, in ordine | Diventano lo showcase. Ordinale come una storia, non come un menù. | lead → task → portale clienti → analytics |
| Per chi è | Tono, testi ed esempi a schermo. | titolari di agenzia |
| Una call to action | L'ultimo fotogramma. Una sola. | "Prenota una demo" |
| **Utili** | | |
| Un film di riferimento | Ritmo e stile del movimento. | "un video di lancio in stile Apple" |
| Schermate che non hai | Descrivile a parole, Claude le disegna coerenti. | il portale clienti, solo descritto |
| Un personaggio | Qualcosa che porti la storia da un beat all'altro. | "un piccolo pet rotondo e lucido" |
| Direzione della voce | Accento, energia, uso. | voce femminile, calda, tono da demo |

> **Metti questa riga in ogni brief:** «Usa gli screenshot solo come riferimento. Non mostrarli mai. Ricostruisci ogni componente da zero, in codice.»

Gli screenshot possono contenere nomi e numeri veri dei tuoi clienti: chiedi a Claude segnaposto inventati, perché gli serve solo la *forma* dei dati.

### Il master prompt

Sostituisci quello che sta tra [parentesi quadre]. Allega screenshot e logo nello stesso messaggio. Claude risponde con un beat sheet: correggilo, approvalo, poi scrivi «costruiscilo».

```text
Sei un motion designer senior che fa film di lancio in stile Apple. Costruisci un film di lancio di [60]
secondi per il mio prodotto, interamente in codice, con il kit Motion as Code di questa cartella (leggi
prima motion-as-code/README.md): niente modelli di immagini o video, niente stock, niente registrazioni
dello schermo.

PRODOTTO
- Nome: [Nome]
- Cos'è, in una riga: [...]
- Per chi è: [...]
- Il dolore di oggi: [...]
- Il risultato: [...]
- Call to action: [...]

RIFERIMENTI (in refs/)
- [12] screenshot del prodotto. Studiali per layout, etichette, dati e gerarchia. Usali SOLO come
  riferimento: non mostrarne mai uno nel film. Ricostruisci ogni schermata e ogni componente da zero, in codice.
- Schermate che non ho ancora: [...]. Disegnale coerenti con le altre.
- Logo: [refs/logo.svg]. Colori: [sfondo #..., accento #...]. Font: [...].
- Look: [nero, vetro con bordo nel colore d'accento, profondità 3D, accenti liquidi e glitch].
- Feeling: [un film di lancio Apple: calmo, premium, preciso].
- I dati a schermo devono essere inventati: [nomi, clienti, importi].

STORIA: Problema → Soluzione → Showcase → CTA
Chi guarda deve capire "[...]" entro il primo secondo della soluzione.
1. Problema [0-12 s]: apri sul dolore, non sul logo. Tipografia cinetica e caos visivo fatto di [...].
   Chiudi su una frase che nomina il dolore.
2. Soluzione [12-19 s]: il caos collassa in un punto che diventa il logo; nome del prodotto + una
   promessa in una riga; la finestra del prodotto sale in 3D.
3. Showcase [19-49 s]: mostra [4] funzioni USATE, in quest'ordine: [...]. Un cursore causa ogni
   reazione e ogni beat nasce dal precedente.
4. CTA [49-60 s]: tre payoff brevi, poi logo, tagline e CTA. Chiudi sullo stesso punto, così il film va in loop.

REGOLE DI MOVIMENTO
- Una tavola per beat in app/src/scenes/, ognuna funzione pura del tempo; i tagli in app/src/timeline.ts,
  ancorati alle frasi della voce. Non modificare app/src/engine/.
- Niente slideshow: ogni beat cresce dal precedente. Tagli netti solo dove significano qualcosa.
- Tipografia cinetica con reveal mascherati; morph di forme; superfici di vetro con bordo [accento];
  grana e vignetta.
- Una mossa di camera per azione: push-in di ~2× sul campo che si compila o sulla card trascinata,
  segui il cursore con un leggero ritardo, poi torna indietro. Un anello di hover su ciò che il cursore
  sta per toccare.
- I numeri contano, le barre crescono: niente appare e basta. Tutto ciò che la voce nomina è almeno
  26 px a schermo dopo lo zoom.
- Easing: outExpo per gli ingressi, inOutCubic per camera e cursore, outBack per pop e barre.

SUONO
- Gli effetti nel cue sheet di analysis/sfx_mix.py, generati dagli eventi del cursore e della timeline, così
  restano in sync se cambiano i tempi: sweep del cursore, mouse down/up a ogni click, un tick per carattere
  scritto, pickup e drop, notifiche, tick dei contatori, whoosh sulle transizioni, boom + riser sulla
  rivelazione del logo, carta e telefoni nel caos.
- La base a [120] bpm di analysis/music.py dalla rivelazione in poi, riarrangiata sui nuovi beat. Una sola
  stanza di riverbero, così tutto suona nello stesso spazio. Lascia spazio alla voce.

CONSEGNE
1. PRIMA: il beat sheet (intervallo · cosa c'è a schermo · tecnica di motion · testo a schermo · frase della
   voce) e quale screenshot ricostruisce ogni beat dello showcase. Poi fermati e aspetta il mio OK.
2. Poi: il copione della voce, una frase breve per beat, con i tag di ElevenLabs tra [parentesi quadre].
3. Quando ti do la voce: allineamento, tavole, timeline, effetti e musica.
4. Poi: 6 fotogrammi nei momenti chiave, così rivedo senza guardare tutto il film.
```

**Come usarlo bene:**
- **Non saltare il beat sheet.** Correggere una tabella costa un messaggio; correggere un film renderizzato ne costa venti.
- **Rivedi fotogrammi, non tutto il film:** «stills a 1.5, 12, 25, 38, 50, 58».
- **Dopo la prima versione, una cosa per messaggio.** Le riscritture grandi rompono i tempi.
- **Nomina quello che ti è piaciuto.** «Tieni il riflesso della rivelazione» funziona meglio di «miglioralo».
- **Chiedi varianti, mai sovrascritture.** «Salvala come v2», su un branch git o in una copia della tavola, tiene al sicuro la versione buona.
- **Per il taglio da 40 secondi** cambia [60] in [40] e riduci lo showcase a [3] funzioni.

### Passo per passo, se preferisci il controllo alla velocità

Il master prompt è la versione in un colpo solo. Questa è la versione lenta: otto prompt più piccoli, con una revisione dopo ognuno.

1. **Riscaldamento (opzionale).** Chiedi uno showreel di 15 secondi come tavola del kit, con tempi fissi e ogni tecnica che Claude sa fare: tipografia cinetica con squash & stretch, morph, griglie, vetro e morph liquidi, glitch, tilt 3D, reveal mascherati, contatori, un logo sting, un effetto su ogni colpo. Poi chiedi la lista delle tecniche con il loro timestamp: dopo potrai dire «usa il riflesso di 0:07» invece di descriverlo a parole.
2. **Brief + beat sheet + copione.** Allega screenshot e logo, racconta prodotto, dolore, storia e CTA, chiedi il beat sheet con la frase della voce per ogni beat e aspetta. La storia si blocca prima di una sola riga di codice: quasi tutti i video AI brutti sono buon codice che non racconta niente.
3. **La voce.** Genera il copione approvato con ElevenLabs, usando i tag, oppure in locale con `analysis/tts/voice.py`. Mettilo in `audio/voiceover.mp3`, aggiorna `SCRIPT` e rilancia allineamento e analisi (passo 5 del workflow).
4. **Costruisci.** Una tavola per beat e i tagli in `timeline.ts` sulle frasi.
   - Dati inventati ma realistici.
   - Nessuna dissolvenza da slideshow.
   - Il testo detto dalla voce deve essere almeno 26 px dopo lo zoom.

   Poi chiedi fotogrammi a 1.5, 12, 25, 38, 50 e 58 s.
5. **Suono.** Gli effetti vanno nel cue sheet e nascono dagli eventi del cursore e della timeline:
   - sweep, mouse down/up su ogni click, un tick per carattere;
   - pickup e drop, notifiche, tick dei contatori;
   - whoosh sui movimenti, boom + riser sul logo;
   - carta e telefoni nel caos, glitch dove l'immagine si rompe.

   La base di `music.py` parte dalla rivelazione, riarrangiata sui nuovi momenti. Il clic che senti è metà della sensazione "premium": la musica stock non si sincronizza col tuo cursore, il suono sintetizzato sì.
6. **Camera e rifinitura (salvala come v2).**
   - Quando un campo si compila o una card viene trascinata: push-in di ~2× su quel punto, segui il cursore con 0,1 s di ritardo, poi torna indietro.
   - Un anello di hover nel colore d'accento su ciò che il cursore sta per toccare: entra in 0,24 s, esce in 0,22 s.
   - Il cursore segue un percorso ad arco, con scie di motion blur, uno squash quando preme e un ripple al click.
   - Un leggero galleggiamento a mano, ±3 px, così la camera non sembra mai bloccata.

   Lo zoom dice all'occhio dove guardare: senza, una UI a 1080p è solo testo minuscolo su un grande schermo.
7. **Un personaggio (opzionale, sempre v2).** Un piccolo pet rotondo e lucido nel colore d'accento, con un'antenna che finisce nel punto del brand.
   - Porta tutto il film: nasce dal punto iniziale, finisce sepolto e spaventato nel caos, lo inspira e sputa il logo.
   - Poi indica le didascalie, cavalca le card trascinate, esulta quando si cattura un lead, saluta sulla card finale e torna nel punto.
   - Stati d'animo: felice, wow, entusiasta, preoccupato, spaventato, frastornato, calmo. Squash & stretch a ogni atterraggio.

   È una funzione di canvas, non un'immagine, ed è il modo più economico per legare i beat tra loro.
8. **Render, mix, verticale.**
   - `bun scripts/render.ts video --fps 30`;
   - `sfx_mix.py`, poi il mux con ffmpeg (passo 4 del workflow);
   - `vertical.py` per i Reel;
   - un foglio provini del montaggio (`bun scripts/render.ts sheet --cuts`).

**Bonus:** «Metti tutto in una cartella che posso dare a qualcun altro: ogni prompt che ti ho dato (alla lettera, in ordine), il codice, il brand, il personaggio, gli input, la pipeline di render e un README che spiega come rifare e cambiare il film.» Questo kit è già fatto così.

### La voce: scrivila per l'immagine, taggala per la voce

L'immagine racconta la storia; la voce aggiunge solo quello che l'immagine non può dire, una frase breve per beat. Con ElevenLabs:

- I tag sono descrizioni semplici tra parentesi quadre prima della frase: `[warm, unhurried]`, `[dry, knowing]`, `[sighs]`.
- Le pause vengono da `…` e da `[short pause]` / `[long pause]`. Lo SSML `<break>` viene ignorato.
- Il MAIUSCOLO enfatizza una parola. Una volta per copione basta.
- Scrivi il nome del brand come si pronuncia. Nel kit questo lo fanno anche `SPOKEN` in `align_vo.py` e `tts` in `lines.json`.
- Genera una ripresa lunga con `[long pause]` tra le frasi, poi chiedi la tabella frase · tempo d'inizio · tempo entro cui deve finire.
- La forma è: dolore (frasi 1–4) → nome (5) → prova (6–11) → payoff (12–14) → brand e promessa (15). Sono gli stessi quattro atti dell'immagine.

Con la voce locale (`analysis/tts/voice.py`) i tag non si leggono: la regia è la descrizione della voce in `INSTRUCT`, e il ritmo lo danno le pause di `lines.json`.

### Dieci regole che il film rispetta

| # | Da principiante | Da pro |
|---|---|---|
| 1 | Apre sul logo | Apre sul dolore di chi guarda |
| 2 | UI registrata dallo schermo, piccola e piatta | UI ricostruita in codice dagli screenshot |
| 3 | Una lista di funzioni | Una storia: problema → soluzione → showcase → CTA |
| 4 | Dissolvenze tra slide | Ogni beat cresce dal precedente |
| 5 | Camera ferma | Push-in di 2× su ogni azione, la camera segue il cursore |
| 6 | Un arcobaleno di colori | Un solo colore d'accento: l'occhio sa dove posarsi |
| 7 | Un loop di musica stock | Un suono per ogni click + una base che si abbassa sotto la voce |
| 8 | Testo illeggibile sul telefono | Tutto ciò che la voce nomina è almeno 26 px |
| 9 | Un prompt gigante, nessuna revisione | Prima il beat sheet, poi l'OK, poi si costruisce |
| 10 | Modifica l'unica versione | Tiene la v1, costruisce la v2, confronta |

**Prima di pubblicare:**
- **Il test del primo secondo.** Mostra a uno sconosciuto il primo secondo della soluzione: sa dire a cosa serve?
- **Il test del muto.** Quasi tutti guardano senza audio: la storia si legge lo stesso? Il taglio verticale ha le didascalie per questo.
- **Il test del telefono.** Guardalo sul telefono, a braccio teso: leggi ogni didascalia?
- **Solo dati inventati.** Nessun nome, email o importo reale a schermo.
- **Una sola CTA.** La card finale chiede esattamente una cosa.
- **Volume.** -14 LUFS e picchi sotto -1 dB: il mix del kit sta a -14 LUFS con true peak -1,5 dBTP.

**Quando qualcosa non va, di' questo:**

| Vedi | Scrivi a Claude |
|---|---|
| Sembrano slide | «Fai crescere ogni beat dal precedente. Niente dissolvenze. Tagli netti solo dove significano qualcosa.» |
| Non si legge sul telefono | «Ogni didascalia e ogni etichetta che la voce nomina deve essere almeno 26 px dopo lo zoom della camera.» |
| Voce e immagine vanno fuori sync | «Rilancia l'allineamento e ancora i tagli di timeline.ts alle frasi giuste. Nessuna sovrapposizione.» |
| La UI sembra generica | «Riproduci esattamente lo screenshot 04: spaziature, etichette, ordine delle colonne.» |
| Il render è lentissimo | «Fai la bozza con --samples 4 e --fps 30, e dividi il film in intervalli con --from/--to.» |

**Per i Reel.** `python3 analysis/vertical.py` fa il taglio verticale con le didascalie karaoke (passo 6 del workflow). Un verticale re-impaginato tavola per tavola, con la UI a tutta larghezza e i close-up più stretti, richiede invece che il motore disegni in 9:16. Oggi il formato è fisso a 16:9: lo decidono `W` e `H` in `app/src/engine/gl.ts`.

---

## 07 · Edit: da una registrazione a un reel

Lo stesso approccio funziona anche sul girato vero, come una call, un'intervista o un talking head: il montaggio diventa codice. `edit/edit.py` legge una **EDL** in JSON e la trascrizione con i tempi di ogni parola, e produce il reel verticale finito (1080×1920).

```sh
uv run --no-project --with faster-whisper python edit/transcribe.py out/refs/call.mp4 out/refs/call.json it
uv run --no-project --with numpy python edit/edit.py edit/testimonial-gianni/edl.json --list   # la lista dei tagli
uv run --no-project --with numpy python edit/edit.py edit/testimonial-gianni/edl.json          # → out/testimonial-gianni.mp4
```

Nella EDL scrivi solo le scelte editoriali:
- **le inquadrature:** ritagli del video, per esempio i due riquadri della call oppure un solo volto;
- **le sezioni:** ognuna ha un titolo, uno stile musicale e i suoi segmenti, cioè un pezzo di sorgente (`in`/`out` in secondi) con l'inquadratura in cui mostrarlo;
- **gli sticker:** una parola del parlato che fa comparire un'etichetta, come un numero o un risultato;
- **la chiusura:** brand, call to action e disclaimer;
- **le correzioni** alle parole che la trascrizione ha sentito male, per esempio `["la I", "l'IA"]`.

Tutto il resto lo ricava lo strumento:
- **i tagli** cadono nella pausa più silenziosa prima della prima parola e dopo l'ultima, mai dentro una parola, e sono allineati ai fotogrammi;
- **le didascalie** si accendono parola per parola;
- **le inquadrature** si alternano, larga e stretta, a ogni taglio: è quello che nasconde i jump cut;
- **lo stile** è quello di joinscalers.com: carta crema, bordi neri e ombre nette, giallo e viola, Space Grotesk;
- **la base musicale** è di `music.py`, arrangiata sulle sezioni;
- **gli effetti** suonano sui cambi di sezione e sugli sticker;
- **la voce** passa da un passa-alto e un compressore, e il mix va a -14 LUFS.

`edit/testimonial-gianni/` è l'esempio: 65 secondi da una call di 14,5 minuti.

Il video sorgente e la trascrizione stanno in `out/refs/` e restano fuori da git. Contengono una persona reale: chiedi il suo consenso prima di pubblicare.

---

## 08 · Altri film: più video nello stesso kit

La demo è un film fra tanti. Un film è una cartella `films/<nome>/` e la variabile `FILM=<nome>` dice ad anteprima, render e mix quale suonare. Senza `FILM` suona la demo, come sempre.

| File | Cosa contiene |
|---|---|
| `film.json` | titolo, formato (`16x9`: 1920×1080, oppure `9x16`: 1080×1920) e fps |
| `script.json` | le righe della voce (`script`) e la pronuncia di nomi e sigle (`spoken`), per l'allineamento |
| `tts/lines.json` | le righe come le legge la voce sintetica, con seed e pause |
| `audio/voiceover.mp3`, `data/` | la voce e i tempi delle sue parole |
| `timeline.ts`, `scenes/*.ts` | il montaggio e le tavole; le tavole importano il motore da `@kit/…` |
| `sound.py` | effetti e musica sugli stessi tempi delle tavole |

```sh
# 1. la voce (facoltativa: va bene qualsiasi voiceover.mp3). La cartella di lavoro è a parte, perché
#    le righe hanno gli stessi nomi di quelle della demo; dentro copia ref.wav e ref.txt della voce di riferimento
uv run --no-project --with qwen-tts --with soundfile python analysis/tts/voice.py --work analysis/tts/work/plugins --lines films/plugins/tts/lines.json lines
uv run --no-project --with faster-whisper --with soundfile python analysis/tts/voice.py --work analysis/tts/work/plugins --lines films/plugins/tts/lines.json check
uv run --no-project --with soundfile --with numpy python analysis/tts/voice.py --work analysis/tts/work/plugins --lines films/plugins/tts/lines.json assemble --tighten 0.2 --tempo 1.3 --out films/plugins/audio/voiceover.mp3
# 2. i tempi delle parole e l'analisi della voce
uv run --no-project --with onnxruntime --with numpy python analysis/align_vo.py --film plugins
uv run --no-project --with numpy python analysis/audio_vo.py --film plugins
# 3. anteprima, suono e render
cd app && FILM=plugins bun run dev
uv run --no-project --with numpy python analysis/sfx_mix.py --film plugins                 # → out/plugins/mix.wav
cd app && FILM=plugins bun scripts/render.ts video --workers 1 --samples 1 --fps 30       # → out/plugins.mp4
cd out && ffmpeg -i plugins.mp4 -i plugins/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest plugins_sfx.mp4
```

Nel kit ci sono otto film:
- `films/plugins`, descritto qui sotto;
- `films/styles`, il reel dei 21 stili (sezione 09);
- `films/gem` e `films/polish`, due reel nel formato "paper night";
- `films/coding`, altri quattro plugin su una pagina bianca con le schede scure;
- `films/grill`, le skill di Matt Pocock su uno schermo diviso, con creaturine in pixel art sopra;
- `films/youtube`, le undici skill per un canale YouTube, su carta crema con capitoli corallo e scuri;
- `films/showreel`, lo showreel dei blocchi `fx`, solo musica, tagliato sulla griglia a 120 bpm.

`gem`, `polish`, `coding`, `grill` e `youtube` sono descritti in fondo a questa sezione, `showreel` nella sezione 10.

### Il reel dei plugin (`films/plugins`)

Un reel verticale di 65 secondi nel formato del presentatore animato dietro un bancone. Presenta quattro plugin per Claude Code (Superpowers, Karpathy skills, i-have-adhd e Claude Octopus) e chiude con "commenta SENIOR e ti mando i link in privato".

- **Il presentatore** è Matteo disegnato in codice (capelli all'indietro, barba piena, maglia nera). La bocca segue la voce, gli occhi sbattono, le mani cambiano posa sulle parole (`Gestures`).
- **Lo stage** (`scenes/_stage.ts`) è comune a tutte le tavole:
  - la parete a pannello forato, che cambia colore a ogni plugin;
  - il bancone;
  - le didascalie a pillole sul bancone: la parola detta in giallo, le parole chiave in nero;
  - l'etichetta in alto a sinistra;
  - la presa multipla in alto a destra, dove ogni plugin si infila quando viene nominato.
- **Sei tavole**, una per sezione. Ognuna si apre con una tendina circolare sulla precedente.
- **Gli oggetti di scena:**
  - terminali e il contatore delle stelle;
  - il cartello "la mia idea" e la specifica firmata;
  - il semaforo dei test e la pila di mille righe che diventa cento;
  - la bacheca delle quattro regole e il distruggidocumenti delle frasi di cortesia;
  - il polpo con i dodici modelli e il pulsante PUBBLICA bloccato;
  - il commento SENIOR e il DM con i link.

La voce è sintetica (Qwen3-TTS), accelerata di 1,3× per il ritmo del reel. Per usare la tua voce, registra il testo di `script.json`, salvalo come `films/plugins/audio/voiceover.mp3` e rilancia i passi 2 e 3.

### Paper night: `films/gem` e `films/polish`

Due reel verticali nello stesso formato:
- **lo stage:** un laboratorio di notte in carta, con muro di mattoni blu, finestre al chiaro di luna, pavimento di legno e luce calda;
- **la testata:** una striscia di carta crema fissata con lo scotch, che cambia a ogni inquadratura;
- **le didascalie:** su cartellini di carta color terracotta, in Fraunces;
- **i personaggi:** una creatura a scatola arancione (sta per Claude, disegnata qui) e una balena di carta blu (sta per DeepSeek);
- **la camera:** si avvicina piano e dà un colpo di zoom a ogni taglio.

Il set è in comune, in `films/_paper/stage.ts`. Ogni film ha una tavola sola che taglia le sue inquadrature sulle parole.

- `films/gem` (DeepGEMM, 28 s):
  - il cartellino del prezzo morso dalla balena;
  - la scheda del repository;
  - il motore di DeepSeek;
  - la macchina delle risposte;
  - la moneta e la valanga di risposte;
  - il tabellone dei prezzi;
  - "commenta GEM".
- `films/polish` (la skill di design, 35 s):
  - il sito viola "fatto con l'IA" timbrato e fulminato;
  - lo stampo TEMPLATE e la catena di montaggio;
  - la gru che porta la skill;
  - il comando;
  - il redesign;
  - il muro dei 61 segnali;
  - "commenta POLISH".

Prezzi, stelle e numeri vengono dai post originali: verificali prima di pubblicare.

### Il reel «coding» (`films/coding`)

Un reel verticale di 55 secondi che segue, inquadratura per inquadratura, un reel di @tessa.fairbrook. Presenta quattro plugin per Claude Code (Ponytail, OmniRoute, Graphify e Agent Skills) e chiude con "commenta CODING e ti mando i link direttamente". Tutto il film è una tavola sola, `scenes/coding.ts`, che taglia le inquadrature sulle parole; il look è in `scenes/_look.ts`.

- **La pagina:** bianca, con una griglia tenue e le crocette agli incroci. Negli angoli ci sono due raggiere corallo fuori fuoco, che girano piano e cambiano posa a ogni plugin.
- **Le didascalie:** due righe, Poppins sopra e Instrument Serif corsivo sotto. Ogni parola entra da una sfocatura grigia nel momento in cui viene detta.
- **Le aperture:** una stella corallo a quattro punte va a fuoco con il numero del plugin, poi il nome si scrive lettera per lettera in Cormorant.
- **Le schede:** interfacce scure con un alone corallo, che nascono da un segnaposto grigio e salgono al loro posto:
  - il terminale e il grafico a barre di Ponytail;
  - il giro di punti, la griglia dei provider, il carosello "Cambio modello", il limite del piano che si esaurisce e i token al mese di OmniRoute;
  - il grafo della conoscenza e la query di Graphify;
  - la tabella delle 24 skill, la scheda del repository e le sei fasi di Agent Skills.
- **L'apertura del reel:** le quattro icone (disegnate qui) entrano in una griglia 2×2 e volano via, un contatore corre fino a 100x, una creaturina in pixel art entra camminando, un lampo caldo porta al bianco.
- **Il presentatore:** nelle tre inquadrature a mezzo busto c'è Matteo disegnato, lo stesso di `films/plugins` (`presenter(…, torso)` gli allunga il busto). Dietro di lui un muro grigio, un'insegna al neon rosa scritta con un font a tratto singolo e una pianta, tutto fuori fuoco.

Rispetto all'originale, il testo corregge i numeri che le fonti non confermano:
- **Ponytail:** nel benchmark taglia il 54% delle righe di codice. I token scendono di circa il 22%, non di oltre il 50% come dice l'originale.
- **OmniRoute:** "fino a 1,6 miliardi di token gratis al mese" è una stima dello strumento, e il testo la presenta così ("sulla carta").
- **Agent Skills:** al posto del ritratto di una persona reale c'è la scheda del repository di Addy Osmani.

Ricontrolla comunque numeri e link prima di pubblicare.

### Il reel «grill» (`films/grill`)

Un reel verticale di circa un minuto che segue, inquadratura per inquadratura, un reel di @piyush.glitch sulle skill di Matt Pocock (grill-me, tdd, diagnosing-bugs, improve-codebase-architecture). Chiude con "commenta GRILL e ti mando il repo in privato". Una tavola sola, `scenes/grill.ts`, taglia 31 inquadrature sulle parole; il look è in `scenes/_pix.ts`.

- **Lo schermo diviso:** sopra la linea c'è un palco illustrato (raggiera crema, lucine, pavimento beige) dove le creaturine in pixel art recitano ogni idea. Sotto c'è Matteo disegnato in una stanza con lampada, oppure la pagina del repository con cerchi, sottolineature e adesivi disegnati a mano.
- **Le didascalie:** maiuscole bianche in IBM Plex Mono su una pillola scura, a cavallo della linea. Le parole non ancora dette restano più chiare.
- **Le creaturine:** sono disegnate qui, cella per cella (16×9), con sei cappelli: berretto, cuffia, cappello da chef, tocco, elmetto e parrucca da giudice.
- **Le scene:** il tabellone delle stelle, il museo, l'interrogatorio, il tribunale, la gru che costruisce la cosa sbagliata, la griglia con il piano, il terminale con le domande, la lavagna del test che fallisce e poi passa, il ciclo del debug, la città del codice scansionata, il report, il cronometro, il marketplace, il braccio robotico, la cartella che si riempie, la montagna e il razzo, il telefono con il commento.
- **Le pagine** sotto la linea sono illustrazioni del repository, non screenshot.

Rispetto all'originale, il testo corregge due cose controllate su github.com/mattpocock/skills (ottobre 2026):
- **Le stelle:** oltre 280.000, non 265.000.
- **I comandi:** per Claude Code è `claude plugin install mattpocock-skills@claude-plugins-official`; per Cursor e gli altri agenti è `npx skills@latest add mattpocock/skills`; poi `/setup-matt-pocock-skills` una volta per progetto. Codex ha un suo comando, scritto nella pagina sotto la linea.

Al posto del creator originale, nelle inquadrature a mezzo busto c'è Matteo disegnato.

### Il reel «youtube» (`films/youtube`)

Un reel verticale di 42 secondi che segue, inquadratura per inquadratura, un reel di @ai.nxtlvl sulla YouTube Agent Skill: undici skill per Claude che lavorano a un canale YouTube. Chiude con "commenta YOUTUBE e ti mando la guida completa in privato". Una tavola sola, `scenes/youtube.ts`, taglia 16 inquadrature sulle parole; il look è in `scenes/_soft.ts`.

- **Tre capitoli di colore:**
  - carta crema con aloni pastello, griglia e crocette per l'apertura e le singole skill;
  - un capitolo corallo con la raggiera per "sono undici";
  - un capitolo scuro con un pianeta che sorge per la viralità.
- **Le didascalie:** Poppins in basso, con la parola detta in una pillola corallo (scura sul corallo). Le parole già dette restano piene, quelle in arrivo sono chiare.
- **I titoli:** Poppins più una parola in Instrument Serif corsivo corallo, ognuna entra da una sfocatura. Sopra ogni skill c'è il suo comando in una pillola scura (`/yt-script`, `/yt-package`, `/yt-edit`, `/yt-comment`, `/yt-plan`).
- **Le schede**, tutte disegnate qui:
  - il canale che passa da "Manuale" a "Claude" riga per riga, con il timbro "100% GRATIS";
  - le carte degli hook a ventaglio;
  - titoli e copertine;
  - il montaggio con i tagli segnati;
  - i commenti con le risposte in bozza;
  - il calendario di ottobre;
  - la ricerca nella nicchia, l'analisi del video più virale, l'albero che lo rifà con la tua voce;
  - il cronometro dei dieci secondi;
  - il commento che si scrive da solo.
- **Le icone:** la scintilla e il tasto play sono disegnati qui, non sono i loghi dei marchi.

Rispetto all'originale, il testo segue quello che dice il README del repository (ottobre 2026):
- **Montaggio e commenti:** le skill non montano i video e non rispondono da sole. Preparano la lista dei tagli e scrivono le risposte in bozza.
- **Pubblicazione:** non pubblicano niente. Per questo c'è una frase in più: "scrive lei, carichi tu".
- **Le 21 formule per gli hook:** sono un numero del repository, non verificato.

Scegli tu il link da mandare in DM.

---

## 09 · Stili: venti look pronti, più uno

`app/src/styles/` è una libreria di 21 stili di motion design: i venti più usati e, come bonus, l'ASCII art. Ognuno è uno `Style` con:
- **i suoi colori e caratteri** (`palette`, `fonts`);
- **il suo modo di muoversi** (`motion`): l'easing degli ingressi e, se si muove a scatti, a quanti fotogrammi al secondo;
- **il post del motore** per un fotogramma intero in quello stile (`post`): bloom, grana, aberrazione cromatica, vignettatura;
- **tre funzioni di disegno**, pure funzioni del tempo: `ground` (lo sfondo), `title` (un titolo nello stile, con il suo ingresso) e `tile` (una scheda animata che mostra lo stile in movimento);
- **una frase che lo descrive** (`what`) e **la ricetta** (`recipe`): cosa chiedere a Claude per ottenerlo.

In una tavola:

```ts
import { style } from '@kit/styles';

const s = style('risograph');
s.ground(x, t, W, H);                                        // lo sfondo
s.title(x, t - 0.4, 'Il mio prodotto', W / 2, H / 2, 150);   // un titolo che entra dopo 0,4 s
return { ...s.post };                                       // il post dello stile
```

Per chiederlo a Claude basta il nome: *"rifai la tavola `model` in stile Risograph"*. Claude legge la ricetta nel file dello stile e la applica alla tavola. Due esempi di ricetta:
- **Risograph:** due inchiostri piatti in multiply, livelli fuori registro di qualche pixel, retini e grana, animazione a 8 fps.
- **Glassmorphism:** sfocatura dello sfondo dentro pannelli semitrasparenti con un bordo bianco sottile, movimenti lenti.

| # | Stile | Cosa lo definisce | File |
|---|---|---|---|
| 1 | Swiss style | Griglia rigorosa, grotesk bold a sinistra, tanto bianco e un solo rosso. | `swiss.ts` |
| 2 | Kinetic type | La tipografia è l’animazione: lettere che entrano, si allungano e pulsano a ritmo. | `kinetic.ts` |
| 3 | Pop art | Retini Ben-Day, contorni neri spessi, colori primari e fumetti che esplodono. | `popart.ts` |
| 4 | Flat 2D | Forme piatte a tinta unita: niente contorni, niente sfumature, niente ombre. | `flat.ts` |
| 5 | Clay 3D | Oggetti morbidi e opachi, come plastilina, con luce da studio e rimbalzi elastici. | `clay.ts` |
| 6 | Glassmorphism | Pannelli di vetro smerigliato che sfocano i colori vivaci che passano dietro. | `glass.ts` |
| 7 | Y2K chrome | Metallo liquido, cromature lucide, bolle e brillantini: l’estetica del Duemila. | `y2k.ts` |
| 8 | Synthwave | Neon, sole a strisce e griglia che corre verso l’orizzonte: una notte anni Ottanta. | `synthwave.ts` |
| 9 | Risograph | Due inchiostri spot sovrapposti su carta, grana, fuori registro di qualche pixel. | `riso.ts` |
| 10 | Paper collage | Carta strappata, nastro adesivo e lettere ritagliate, una diversa dall’altra. | `collage.ts` |
| 11 | Glitch | Segnale rotto: canali RGB sfasati, fette che saltano, rumore e scanline. | `glitch.ts` |
| 12 | Particles | Migliaia di punti di luce che vorticano e poi compongono una forma. | `particles.ts` |
| 13 | Neobrutalism | Bordi neri spessi, ombre nette senza sfocatura, colori piatti e forti. | `neobrutal.ts` |
| 14 | Bauhaus | Cerchio, quadrato e triangolo nei colori primari, barre nere, tipografia geometrica minuscola. | `bauhaus.ts` |
| 15 | Memphis | Scarabocchi, zig-zag, coriandoli e forme pop: il design milanese anni Ottanta. | `memphis.ts` |
| 16 | Vaporwave | Rosa, lilla e azzurro pastello, tramonto a strisce, colonne greche e finestre di un vecchio sistema operativo. | `vaporwave.ts` |
| 17 | Pixel art | Pochi pixel ingranditi senza sfumatura, una palette ridotta e animazione a scatti. | `pixel.ts` |
| 18 | Isometric | Un mondo di blocchi su una griglia a 30 gradi, senza punto di fuga. | `isometric.ts` |
| 19 | Low poly | Solo triangoli a colore piatto, ombreggiati faccia per faccia. | `lowpoly.ts` |
| 20 | Line art | Una sola linea nera su bianco, che non si stacca mai dal foglio. | `lineart.ts` |
| bonus | ASCII art | L’immagine fatta di caratteri: luce e ombra diventano punti, virgole e cancelletti. | `ascii.ts` |

Il reel `films/styles` li mostra tutti (82 s, 9:16). Per vederli in anteprima:

```sh
cd app && FILM=styles bun run dev
```

Il reel ha questa struttura:
- **in alto**, la lista in due colonne: ogni nome si scrive quando la voce lo dice;
- **sotto**, la scheda dello stile, che si gira a ogni taglio;
- **in apertura**, un montaggio rapido di tutti gli stili;
- **in chiusura**, il mosaico dei 21 stili e "commenta STILI".

---

## 10 · Lista Opus 5.5: ricette e blocchi `fx`

[awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) (licenza MIT) raccoglie 513 video virali fatti chiedendo a Claude Opus 5.5 di scrivere l'animazione come codice, ognuno con il prompt del suo creator. 317 sono motion graphics. Da quella lista il kit prende due cose:
- uno strumento per scaricarla e usarla;
- undici blocchi nuovi per fare quello che quei prompt chiedono più spesso.

### Lo strumento: `analysis/opus55.py`

```bash
python3 analysis/opus55.py fetch                                # scarica la lista in out/refs/opus55/ (fuori da git)
python3 analysis/opus55.py stats                                # categorie, tecnologie, quali blocchi servono a quanti prompt
python3 analysis/opus55.py list --cat motion --q logo           # cerca: --cat motion|explainer|3d|interactive, --tag gsap, --q parola
python3 analysis/opus55.py show himanshutwtxs-882858            # il prompt, il creator, i link, i blocchi che servono
python3 analysis/opus55.py adapt <slug> --film nome --sec 15    # un brief in italiano da incollare in Claude Code
```

`adapt` mette insieme quattro cose:
- il prompt del creator, citato con il suo nome;
- le regole del kit (funzione pura di t, cartella del film, foglio provini, credito nel README);
- i blocchi `fx` da usare;
- un avviso quando il prompt nomina marchi, personaggi o persone reali.

La lista resta in `out/`, fuori da git: i prompt appartengono ai loro autori.

### Cosa chiedono i 317 prompt di motion graphics

- **Un terzo è lo stesso prompt.** Circa 103 chiedono "uno showreel di 15 secondi che mostri che motion designer incredibile sei", con varianti di durata, formato e tema.
- **Tempo musicale.** 120 bpm, tagli su battute e battiti, qualcosa che arriva a ogni battito, stagger di un sedicesimo (125 ms).
- **Molle "premium".** Molle in forma chiusa con meno del 2% di rimbalzo. Niente easing da cartone animato.
- **Gli altri temi ricorrenti:**
  - testo cinetico;
  - interfacce con un cursore che clicca;
  - una forma sola che diventa la successiva, senza mai tagliare;
  - una camera continua che zooma tra scale diverse;
  - grafici che si disegnano.
- **Le specifiche lunghe** (una ventina) fissano:
  - durata, fps e formato;
  - una palette in esadecimale e tre font;
  - uno storyboard a tempo;
  - un "contratto" tecnico: `seek(t)` funzione pura, motion blur a sotto-fotogrammi, l'ultimo fotogramma uguale al primo;
  - fogli provini per correggersi;
  - una lista di cose vietate: particelle, glow, glassmorphism, viola neon, dissolvenze incrociate.

Metà di queste cose il kit le faceva già per costruzione: funzione pura di t, motion blur con `--samples`, fogli provini, suono sintetizzato a -14 LUFS. Il resto sono i blocchi qui sotto.

### I blocchi: `app/src/fx`

Si importano da `'@kit/fx'`. Sono tutti funzioni pure del tempo in Canvas2D, tranne `shader`, che è GLSL.

| Blocco | Cosa c'è |
|---|---|
| `tl` | `Timeline` con etichette e posizioni alla GSAP (`'<'`, `'-=0.3'`, `'etichetta+=0.5'`). `stagger` dal centro, dai bordi, a caso o su una griglia. `E('power2.out')`, `E('back.out(1.7)')`, `E('cubic-bezier(.16,1,.3,1)')`. `spring` e `springTo`: molle in forma chiusa con il rimbalzo massimo in percentuale, e il cambio di bersaglio a metà corsa. |
| `beat` | `Grid(120)`: battute e battiti in secondi, `snap`, `pulse` sul battito, `phase`. `shots()` taglia le inquadrature esattamente sulle battute. |
| `text` | `reveal` lettera per lettera o parola per parola, in sette modi (`rise` da dietro una maschera, `drop`, `blur`, `scale`, `flip`, `slide`, `skew`) con stagger e uscita. `scramble` che si decifra, `typed` con il cursore, `counter` con i numeri all'italiana, `odometer` a rulli. |
| `path` | `svg()` legge i path SVG, archi compresi; `glyphs()` dà i contorni del testo. `drawOn` li disegna (insieme o in sequenza, con la punta della penna). `morph` passa da una forma all'altra senza torsioni. `circle`, `poly`, `star`, `blob`; `glint`, il riflesso che passa su un logo. |
| `shared` | `boxAt`: un rettangolo arrotondato che cambia posizione, misura e raggio su molle. `colorAt`, e `swap`: il contenuto esce sfocato prima che entri il nuovo. |
| `camera` | `track` tra camere, con lo zoom in scala logaritmica (un punto, una finestra, un telefono, una parola). `fit` su un rettangolo, `apply` con la parallasse per profondità, `handheld`, `smash`. |
| `transition` | `iris`, `shape`, `wipe` (con il filo colorato), `slices`, `blinds`, `tear`, `letters` (la scena dopo si apre dentro le lettere), `push`, `zoom`, `flash`, `cut`, tra due inquadrature qualsiasi. |
| `ui` | Finestra macOS o browser, telefono, `cursor` con il clic sul battito e l'onda. `toggle`, `slider`, `tabs` con l'indicatore "liquido", `toast`, `palette` (⌘K), `terminal`, `button`. Tutto disegnato qui, nessuna icona di marchi. |
| `chart` | `bars`, `line` con area, punta e tooltip, `donut`: si disegnano da soli con i numeri che gli passi. Dati inventati, mai. |
| `particles` | `swarm` che compone una parola o una forma e poi esplode, `burst` di scintille e coriandoli, `dust`. Sono facoltative: molte specifiche le vietano. |
| `shader` | `ShaderBg`: mesh gradient, aurora, caleidoscopio, retino. Va sotto il livello Canvas2D. |

I blocchi di tempo (`tl`, `beat`) hanno i loro test: `cd app && bun run test`.

Per esempio, un titolo che entra sul secondo battito e una riga che lo segue con 0,2 s di sovrapposizione:

```ts
import { Timeline, Grid } from '@kit/fx';
import { reveal } from '@kit/fx/text';

const G = new Grid(120);
const tl = new Timeline().to('titolo', 0.6, G.at(0, 1), 'expo.out').to('riga', 0.5, '-=0.2');
// in render():
reveal(x, t, tl.at('titolo'), 'MOTION', W / 2, 900, 160, F.archivo(125, 900), { from: 'center' });
reveal(x, t, tl.at('riga'), 'as code', W / 2, 1000, 60, F.mono(500), { mode: 'blur' });
```

### Il film dimostrativo: `films/showreel`

È la risposta del kit al prompt più copiato della lista: 20 secondi, 9:16, 10 battute a 120 bpm, solo musica.
- **Struttura:** nove inquadrature, una per blocco, legate da otto transizioni diverse.
- **Chiusura:** va in loop, perché l'ultimo fotogramma è il primo.
- **Numeri:** quelli a schermo sono della lista (317 prompt; quanti chiedono showreel, interfacce, molle, camera, testo, circa).

```bash
cd app && FILM=showreel bun run dev
uv run --no-project --with numpy python analysis/sfx_mix.py --film showreel     # → out/showreel/mix.wav
cd app && FILM=showreel bun scripts/render.ts video --workers 1 --samples 1 --fps 30
```

**Un film senza voce:**
1. Scrivi `NO_VOICE = True` nel suo `sound.py`. Il mixer usa il file della voce solo per la durata e non abbassa la musica.
2. Parti da una traccia muta lunga quanto il film, con un `data/lyrics.json` senza righe, e lancia `audio_vo.py`.
3. Fatto il mix, convertilo in `audio/voiceover.mp3` e rilancia `audio_vo.py`: l'anteprima suona la musica, e l'analisi trova i battiti veri.

### Da un prompt della lista a un film

1. Cerca un video che ti piace: `opus55.py list --cat motion --q "logo reveal"`, poi `show <slug>` e il link all'originale.
2. `opus55.py adapt <slug> --film nome > out/brief.md` e incolla il brief in Claude Code.
3. Controlla il foglio provini, renderizza, mixa.
4. Aggiungi il creator nei crediti.

Se l'avviso dice che il prompt nomina marchi, personaggi o persone reali, il film li sostituisce con nomi, icone e personaggi inventati. Gli asset presi da altri siti non entrano nel progetto.

---

## 11 · motionmaxxing: la skill installata nel progetto

[motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) di Tejas Makwana (Apache-2.0) è una skill di Claude Code per film di lancio, promo di prodotto, brand sting e tipografia cinetica. Funziona in quattro passi:
1. trova un'idea che solo quel marchio può avere;
2. le costruisce un mondo (fondo, luce, profondità);
3. anima con curve misurate fotogramma per fotogramma su 53 animazioni professionali;
4. controlla il render con i suoi script, invece di dire che è venuto bene.

Costruisce in HTML con GSAP e renderizza con il suo `render.mjs` (Chrome + ffmpeg): è una catena diversa da quella del kit, e le due convivono.

È installata nella cartella `.claude/skills/motionmaxxing/` del repository, quindi Claude Code la carica quando apri il progetto. Chiedi una motion graphic, oppure scrivi `/motionmaxxing`. Provenienza, versione e aggiornamento sono in `.claude/skills/README.md`.

Le servono Node 22+, Python 3.9+, ffmpeg e Chrome; con `ELEVENLABS_API_KEY` scrive e registra anche voce e musica.

Nelle sessioni cloud Chrome parte solo senza sandbox:

```sh
export CHROME_PATH="$PWD/.claude/chrome-cloud.sh"
```

Per averla in tutti i progetti sul tuo Mac:

```sh
git clone https://github.com/Tejashmakwana/motionmaxxing ~/motionmaxxing && bash ~/motionmaxxing/install.sh
```

**Quando usare l'una o l'altro:**
- **motionmaxxing:** un film di marca partendo da un sito (colori, font, logo, testi veri), con il suo metodo e i suoi controlli.
- **Il kit:** i reel guidati dalla voce, i cloni di un formato, gli stili e i blocchi `fx`.

I suoi controlli funzionano anche sui video del kit:

```sh
python3 ../.claude/skills/motionmaxxing/scripts/look.py out/showreel_sfx.mp4 --out out/showreel/look --expect 20 --expect-audio
```

`look.py` misura tre cose:
- **le soglie:**
  - G0, il render c'è;
  - G2, niente più di 3 fotogrammi piatti di fila;
  - G3, il cartello finale dura al massimo 1,4 s e l'ultima inquadratura al massimo il 25% del film;
- **il movimento**, confrontato con quello dei film fatti a mano;
- **i tagli**, quanti cadono su un attacco del suono.

Sullo showreel:
- G0, G2 e G3 passano;
- il movimento sta dentro la fascia dei film fatti a mano (4,7 su una mediana di 6,8);
- 2 tagli su 10 cadono entro 80 ms da un colpo del suono, dove i professionisti arrivano al 35% circa. Diversi tagli arrivano circa 100 ms dopo il battito, perché le transizioni hanno il centro subito dopo il taglio.

La sua lista "da non consegnare mai" vieta etichette negli angoli, contatori, titoli scritti lettera per lettera con il cursore e un colore piatto diverso per ogni scena. Alcuni cloni del kit le usano perché le usano gli originali. Per un film tuo, quella lista conviene seguirla.

---

## 12 · Aiuto: problemi e crediti

| Problema | Prova così |
|---|---|
| Pagina bianca su localhost:5173 | Esegui prima `bun install` dentro `app/` e guarda gli errori nel terminale dove gira vite. |
| Nessun suono in anteprima | Premi spazio per avviare la riproduzione: la voce la suona la pagina, e il browser può bloccarla finché non interagisci. Controlla che la scheda non sia silenziata. |
| Il render non trova Chrome | Installa Google Chrome: il renderer, tramite Playwright, lancia il canale `chrome`. Per usare un altro browser installato imposta `BROWSER_CHANNEL` (per esempio `msedge`); per un eseguibile preciso, come Chromium su Linux, imposta `BROWSER_PATH=/percorso/chromium`. |
| ffmpeg non trovato / niente libx264 | Installa una build completa di ffmpeg e verifica che `ffmpeg -version` funzioni in un terminale nuovo. |
| Render molto lento | Usa `--samples 4` per le bozze e il comando `stills` per le singole tavole. Senza GPU (WebGL via software, SwiftShader) usa `--workers 1`: due Chrome si contenderebbero gli stessi core. |
| Animazione fuori tempo dopo una voce nuova | Rilancia entrambi gli script di analisi. Se il testo è cambiato, aggiorna le frasi nelle chiamate `cut(...)` di `timeline.ts`. |
| Scene module not found | Il nome del file in `timeline.ts` deve corrispondere a un file in `app/src/scenes/` (per un film, in `films/<nome>/scenes/`). |

### Crediti e licenza

Il linguaggio visivo è il motore e lo stile di **pdoom-video** di mexicat (Giacomo Magnanini), licenza MIT, incluso come `LICENSE.pdoom-engine`. La licenza copre:

- la palette (inchiostro, osso, arancio segnale);
- i font (Archivo, IBM Plex Mono, Cormorant Garamond e i font a tratto singolo da plotter);
- il motivo della scintilla e i fogli di costruzione su carta millimetrata;
- il post-processing (bloom, halation, grana).

Tieni quel file di licenza insieme al progetto. Le nove tavole sono nuove, scritte per questa voce.

- **Font:** Archivo, IBM Plex Mono e Cormorant Garamond sono distribuiti con SIL Open Font License (`app/public/fonts/src/OFL.txt`). I font a tratto singolo EMS e Hershey arrivano dal pacchetto `hersheytext` (OFL / pubblico dominio).
- **Voce demo:** sintetica, generata in locale con Qwen3-TTS (Qwen, Apache 2.0). Non è la voce di una persona reale.
- **Allineamento:** [wav2vec2-large-xlsr-53-italian](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-italian) di Jonatas Grosman (Apache 2.0), esportato in ONNX int8.
- **Effetti sonori e musica:** sintetizzati da `analysis/make_sfx.py` e `analysis/music.py`, nessun campione esterno.
- **Reel dei plugin:** il formato riprende un reel di [@adilet.fndr](https://www.instagram.com/adilet.fndr): un presentatore animato dietro un bancone e una sezione per plugin. Tavole, disegni, testo italiano, voce e suono sono nuovi, scritti in codice per questo kit. I nomi di prodotti e repository citati appartengono ai rispettivi autori.
- **Paper night:** il formato di `films/gem` e `films/polish` riprende due reel di [@nocodealex](https://www.instagram.com/nocodealex). Set, personaggi, testi italiani, voce e suono sono nuovi, disegnati in codice. Fraunces è distribuito con SIL Open Font License (`app/public/fonts/fraunces/OFL.txt`).
- **Reel «coding»:** il formato di `films/coding` riprende un reel di [@tessa.fairbrook](https://www.instagram.com/tessa.fairbrook). Schede, icone, disegni, testo italiano, voce e suono sono nuovi, scritti in codice per questo kit. Poppins e Instrument Serif sono distribuiti con SIL Open Font License (`app/public/fonts/poppins/OFL.txt`, `app/public/fonts/instrumentserif/OFL.txt`).
- **Reel «grill»:** il formato di `films/grill` riprende un reel di [@piyush.glitch](https://www.instagram.com/piyush.glitch). Creaturine, scene, pagine, testo italiano, voce e suono sono nuovi, disegnati in codice per questo kit.
- **Reel «youtube»:** il formato di `films/youtube` riprende un reel di [@ai.nxtlvl](https://www.instagram.com/ai.nxtlvl). Schede, icone, testo italiano, voce e suono sono nuovi, disegnati in codice per questo kit. YouTube e Claude sono marchi dei rispettivi proprietari; le icone del film non sono i loro loghi.
- **motionmaxxing:** la skill in `.claude/skills/motionmaxxing/` è di Tejas Makwana ([Tejashmakwana/motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing)), licenza Apache-2.0, copiata così com'è con il suo LICENSE e il suo NOTICE. GSAP, three.js e i font che porta con sé restano sotto le loro licenze.
- **Controlli finali:** l'idea dei controlli che un video deve passare prima della consegna (formato, loudness, niente fotogrammi vuoti o fermi, un foglio da guardare, ogni transizione vista da vicino) viene da [Mortiflix](https://github.com/GTKottman/mortiflix-oss) di GTKottman (AGPL-3.0). `analysis/qc.py` è scritto per questo kit e non contiene codice di Mortiflix.
- **Lista Opus 5.5:** `analysis/opus55.py` scarica [awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) di yihui-dev (MIT) e la tiene fuori da git; ogni prompt resta del suo creator, linkato nella lista. I blocchi `app/src/fx` e `films/showreel` sono scritti per questo kit a partire da ciò che i prompt chiedono, senza codice né materiale dei video originali.
- **Stili:** l'elenco dei venti stili riprende un reel di [@andremass.ai](https://www.instagram.com/andremass.ai) ("motion design styles you can steal"). Ricette, codice e animazioni di `app/src/styles/` sono nuovi, scritti per questo kit.
- **Launch film:** struttura, prompt, regole e checklist della sezione 06 sono adattati dalla guida *The 60-second launch film made with Claude* di Saksham Gupta ([@saksham.700x](https://www.instagram.com/saksham.700x)). La guida cita lo skill onetake (licenza PolyForm Noncommercial), di cui qui non c'è codice.

Se usi ElevenLabs o un altro servizio per la tua voce o per gli effetti, controlla i termini di licenza del tuo piano prima di pubblicare il video.
