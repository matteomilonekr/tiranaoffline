# Sequenza pre-call (step 4 della mappa)

Obiettivo: far arrivare in call più persone, e preparate. Le email e i messaggi partono dal tool di calendario (Calendly, Cal.com o GoHighLevel) o dal CRM collegato al webhook `CALL_FUNNEL_WEBHOOK_URL`.

Variabili: `{nome}`, `{data}`, `{ora}`, `{link_call}`, `{link_riprogramma}`, `{link_video}` (pagina `/call/confermata`).

---

## Email

### E1 · Subito dopo la prenotazione

**Oggetto:** La tua call è confermata, {nome} (guarda prima questo)

> Ciao {nome},
>
> la tua AI OS Strategy Call è confermata per {data} alle {ora}.
>
> Prima della call fai due cose:
>
> 1. Accetta l'invito nel calendario, così ricevi i promemoria.
> 2. Guarda il video di 4 minuti in cui ti spiego come andrà la call: {link_video}
>
> Tieni a portata di mano fatturato medio degli ultimi 3 mesi, numero di clienti attivi, i 3 processi che ti rubano più ore e gli strumenti che usi oggi. Bastano stime.
>
> Link della call: {link_call}
> Imprevisto? Riprogramma qui: {link_riprogramma}
>
> A presto,
> Matteo

### E2 · 24 ore prima

**Oggetto:** Domani alle {ora}: cosa costruiremo nella tua call

> {nome}, domani alle {ora} ci vediamo per la tua call.
>
> Ti racconto in breve un caso simile al tuo. [Inserisci un caso reale per segmento: agenzia, freelancer o coach. Prima, cosa ha costruito, risultato.]
>
> Domani facciamo lo stesso lavoro sul tuo business: troviamo il collo di bottiglia, ti mostro la mappa del tuo AI OS e ti dico se ha senso lavorare insieme.
>
> Se non hai ancora visto il video pre-call, guardalo qui: {link_video}
>
> Matteo

### E3 · 2 ore prima

**Oggetto:** Tra 2 ore. Il link è questo

> {nome}, tra due ore ci colleghiamo.
>
> Link: {link_call}
>
> Collegati da computer e, se decidete in due, porta il tuo socio.
>
> Matteo

---

## WhatsApp / SMS

Messaggi brevi, firmati con il nome di chi fa la call. Su WhatsApp Business usa template approvati.

| Quando | Messaggio |
|---|---|
| Subito | Ciao {nome}, sono Matteo di Scalers+. Ho visto la tua prenotazione per {data} alle {ora}. Ti ho mandato via email un video di 4 minuti da guardare prima della call. Salva questo numero, ti scrivo qui se serve. |
| 24 ore prima | {nome}, confermi la call di domani alle {ora}? Rispondi "sì" e ti tengo il posto. Se hai un imprevisto: {link_riprogramma} |
| 1 ora prima | Tra un'ora ci vediamo. Link: {link_call} |
| 5 minuti dopo l'inizio, se non si è collegato | {nome}, ti sto aspettando in call: {link_call}. Se non riesci oggi, scegli un altro orario qui: {link_riprogramma} |

---

## Video selfie personale (facoltativo, alto impatto)

Per i lead con priorità **A** (arrivano in Slack e via email con `QUALIFICATO-A`), registra un video di 20-30 secondi da smartphone e mandalo su WhatsApp subito dopo la prenotazione:

> Ciao {nome}, sono Matteo. Ho appena visto la tua candidatura: [un dettaglio specifico dalle risposte, per esempio "15 ore a settimana sui report dei clienti"]. È esattamente il tipo di cosa che sistemiamo nei primi 30 giorni. Ci vediamo {data}, porta i numeri e ci lavoriamo sopra.

---

## Recuperi

### Candidato ma non prenotato (qualificato, nessuna prenotazione dopo 1 ora)

Disponibile via webhook: l'evento `call_application` con `qualification.qualified = true` arriva subito, la prenotazione la registra il calendario. Se dopo un'ora non c'è prenotazione:

> **WhatsApp:** Ciao {nome}, sono Matteo di Scalers+. Hai completato la candidatura per la AI OS Strategy Call ma non hai scelto l'orario. Ecco il calendario: [link calendario]. Se nessuno slot ti va bene, rispondimi qui e lo troviamo insieme.

### No-show

> **Email · Oggetto:** Ti abbiamo aspettato, {nome}
>
> Ciao {nome}, oggi alle {ora} ti abbiamo aspettato in call. Capita.
>
> Se vuoi ancora lavorare sul tuo AI OS, scegli un nuovo orario qui: {link_riprogramma}. Ti servono 30 secondi.
>
> Matteo
