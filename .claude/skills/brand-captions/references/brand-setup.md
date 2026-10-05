# Impostare un brand

Si fa una volta per brand. Il risultato è un profilo salvato in
`~/.brand-captions/brands/<slug>/` (font, logo, colori) che tutti i video usano.

## 1. Raccogli il materiale

- **Sito**: `BC brand scan <url>`. Restituisce colori trovati nel CSS (con dove sono usati e
  tutte le variabili colore, es. `--color-button`, `--violet`, `--ink`), font (con
  disponibilità su Google Fonts e file del sito), logo candidati già convertiti in PNG
  (`logos[].file`: guardali con Read), nome del sito, titolo, descrizione, titoli della
  pagina, numeri con il loro contesto (`numbers`: possibili dati per la scheda finale) e la
  lingua. Se vuoi più contesto sul tono, leggi la pagina con lo strumento di lettura web.
- **Sito non leggibile** (errore 403, protezioni anti-bot, sito in costruzione): prova lo
  strumento di lettura web per capire tono e colori, poi chiedi all'utente il logo o i
  colori principali; se non li ha, salva un brand minimo e procedi.
- **File** (brand guide PDF, immagini, logo, font): leggili con Read. Da una brand guide
  prendi i codici colore esatti, i nomi dei font e il logo. I file dei font (.ttf, .otf,
  .woff2) si possono usare direttamente.
- **Niente**: salva `{"name": "<nome>", "style": "clean"}` e vai avanti.

## 2. Scegli lo stile (`style`)

| Stile | Quando | Aspetto |
|---|---|---|
| `playful` | brand giocosi, prodotti di consumo, food, bambini, colori saturi, font arrotondati | testo bianco con contorno scuro spesso e ombra piena, parole d'accento colorate, animazioni "pop" con rimbalzo, etichette a pillola con bordo bianco |
| `clean` | tech, consulenza, creator, B2B, design minimale | grotesk moderno, tutto minuscolo, nessun contorno, ombra morbida, entrata dal basso morbida |
| `bold` | fitness, motivazione, finanza, talking head energici, ads aggressive | maiuscolo pesante, contorno nero, la parola detta si accende, scatti rapidi |
| `elegant` | moda, beauty, lusso, hospitality, matrimoni | serif o font raffinati, maiuscole/minuscole normali, ombra morbida, dissolvenze |

Decidi guardando logo, colori, font e tono del sito. Nel dubbio: `clean`.

## 3. Colori (`colors`, codici `#RRGGBB`)

| Ruolo | Uso | Come sceglierlo |
|---|---|---|
| `accent` | parole evidenziate, punch word, bottone della scheda finale, etichette negli stili `clean` e `bold` | il colore di brand più acceso e riconoscibile (bottoni, CTA, `--color-button`, `--accent`). Deve leggersi sopra un video: evita colori troppo scuri |
| `secondary` | etichette nello stile `playful`; sulla scheda finale: URL, testi delle statistiche, secondo colore dei numeri | l'altro colore di brand. Deve leggersi bene sullo sfondo della scheda finale (se è troppo simile viene usato `ink`) |
| `background` | sfondo della scheda finale | lo sfondo tipico del sito, chiaro o scuro |
| `ink` | testi sulla scheda finale | il colore dei testi del sito sopra quello sfondo: scuro su sfondo chiaro, chiaro su sfondo scuro |
| `text` | testo dei sottotitoli | quasi sempre `#FFFFFF` |
| `stroke` | contorno e ombra dei testi | facoltativo: se manca diventa una versione molto scura del colore secondario |

Scarta i colori di plugin e pagamenti (stelle delle recensioni, PayPal, Klarna, gradienti
di temi standard) e i colori presenti una volta sola.

## 4. Font (`fonts`)

Due ruoli: `display` (hook, punch word, titoli, scheda finale) e `text` (sottotitoli
negli stili `clean`/`elegant`, testi piccoli). Specifica ognuno in uno di questi modi:

- Google Fonts (scaricato da solo): `{"family": "Baloo 2", "weight": 800}`
- file dell'utente: `{"file": "/Users/anna/Desktop/brand/Font-Bold.otf"}`
- file del sito (dallo scan, `fonts[].files`): `{"url": "https://sito.it/fonts/titoli.woff2"}`

Il JSON della bozza non può contenere commenti.

- Preferisci i font del brand se sono su Google Fonts (`google_fonts: true` nello scan).
- Se il font del brand non è disponibile (Adobe Fonts, font a pagamento non scaricabile),
  scegli il più simile su Google Fonts: arrotondato → `Baloo 2`, `Fredoka`, `Nunito`;
  geometrico → `Montserrat`, `Poppins`, `Outfit`; grotesk → `Inter`, `Bricolage Grotesque`,
  `DM Sans`, `Manrope`; condensato forte → `Anton`, `Bebas Neue`, `Oswald`; serif
  elegante → `Playfair Display`, `DM Serif Display`, `Cormorant Garamond`.
- Pesi: per i sottotitoli servono pesi forti (700-900). Per `display` 800 è un buon
  default; per `text` 600-700.
- Senza font indicati si usa Montserrat (incluso nella skill).
- Nell'anteprima controlla anche i numeri (la punch word di prova contiene "1"): alcuni font
  decorativi hanno cifre strane; in quel caso scegli un altro font `display`.

## 5. Logo

Passa il percorso del PNG scelto tra i candidati dello scan (o il file/URL dell'utente):
`"logo": "/Users/anna/.brand-captions/scans/sito-it/logo-1.png"`. Viene ritagliato e
reso trasparente se ha uno sfondo uniforme. Se è bianco su trasparente e la scheda finale
ha sfondo chiaro, viene ricolorato col colore `ink` automaticamente.

Guarda sempre i candidati: l'immagine "social preview" è quasi sempre una foto, non un logo;
un'icona del sito (`inline icon`, `icon`) può essere il simbolo del brand. Se nessun
candidato è un logo vero, non mettere `logo`: la scheda finale mostrerà il nome del brand.

## Nome

`name` è il nome del brand come lo conoscono i clienti (quello scritto nel logo,
`site_name` dello scan o il nome in testata), corto e con le maiuscole giuste: compare
grande sulla scheda finale quando non c'è un logo.

## 6. Scheda finale (`endcard`)

```json
"endcard": {
  "cta": "Scopri i nostri pani",
  "url": "panificiorossi.it",
  "stats": [{"value": "40", "label": "anni di pasta madre"}, {"value": "4.9★", "label": "su Google"}],
  "headline": null,
  "footnote": null,
  "duration": 3.2
}
```

- `cta` breve (2-5 parole) nella lingua del brand; `url` senza `https://`. Se la CTA del sito
  dipende da una data (evento, saldi, lancio) e potrebbe essere scaduta, dillo all'utente.
- `stats` solo con numeri veri: controlla il `context` di ogni elemento di `numbers` (lo scan
  trova anche falsi positivi, es. orari o "30 giorni" di un programma) o usa dati forniti
  dall'utente. Mai inventarli. 0, 2, 3 o 4 elementi.
- È attiva se c'è `cta`, `url` o un logo; `"enabled": false` per spegnerla.

## 7. Altri campi

| Campo | Uso |
|---|---|
| `name` | nome del brand (obbligatorio); lo slug viene da qui |
| `website` | sito |
| `language` | lingua principale (solo un aiuto alla trascrizione quando è incerta) |
| `vocabulary` | nomi da scrivere giusti nella trascrizione: brand, prodotti, persone (max 30) |
| `case`, `punctuation`, `anim`, `highlight` | per cambiare il comportamento dello stile (vedi `plan-format.md`) |
| `overrides` | per esperti: valori del preset da cambiare, es. `{"caption": {"cap": 50, "y": 0.66}}` |

## 8. Salva e controlla

Scrivi la bozza in `~/.brand-captions/brand-draft.json` (va bene su ogni sistema) e lancia
`BC brand save ~/.brand-captions/brand-draft.json`. Il comando scarica i font, prepara il
logo, salva il profilo come predefinito e crea un'anteprima (circa mezzo minuto): il
`RESULT` contiene `sample` (immagine). Guardala con Read: se un colore non si legge, il logo
è sbagliato o il font è strano, correggi la bozza e salva di nuovo (stesso `name` = aggiorna
il profilo; `--no-sample` salta l'anteprima quando cambi solo dettagli).

Esempio di bozza:

```json
{
  "name": "Panificio Rossi",
  "website": "https://panificiorossi.it",
  "style": "playful",
  "language": "it",
  "colors": {"accent": "#E8A33D", "secondary": "#6B3E26", "background": "#FBF5EC", "ink": "#3B2418"},
  "fonts": {"display": {"family": "Fredoka", "weight": 700}, "text": {"family": "Nunito", "weight": 800}},
  "logo": "/Users/anna/.brand-captions/scans/panificiorossi-it/logo-1.png",
  "vocabulary": ["Panificio Rossi", "pasta madre"],
  "endcard": {"cta": "Passa a trovarci", "url": "panificiorossi.it"}
}
```

Comandi utili: `BC brand list`, `BC brand show <slug>`, `BC brand use <slug>` (cambia il
predefinito), `BC brand sample <slug>` (rifà l'anteprima).
