# Google Sheets, registro iscritti

Il file `Code.gs` è il webhook collegato al foglio Google:

`Tirana Offline Mode 2026 - Iscritti`

Il foglio usa due tab:

- `Iscritti`, visibile, contiene lead e biglietti senza doppioni.
- `_Config`, nascosto, contiene il segreto condiviso e i dati di configurazione.

## Pubblicazione iniziale

1. Apri il foglio Google.
2. Apri `Estensioni > Apps Script`.
3. Sostituisci il contenuto di `Code.gs` con questo file.
4. Seleziona `Esegui il deployment > Nuovo deployment`.
5. Tipo: `Applicazione web`.
6. Esegui come: il proprietario del foglio.
7. Chi ha accesso: chiunque.
8. Copia l’URL finale che termina con `/exec`.

Il webhook resta protetto dal segreto conservato nel tab nascosto `_Config`. Il backend accetta esclusivamente URL HTTPS su `script.google.com` e non espone URL o segreto al browser.

## Variabili Vercel

```dotenv
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_WEBHOOK_SECRET=<valore di _Config!B1>
GOOGLE_SHEETS_REQUIRED=true
```

Ogni retry con lo stesso lead o biglietto aggiorna la riga esistente. Un lead senza ticket viene completato dal successivo checkout con la stessa email. `LockService` impedisce che due richieste concorrenti creino doppioni.
