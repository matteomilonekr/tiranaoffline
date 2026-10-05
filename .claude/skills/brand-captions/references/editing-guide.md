# Guida al montaggio

Qui decidi cosa rende il video bello e guardabile fino alla fine. Pensa come un video editor
di social: il primo secondo deve fermare il pollice, il resto deve scorrere senza intoppi,
il testo a schermo deve aiutare e mai affollare.

## 1. Leggi tutto prima di toccare

Leggi tutte le frasi di tutte le clip. Capisci: di cosa parla il video, chi parla, qual è
il momento più forte, se ci sono più tentativi della stessa frase, se è una demo di prodotto,
un talking head, un backstage. Guarda `kind`: le clip `visual` sono immagini senza parlato
(b-roll, dettagli, demo mute).

## 2. Il taglio

- **Ripetizioni**: quando una frase viene ripetuta, tieni l'ultima versione completa (di
  solito è quella buona). La bozza ne segna alcune; cerca anche quelle che non ha visto
  (stesse parole con piccole differenze, frasi lasciate a metà).
- **False partenze dentro una frase**: `~~Allora oggi~~ Oggi vi mostro…`. Anche intercalari
  isolati se disturbano (`~~ehm~~`, `~~cioè~~`), ma senza esagerare: un parlato troppo
  "pulito" sembra innaturale.
- **Fuori tema**: "sta registrando?", "aspetta", "rifaccio", risate prima di iniziare,
  saluti a chi sta dietro la camera → `"keep": false`.
- **Ordine** (un video da più clip): l'ordine della bozza è quello di registrazione. Cambialo
  solo se c'è un motivo chiaro: l'apertura più forte deve stare all'inizio, la chiamata
  all'azione alla fine, le clip `visual` dove illustrano ciò che si dice.
- **Clip visual**: tienile brevi (2-4 s di solito) con `trim` sul pezzo migliore, oppure usale
  come `broll` sopra il parlato quando mostrano ciò di cui si sta parlando.
- **Ritmo**: `cut: "tight"` va bene per quasi tutto il parlato. Usa `natural` se la persona
  parla lentamente o con pause espressive (racconti, contenuti emotivi, lusso).

## 3. I sottotitoli

- Correggi gli errori di trascrizione: nomi del brand e dei prodotti (anche il `vocabulary`
  del brand aiuta), numeri ("cinquemila" → "5.000" se lo stile del brand usa le cifre),
  parole straniere, punteggiatura. Mai parafrasare: deve corrispondere all'audio.
  Le note `unsure words` indicano le parole più a rischio: correggile se il contesto lo
  rende ovvio ("Paolo anche tu, il link nella bio" → "Provalo anche tu…"); se il dubbio
  resta su un nome o un numero importante, chiedi all'utente nel messaggio finale.
- **Evidenzia poco**: circa una parola ogni 2-3 sottotitoli, mai due parole vicine in frasi
  diverse. Buone candidate: numeri e quantità ("*3 secondi*"), risultati ("*via*",
  "*pulito*"), il nome del prodotto, contrasti ("non *costa*, *fa risparmiare*"), parole
  emotive. Mai articoli, preposizioni o parole di servizio.
- Un gruppo di parole tra asterischi viene evidenziato tutto: `*in due minuti*`.
- `caption: false` per una frase che è già scritta grande a schermo (es. ripetuta
  nell'hook), se l'hook non la nasconde già da solo.

## 4. Hook / opener (quasi sempre)

Il testo grande dei primi 1,5-3 secondi. Deve far venire voglia di restare.

- Al massimo 7-8 parole, su 1-3 righe (`\n` per andare a capo dove vuoi tu).
- Prendi la promessa o la tensione del video: un problema ("Oei, een vlek?" / "Macchia sul
  divano?"), un risultato ("Monto i video *in 2 minuti*"), una curiosità ("Tutto quello che
  ho automatizzato *è nella caption*").
- Se la prima frase detta è già un ottimo hook, ancoralo a quella frase (`"at": "c1.s1"`):
  il testo apparirà mentre la dice e i sottotitoli sotto si nasconderanno.
- Evidenzia 1-2 parole, quelle che portano il senso.
- Lingua: quella del video.

## 5. Punch word

Parole enormi che sottolineano un momento: "Weg.", "1 doekje.", "Zero app.", "Fatto.",
"€19.". Funzionano perché sono rare.

- 1-3 parole, con il punto finale negli stili giocosi ("Via."), senza negli altri.
- Ancorale alla parola esatta: `"at": "c2.s4:via"`.
- Una ogni 6-10 secondi al massimo, mai due di fila, mai nei primi 2 secondi (c'è l'hook).
- Momenti buoni: la rivelazione del risultato, un numero sorprendente, la fine di un
  elenco, la battuta finale prima della CTA.

## 6. Etichette

Pillole piccole che dicono cosa si vede: materiali e superfici ("JEANS", "divano"), passaggi
("step 1"), prezzi ("€19"), nomi di persone o luoghi, "prima" / "dopo".

- Soprattutto nelle demo di prodotto e nei backstage; quasi mai nei talking head puri.
- 1-2 parole. Mettile vicino a ciò che indicano con `position` o `x`/`y` (0-1) se serve.
- Durata 1,5-2,5 s, sincronizzate con quello che si vede (per le clip `visual` usa
  `cX@secondi`).

## 7. Titolo

Un testo fisso in alto che dice l'argomento ("non tutto deve essere un'app. ecco come
decido."). Ottimo per video che spiegano qualcosa, tutorial, opinioni; inutile per demo
e backstage. In genere dall'inizio alla fine (`from` e `to` predefiniti). Non usare titolo
e hook insieme negli stessi secondi se affollano lo schermo: in quel caso fai partire il
titolo dopo l'hook (`"from": "c1.s2"`).

## 8. B-roll

Se nella cartella ci sono foto o clip che mostrano ciò di cui si parla, usale sopra il
parlato (`broll`): `full` per 1,5-3 s di immagine piena, `pip` per tenere visibile chi parla
mostrando uno screenshot o un prodotto. Non coprire i primi 2 secondi (il volto aggancia).

## 9. End card

Se il brand ha la scheda finale abilitata, la bozza la include: controlla che CTA e URL
abbiano senso per questo video. Puoi cambiare `cta`, `headline` o `stats` solo per questo
video dentro l'overlay. Per i contenuti organici "di valore" a volte è meglio senza:
chiedi solo se hai un dubbio reale.

## 10. Leggibilità

- Girato molto chiaro, colorato o pieno di dettagli (palchi, luci, schermi): i testi senza
  contorno (stili `clean`, `elegant`) perdono forza. Ingrandisci (`settings.caption_size`
  1,1-1,2; `size` 1,2-1,3 per l'hook) e metti hook e punch dove l'immagine è più scura o
  uniforme (`position`).
- Se il colore d'accento è simile alla scena (accento viola su luci viola), evidenzia meno o
  scegli parole che reggono anche in bianco; non cambiare il colore del brand di tua iniziativa.
- I font molto larghi (es. Syne) vanno su più righe prima degli altri: preferisci punch e
  hook brevi.

## 11. Controllo finale (sull'anteprima)

- Il testo non copre volti, mani che mostrano il prodotto o il prodotto stesso → sposta
  con `position`, o cambia `settings.caption_y` (es. 0,62) se succede sempre.
- Nessun testo tagliato ai bordi; nessuna sovrapposizione tra testi grandi.
- Le evidenziazioni cadono sulle parole giuste.
- Hook leggibile in 1 secondo.
- Durata sensata (per i social di solito 15-60 s; se è molto più lungo, chiediti se
  qualche frase si può togliere — ma non stravolgere il contenuto senza chiedere).
