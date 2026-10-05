# Problemi comuni e come spiegarli

Gli script stampano `✗ <problema>`, `→ <cosa fare>` e a volte `details:` tecnici.
Spiega all'utente il problema in una frase semplice e fai tu il passo successivo quando puoi.

| Messaggio / sintomo | Spiegazione semplice | Cosa fare |
|---|---|---|
| `python3: command not found` | Manca Python, che serve agli strumenti di montaggio. | Mac: `xcode-select --install` (si apre una finestra, poi "Installa") oppure `brew install python`. Windows: `winget install Python.Python.3.12`, poi riapri Claude Code. |
| `FFmpeg is missing` | Manca il programma che lavora sui file video. | Esegui il comando mostrato da `doctor`. Se chiede la password del computer, l'utente deve incollarlo lui nel Terminale. |
| `This FFmpeg lacks captions (libass)` | La versione di FFmpeg installata non sa disegnare i testi. | Mac: `brew reinstall ffmpeg`. Windows: `winget install --id Gyan.FFmpeg -e`. Linux: pacchetto `ffmpeg` della distribuzione. |
| `not set up on this computer yet` / `editing tools are not installed` | Manca la preparazione iniziale. | `BC doctor --install` |
| `Installing the editing tools failed` | Il download dei componenti non è riuscito. | Controlla la connessione e rilancia. Se `details` parla di permessi o di Python troppo vecchio, aggiorna Python (3.9+). Su Linux può servire `sudo apt-get install python3-venv`. |
| `The speech model could not be loaded or downloaded` | Il modello che "ascolta" le clip non si è scaricato. | Connessione e spazio libero (~2 GB), poi `BC doctor --install`. Sui computer lenti: `BC config whisper_model=small`. |
| Ascolto molto lento | Il computer è lento per il modello grande. | `BC config whisper_model=small` (più veloce, un po' meno preciso), poi rifai `prepare`. |
| Trascrizione nella lingua sbagliata | Clip corte o audio sporco confondono il riconoscimento. | `BC prepare <cartella> --language it` (codice a 2 lettere). |
| `No video clips found` | La cartella è vuota o i video sono in sottocartelle. | Controlla il percorso; il messaggio elenca le sottocartelle con video. |
| `Could not read the file …` | Un file è danneggiato o non è un video. | Viene saltato; dillo all'utente. |
| `The sentences of cX do not match its transcript` | Nel piano sono state aggiunte, divise o unite frasi. | Ripristina le frasi originali o rifai `prepare`, poi riapplica le modifiche. |
| `The anchor "…" does not exist` / `points to a sentence that is cut out` | Un testo è agganciato a una frase che non c'è o che è stata tagliata. | Aggancialo a una frase tenuta (l'errore elenca quelle disponibili). |
| `The font "…" is not available on Google Fonts` | Il font del brand non si scarica da Google. | Usa il file del font (dal sito o dall'utente) o un font simile (vedi `brand-setup.md`). |
| `The SVG logo could not be converted` | Il logo in formato vettoriale non si apre. | Usa un altro candidato o chiedi un PNG. |
| `The final render failed` | FFmpeg si è fermato. | Leggi `details`: file mancante, disco pieno (`No space left`), clip corrotta. Libera spazio con `BC clean <cartella>`, rimuovi la clip problematica (`"skip": true`) e riprova. |
| Video con colori spenti/grigi da iPhone | Era girato in HDR. | Viene convertito automaticamente se FFmpeg ha `zscale` (Homebrew sì). Altrimenti consiglia di girare in SDR o installare FFmpeg completo. |
| Audio e sottotitoli fuori sincrono | Raro: trascrizione imprecisa su audio rumoroso. | Rifai `prepare` con il modello grande (`BC config whisper_model=large-v3-turbo`). |
| Il testo copre un volto o il prodotto | Posizione standard non adatta a questa inquadratura. | `position`/`y` sulla sovrapposizione o `settings.caption_y`. |
| `brand scan`: `answered with error 403` o nessun colore/font | Il sito blocca i programmi o è costruito in modo particolare. | Leggi il sito con lo strumento web, chiedi logo e colori all'utente, oppure brand minimo. |
| Per un attimo si vede la clip sotto un b-roll | Il b-roll inizia/finisce poco dopo/prima di un taglio. | Ancoralo alla clip intera (`"at": "cX", "to": "cX"`) o a frasi più ampie. |

## Spazio su disco

Ogni cartella lavorata contiene `.brand-captions/` con audio estratti e file intermedi (anche
centinaia di MB). `BC clean <cartella>` li cancella lasciando i video finiti e le
trascrizioni; `BC clean <cartella> --all` toglie tutto (poi serve rifare `prepare`).

## Disinstallare

Cancella la cartella della skill e `~/.brand-captions/` (strumenti, modello, brand salvati).
