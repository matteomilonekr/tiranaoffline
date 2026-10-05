# Brand Captions — clip grezze dentro, video finito fuori

Una skill per Claude Code. Le dai una cartella di clip (anche girate col telefono) e ti
restituisce un video montato, con sottotitoli a parole evidenziate, hook, titoli, punch
word, etichette e scheda finale: tutto con i font, i colori e lo stile di animazione del
tuo brand. Niente app di montaggio, niente codice.

## Cosa fa

- **Monta**: toglie pause, silenzi e ripetizioni ("rifaccio…"), unisce le clip, raddrizza
  i video girati in verticale/orizzontale, sistema il volume (standard dei social).
- **Sottotitola**: ascolta le clip sul tuo computer, scrive i sottotitoli a tempo di parola,
  corregge nomi e numeri, evidenzia le parole chiave.
- **Anima nel tuo stile**: hook iniziale, punch word giganti, etichette a pillola, titolo
  fisso, scheda finale con logo, numeri e call to action.
- **Si ricorda il tuo brand**: al primo avvio legge il tuo sito (o la brand guide) e salva
  colori, font e logo. Non te lo chiede più.
- **Un video o tanti**: un unico video da tutte le clip, oppure ogni clip montata a parte
  (comodo dopo una giornata di riprese, anche per i clienti).

## Cosa serve

- Claude Code sul computer (Mac, Windows o Linux).
- Circa 3 GB liberi (strumenti e modello vocale, scaricati una volta).
- Python 3.9+ e FFmpeg: se mancano, la skill te lo dice e ti aiuta a installarli.

Tutto gira in locale: le clip non vengono caricate da nessuna parte. Internet serve solo
la prima volta (strumenti, modello vocale, font) e per leggere il sito del brand.

## Installazione

Copia la cartella `brand-captions` in:

- `~/.claude/skills/brand-captions` → disponibile in tutti i progetti (consigliato), oppure
- `<tuo progetto>/.claude/skills/brand-captions` → solo in quel progetto.

Apri Claude Code e scrivi qualcosa come:

```
monta i video nella cartella lancio
```

La prima volta la skill controlla il computer, installa ciò che manca (2-5 minuti) e ti
chiede il sito del brand. Dalla seconda volta basta una frase.

## Esempi di richieste

- `monta i video nella cartella ~/Desktop/riprese-ottobre, un video unico`
- `edita ogni clip della cartella shooting-cliente separatamente, brand: Panificio Rossi`
- `aggiungi i sottotitoli a questo video: ~/Movies/intervista.mov`
- `rendi i sottotitoli più grandi e togli la scheda finale`
- `rifallo in formato 4:5 con la musica brano.mp3`
- `nuovo cliente: il sito è www.cliente.it, poi monta la cartella cliente-reel`

## Dove finiscono i file

- Video finito: nella cartella delle clip (`<nome cartella>.mp4`), oppure in `edited/` se
  ogni clip è montata a parte.
- File di lavoro: `<cartella>/.brand-captions/` (trascrizioni, piano di montaggio,
  anteprima). Si possono cancellare: "pulisci i file di lavoro della cartella X".
- Brand salvati, strumenti e modello vocale: `~/.brand-captions/`.

## Domande frequenti

**Funziona con l'italiano?** Sì, e con quasi tutte le lingue: la lingua viene riconosciuta da
sola per ogni clip.

**Serve una brand guide?** No. Basta il sito. Senza sito parte da uno stile pulito che puoi
cambiare quando vuoi.

**Posso usarla per i clienti?** Sì: ogni cliente ha il suo profilo brand. Dì a Claude quale
usare, o lascia che lo chieda.

**E se qualcosa va storto?** La skill spiega il problema in parole semplici e propone come
risolverlo.

---

## Opzioni avanzate

Puoi chiederle a parole ("sottotitoli più in alto", "senza zoom sui tagli"): Claude
modifica il piano di montaggio (`<cartella>/.brand-captions/plan.json`) e rifà il render.
Il formato completo è in `references/plan-format.md`.

| Impostazione (`settings`) | Valori | Effetto |
|---|---|---|
| `cut` | `tight`, `natural`, `none` | quanto stringere le pause |
| `zoom_cuts` | `true` / `false` | zoom alternato sui tagli del parlato |
| `highlight` | `keywords`, `active`, `both`, `none` | parole chiave, parola pronunciata, entrambe, nessuna |
| `reveal` | `word` | le parole compaiono mentre vengono dette |
| `case` | `as-is`, `lower`, `upper` | maiuscole/minuscole |
| `punctuation` | `keep`, `minimal` | punteggiatura nei sottotitoli |
| `anim` | `pop`, `rise`, `snap`, `fade` | animazione dei testi |
| `caption_size` | es. `1.2` | dimensione sottotitoli |
| `caption_y` | 0-1 | altezza sottotitoli (normale 0,70) |
| `max_words` | es. `3` | parole per sottotitolo |
| `fit` | `fill`, `blur`, `fit` | come adattare clip di formato diverso |
| `music` | `{"file": "brano.mp3", "volume": 1}` | musica di sottofondo, si abbassa da sola sotto la voce (`volume` 0.5-1.5) |
| `loudness` | es. `-14` | volume finale (LUFS) |
| `srt` | `true` | esporta anche i sottotitoli in `.srt` |
| `fps` | 24, 25, 30, 60 | fotogrammi al secondo |
| `crf`, `preset` | es. `18`, `fast` | qualità/velocità dell'esportazione |

Formati (`format`): `9:16` (predefinito), `4:5`, `1:1`, `16:9`.

Stili del brand: `playful` (contorni spessi, pop), `clean` (minuscolo, ombra morbida),
`bold` (maiuscolo, parola accesa), `elegant` (morbido, dissolvenze). Dettagli e campi del
profilo in `references/brand-setup.md`.

Comandi diretti (per chi vuole usare il terminale; `bc.py` è in `scripts/`):

```
python3 scripts/bc.py doctor [--install]       # controllo / installazione
python3 scripts/bc.py brand scan <sito>        # analisi del sito
python3 scripts/bc.py brand save <bozza.json>  # salva un brand
python3 scripts/bc.py brand list | use <slug>  # brand salvati / predefinito
python3 scripts/bc.py prepare <cartella> --mode one|each [--brand <slug>]
python3 scripts/bc.py render <cartella>/.brand-captions/plan.json
python3 scripts/bc.py render <cartella> --all
python3 scripts/bc.py config whisper_model=small   # modello vocale più veloce
python3 scripts/bc.py clean <cartella> [--all]
```

Modelli vocali (`whisper_model`): `large-v3-turbo` (predefinito sui computer recenti, il
più preciso), `medium`, `small` (più veloce), `base`.

Variabili d'ambiente: `BRAND_CAPTIONS_HOME` (dove salvare strumenti e brand, predefinito
`~/.brand-captions`), `BRAND_CAPTIONS_MODEL` (modello vocale per una singola esecuzione).

Il font predefinito Montserrat è incluso con licenza SIL Open Font License
(`assets/fonts/OFL.txt`).
