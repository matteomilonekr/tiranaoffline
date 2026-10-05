# Il piano di montaggio (`plan.json`)

`BC prepare` scrive la bozza; tu la modifichi; `BC render` la trasforma nel video.
Il file ha una frase per riga: modificalo con Edit, poche righe alla volta.

## Indice
1. Esempio completo
2. Campi principali e `settings`
3. Clip e frasi (taglio, correzioni, evidenziazioni)
4. Sovrapposizioni (`overlays`)
5. Ancoraggi temporali
6. Regole ed errori comuni

## 1. Esempio completo (dopo il tuo montaggio)

```json
{
  "version": 1,
  "name": "lancio",
  "folder": "/Users/anna/Desktop/lancio",
  "output": "lancio.mp4",
  "brand": "panificio-rossi",
  "format": "9:16",
  "language": "it",
  "settings": {"cut": "tight", "zoom_cuts": true, "captions": true},
  "clips": [
    {
      "id": "c2",
      "file": "IMG_0412.MOV",
      "kind": "speech",
      "duration": 21.4,
      "sentences": [
        {"id": "c2.s1", "t": [0.6, 2.1], "text": "Oggi sforniamo il pane alle 5.", "keep": false, "note": "retake? repeated in c2.s2"},
        {"id": "c2.s2", "t": [3.4, 5.9], "text": "Oggi sforniamo il pane *alle 5 del mattino*.", "keep": true},
        {"id": "c2.s3", "t": [6.3, 9.8], "text": "~~Allora, ehm,~~ la pasta madre ha *40 anni*.", "keep": true}
      ]
    },
    {"id": "c1", "file": "IMG_0411.MOV", "kind": "visual", "duration": 6.0, "trim": [0.5, 4.5], "sentences": []}
  ],
  "overlays": [
    {"type": "hook", "text": "Il pane che sforniamo\n*alle 5 del mattino*", "at": "c2.s2"},
    {"type": "punch", "text": "40 anni.", "at": "c2.s3:anni"},
    {"type": "label", "text": "pasta madre", "at": "c1@0.6", "duration": 2},
    {"type": "endcard"}
  ]
}
```

## 2. Campi principali

| Campo | Cosa fa |
|---|---|
| `name` | nome del video (anche della cartella di lavoro) |
| `folder` | cartella delle clip (non cambiarla) |
| `output` | file finale, relativo alla cartella (`lancio.mp4`, `edited/clip1.mp4`) |
| `brand` | slug del brand da usare |
| `format` | `9:16` (1080×1920, predefinito), `4:5`, `1:1`, `16:9` |
| `language` | solo informativo |

### `settings` (tutto opzionale; senza valore vale lo stile del brand)

| Chiave | Valori | Effetto |
|---|---|---|
| `cut` | `tight` (predef.) · `natural` · `none` | quanto stringere le pause: `tight` taglia pause > 0,4 s, `natural` > 0,8 s, `none` toglie solo silenzi > 1,2 s e le frasi scartate |
| `zoom_cuts` | `true`/`false` | leggero zoom alternato sui tagli delle clip parlate (nasconde i jump cut) |
| `captions` | `true`/`false` | sottotitoli sì/no |
| `highlight` | `keywords` · `active` · `both` · `none` | parole `*evidenziate*` / parola pronunciata in quel momento / entrambe / nessuna |
| `reveal` | `word` | le parole compaiono mentre vengono dette |
| `case` | `as-is` · `lower` · `upper` | maiuscole/minuscole di sottotitoli e testi |
| `punctuation` | `keep` · `minimal` | `minimal` toglie punti e virgole finali (tiene ? e !) |
| `anim` | `pop` · `rise` · `snap` · `fade` | animazione d'entrata dei testi |
| `caption_size` | numero (1 = normale) | moltiplica la dimensione dei sottotitoli |
| `caption_y` | 0-1 | altezza dei sottotitoli (0 = in alto; normale ≈ 0,70) |
| `max_words` | numero | parole massime per sottotitolo (normale 3-5 a seconda dello stile) |
| `fit` | `fill` · `blur` · `fit` | per tutte le clip: riempi e ritaglia / video intero su sfondo sfocato / bande col colore del brand |
| `fps` | 24, 25, 30, 60 | fotogrammi al secondo (normale: in base alle clip) |
| `music` | `{"file": "brano.mp3", "volume": 1}` | musica di sottofondo (file nella cartella): portata a un livello da sottofondo e abbassata da sola quando si parla; `volume` 0.5 = più bassa, 1.5 = più alta |
| `loudness` | es. `-14` | volume finale in LUFS (−14 = standard social) |
| `srt` | `true` | scrive anche il file `.srt` dei sottotitoli |
| `crf`, `preset` | es. `18`, `fast` | qualità/velocità di esportazione (lasciali stare se non richiesto) |

## 3. Clip e frasi

Ogni clip:

| Campo | Cosa fa |
|---|---|
| `id` | `c1`, `c2`… non cambiarlo (gli ancoraggi lo usano) |
| `file` | nome del file nella cartella |
| `kind` | `speech` = si parla: si tagliano pause e frasi scartate · `visual` = immagini senza parlato (b-roll, demo muta): si tiene il girato, togliendo solo un attimo a inizio/fine |
| `fit` | come sopra, solo per questa clip (la bozza mette `blur` alle clip orizzontali) |
| `trim` | `[inizio, fine]` in secondi della clip originale: usa solo quel pezzo |
| `skip` | `true` = non usare la clip |
| `sentences` | le frasi trascritte, nell'ordine in cui sono dette |

**L'ordine delle clip nel file è l'ordine nel video**: per cambiarlo sposta i blocchi.

Ogni frase:

| Campo | Cosa fa |
|---|---|
| `id` | non cambiarlo |
| `t` | inizio/fine nella clip originale (solo informativo) |
| `text` | il testo del sottotitolo: correggilo, evidenzia, taglia (vedi sotto) |
| `keep` | `false` = la frase viene tagliata dal video |
| `caption` | `false` = la frase resta nel video ma senza sottotitolo |
| `note` | messaggi della bozza (es. ripetizione probabile) |

Dentro `text`:
- `*parola*` o `*più parole*` → evidenziate col colore d'accento del brand.
- `~~parole~~` → tagliate dal video e dai sottotitoli (false partenze, "ehm", frasi a metà).
  Metti le tilde attorno a parole intere che esistono nella trascrizione.
- Correggere una parola sbagliata (es. "Swoopy" → "Swubie") va bene: il tempo resta quello
  della parola detta. Non riscrivere frasi intere: i sottotitoli devono seguire l'audio.

Non aggiungere, togliere, dividere o unire frasi nell'elenco: il render le abbina alla
trascrizione nell'ordine e si ferma se il numero non torna.

## 4. Sovrapposizioni (`overlays`)

Campi comuni: `at` (quando inizia, vedi §5), `duration` (secondi) oppure `to` (quando
finisce), `position` (`top` 0,20 · `upper` 0,30 · `center` 0,45 · `lower` 0,58 · `bottom`
0,62, oppure un numero 0-1 = altezza del centro del testo; i sottotitoli stanno a ≈ 0,70),
`size` (moltiplicatore, 1 = normale), `hide_captions` (`true` = niente sottotitoli mentre
il testo è a schermo).

| `type` | Campi | Note |
|---|---|---|
| `hook` (o `opener`) | `text`, `at` (predef. inizio), `duration` | testo grande d'apertura. `\n` va a capo, `*parole*` evidenziate. Se ancorato a una frase dura quanto la frase (1,4-4 s). Nasconde i sottotitoli mentre è a schermo se ripete le stesse parole (`hide_captions`: `auto` predef., `true`, `false`). |
| `title` | `text`, `from` (predef. `start`), `to` (predef. `end`) | testo fisso in alto per tutta la durata (o un tratto): l'argomento del video. |
| `punch` | `text`, `at` (meglio `cX.sY:parola`), `duration` (predef. ~1,1 s) | parola enorme che "colpisce": "Via.", "1 panno.", "Zero app." Max 1-3 parole; si rimpicciolisce per stare su una riga. I sottotitoli restano visibili (metti `hide_captions: true` se ripete esattamente la frase detta). |
| `label` | `text`, `at`, `duration` (predef. 1,8 s), `position` o `x`/`y` (0-1), `color` (`accent`, `secondary` o `#hex`) | etichetta a pillola: nomi, materiali, passaggi, prezzi. 1-2 parole. |
| `broll` | `file`, `at`, `duration` o `to`, `mode` (`full`/`pip`), `from` (secondo di partenza nel file), `width` (pip, 0-1), `position` (pip: `top`, `upper`, `center`, `lower`, `left`, `right`) | copre il video con un'altra clip o una foto della cartella; l'audio resta quello principale. `pip` = riquadro con angoli arrotondati (nei video orizzontali va a destra). Per coprire un'intera clip usa `"at": "cX", "to": "cX"`; inizi e fini a meno di 0,3 s da un taglio vengono allineati al taglio. La clip usata come b-roll di solito va messa `"skip": true`. |
| `endcard` | `enabled`, `duration` (predef. 3,2 s), `cta`, `url`, `headline`, `stats` `[{"value":"5.000+","label":"clienti"}]`, `footnote`, `logo` (true/false) | scheda finale col logo; i valori mancanti vengono dal brand. |

## 5. Ancoraggi temporali

| Scrivi | Significa |
|---|---|
| `"start"` / `"end"` | inizio / fine del video (prima della scheda finale) |
| `"c2"` | inizio della clip c2 nel video (`to: "c2"` = fine della clip) |
| `"c2.s3"` | inizio della frase c2.s3 (`to: "c2.s3"` = fine della frase) |
| `"c2.s3:anni"` | il momento in cui viene detta la parola "anni" in quella frase |
| `"c4@2.5"` | il secondo 2,5 della clip originale c4 (utile per le clip `visual`) |
| `12.3` | il secondo 12,3 del video finale |

Usa gli ancoraggi a frasi/parole invece dei secondi: restano giusti anche se cambi i tagli.
Un ancoraggio a una frase con `"keep": false` dà errore.

## 6. Regole ed errori comuni

- Un solo testo grande alla volta (hook, punch, title): non sovrapporli.
- Il render controlla il piano e spiega cosa non va (ancoraggio inesistente, file mancante,
  frasi non corrispondenti). Correggi e rilancia.
- Se il risultato non ti convince, guarda `preview` e i singoli momenti con `BC frames`.
- La bozza precedente resta in `plan.prev.json` quando rifai `prepare`.
