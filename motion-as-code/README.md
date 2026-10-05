# Motion as Code

**Workflow guide / starter kit.** Motion graphics fatte con il codice e guidate da una voce fuori campo, senza aprire After Effects. Copia la cartella nel tuo progetto, avvia l'anteprima, lancia il prompt demo.

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
- **Google Chrome**: il renderer lo pilota in modalità headless per disegnare i fotogrammi. Va bene anche un altro Chromium, vedi [Problemi](#06--aiuto-problemi-e-crediti).
- **ffmpeg** con libx264: trasforma i fotogrammi in MP4 e mixa il suono.
- **Python + [uv](https://docs.astral.sh/uv/)**: serve solo per allineare una voce nuova, rifare il mix degli effetti o generare una voce demo. I comandi qui sotto usano `uv run …`; se hai installato uv con pip, scrivi `python -m uv run …`.

Primo avvio, dalla cartella `motion-as-code/`:

```sh
cd app
bun install
bunx vite
```

Apri `http://localhost:5173` e premi spazio per far partire il video insieme alla voce. Se più avanti il render non trova Chrome, vedi [Problemi](#06--aiuto-problemi-e-crediti).

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

Parametri dell'URL:

- `?t=35` parte da 35 s.
- `?mix=1` suona il mix con gli effetti (`out/mix.wav`, passo 4) al posto della sola voce.

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
| `--workers 1` | Un solo Chrome alla volta (default 2). Usalo su una macchina senza GPU, vedi [Problemi](#06--aiuto-problemi-e-crediti). |
| `--from 50 --to 57` | Solo un intervallo, in secondi. |

### 4. Aggiungi gli effetti sonori

In `audio/sfx` ci sono 28 effetti sonori, sintetizzati da `analysis/make_sfx.py`. In `analysis/sfx_mix.py` c'è un cue sheet di circa 570 cue, ricavato dagli stessi tempi delle parole che usano le tavole. Gli effetti si abbassano fino a 7 dB sotto la voce e il mix è normalizzato a -14 LUFS, con picchi sotto -1 dBFS. Non serve ri-renderizzare: rifai il mix, poi copi l'immagine e aggiungi l'audio.

```sh
uv run --no-project --with numpy python analysis/sfx_mix.py
cd out
ffmpeg -i motion-as-code.mp4 -i mix.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -shortest motion-as-code_sfx.mp4
```

Per alzare o abbassare un effetto cambia il suo valore in dB nel cue sheet; per spostarlo cambia la sua espressione di tempo. `--list` stampa tutti i cue.

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

## 06 · Aiuto: problemi e crediti

| Problema | Prova così |
|---|---|
| Pagina bianca su localhost:5173 | Esegui prima `bun install` dentro `app/` e guarda gli errori nel terminale dove gira vite. |
| Nessun suono in anteprima | Premi spazio per avviare la riproduzione: la voce la suona la pagina, e il browser può bloccarla finché non interagisci. Controlla che la scheda non sia silenziata. |
| Il render non trova Chrome | Installa Google Chrome: il renderer, tramite Playwright, lancia il canale `chrome`. Per usare un altro browser installato imposta `BROWSER_CHANNEL` (per esempio `msedge`); per un eseguibile preciso, come Chromium su Linux, imposta `BROWSER_PATH=/percorso/chromium`. |
| ffmpeg non trovato / niente libx264 | Installa una build completa di ffmpeg e verifica che `ffmpeg -version` funzioni in un terminale nuovo. |
| Render molto lento | Usa `--samples 4` per le bozze e il comando `stills` per le singole tavole. Senza GPU (WebGL via software, SwiftShader) usa `--workers 1`: due Chrome si contenderebbero gli stessi core. |
| Animazione fuori tempo dopo una voce nuova | Rilancia entrambi gli script di analisi. Se il testo è cambiato, aggiorna le frasi nelle chiamate `cut(...)` di `timeline.ts`. |
| Scene module not found | Il nome del file in `timeline.ts` deve corrispondere a un file in `app/src/scenes/`. |

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
- **Effetti sonori:** sintetizzati da `analysis/make_sfx.py`, nessun campione esterno.

Se usi ElevenLabs o un altro servizio per la tua voce o per gli effetti, controlla i termini di licenza del tuo piano prima di pubblicare il video.
