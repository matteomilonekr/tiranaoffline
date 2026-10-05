# Impostare un brand

Si fa una volta per brand. Il risultato è un profilo salvato in
`~/.brand-captions/brands/<slug>/` (font, logo, colori) che tutti i video usano.

## 1. Raccogli il materiale

- **Sito**: `BC brand scan <url>`. Restituisce colori trovati nel CSS (con dove sono usati e
  le variabili tipo `--color-button`), font (con disponibilità su Google Fonts), logo
  candidati già convertiti in PNG (`logos[].file`: guardali con Read), titolo, descrizione,
  titoli della pagina, numeri utili per la scheda finale (`numbers`, es. "4.9 stelle",
  "500+ clienti") e la lingua del sito.
  Se vuoi più contesto sul tono, puoi leggere la pagina con lo strumento di lettura web.
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
| `accent` | parole evidenziate, punch word, bottone della scheda finale | il colore di brand più acceso e riconoscibile (bottoni, CTA, `--color-button`, `--accent`). Deve leggersi su video: evita colori troppo scuri |
| `secondary` | etichette, secondo colore della scheda finale | l'altro colore di brand (spesso più scuro) |
| `background` | sfondo della scheda finale | lo sfondo chiaro (o scuro) tipico del sito |
| `ink` | testi sulla scheda finale | il colore scuro dei testi del brand (o quasi nero) |
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

## 5. Logo

Passa il percorso del PNG scelto tra i candidati dello scan (o il file/URL dell'utente):
`"logo": "/Users/anna/.brand-captions/scans/sito-it/logo-1.png"`. Viene ritagliato e
reso trasparente se ha uno sfondo uniforme. Se è bianco su trasparente e la scheda finale
ha sfondo chiaro, viene ricolorato col colore `ink` automaticamente. Senza logo la scheda
finale mostra il nome del brand.

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

- `cta` breve (2-5 parole) nella lingua del brand; `url` senza `https://`.
- `stats` solo con numeri veri trovati sul sito (`numbers` dello scan) o forniti
  dall'utente: mai inventarli. 0, 2, 3 o 4 elementi.
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

Scrivi la bozza in un file temporaneo (es. `/tmp/brand-draft.json`) e lancia
`BC brand save /tmp/brand-draft.json`. Il comando scarica i font, prepara il logo, salva il
profilo come predefinito e crea un video di prova: il `RESULT` contiene `sample` (immagine).
Guardala con Read: se un colore non si legge, il logo è sbagliato o il font è strano,
correggi la bozza e salva di nuovo (stesso `name` = aggiorna il profilo).

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
