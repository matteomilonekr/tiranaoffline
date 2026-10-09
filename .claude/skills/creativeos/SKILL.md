---
name: creativeos
description: Orchestratore del CreativeOS. Usalo quando l'utente chiede un ciclo creativo per Meta Ads (analisi dei concept che performano, nuovi concept, produzione con GPT Image 2, GPT Image 2.5 o Nano Banana, matrice di test, apprendimento dalle performance). Coordina il planner e gli agenti creativeos-* sui tool dell'MCP AI Ads.
---

# CreativeOS: Orchestratore

La sessione principale fa da orchestratore. Non fa lavoro creativo in prima persona: pianifica tramite `creativeos-planner`, esegue il piano delegando agli agenti `creativeos-*`, tiene il ledger dei costi e chiede i consensi.

Fonti di verita': `creativeos/registry/tools.json`, `creativeos/registry/engines.json`, `creativeos/registry/rules.json`. Architettura completa: `creativeos/ARCHITECTURE.md`.

## Ciclo

1. **Avvio**: chiama `mcp__AI_Ads__health`. Annota `version`, `production_blockers` e `production_warnings` in `creativeos/runs/<plan_id>/ledger.json`. Con un blocker ti fermi.
2. **Piano**: delega a `creativeos-planner` con il brief completo (brand, prodotto, mercato, obiettivo, offerta dichiarata, reference_image, budget). Ricevi `creativeos/runs/<plan_id>/plan.json`.
3. **Validazione**: controlla il piano prima di eseguire:
   - ogni `step.tool` esiste nel registro (o e' `Server:tool` di un satellite) e `step.agent` lo possiede;
   - `depends_on` punta a passi esistenti e il grafo non ha cicli;
   - il consenso di ogni passo e' almeno quello del registro;
   - ogni copy passa da `preflight_copy` prima di un passo C3;
   - la somma di `est_usd` sta sotto `budget.max_usd`.
4. **Consenso**: mostra all'utente un riepilogo con passi, costo stimato per corsia e l'elenco dei passi `esplicito`. Esegui i passi `esplicito` solo dopo un si' per quel passo. Un si' vale per quel piano, non per i successivi.
5. **Esecuzione del DAG**: un passo e' pronto quando tutte le dipendenze sono `done`. Lancia in parallelo i passi pronti che non dipendono l'uno dall'altro (piu' agenti nello stesso messaggio). Prima di ogni passo C2 o C3 riserva `est_usd` nel ledger; dopo, registra il costo reale restituito dal tool.
6. **Fan-out**: se un passo ha `fan_out`, crea un sotto-passo per elemento, con lo stesso agente e lo stesso consenso.
7. **Gate e ricicli**: preflight non `render` -> la variante torna a `creativeos-concept-strategist`; quality REWORK -> torna a `creativeos-render-producer` con il delta (max 2); KILL -> scartata; fidelity sotto 7 dopo 2 round -> niente clone.
8. **Errori**: `on_fail` del passo decide: `stop`, `skip`, `rework`, `fallback_engine` (route successiva di engines.json), `human`.
9. **Chiusura**: `creativeos-test-learning` produce la matrice di test. Pianifica il richiamo a 3 e 7 giorni per `import_performance`. Riporta all'utente: creative PASS per corsia, motore vincitore del torneo, spesa reale contro stima, decisioni D1-D7 con i loro id. Per spiegare una decisione all'utente usa `mcp__AI_Ads__explain_decision`.

## Stati di un passo

`pending` -> `ready` -> (`awaiting_consent`) -> `running` -> `done` | `failed` | `skipped`

## Ledger

`creativeos/runs/<plan_id>/ledger.json`: `{ "budget_usd", "riservato_usd", "speso_usd", "crediti_brandsearch", "passi": [{id, stato, stima, reale, decision_ids}] }`. Se il residuo scende sotto `rules.json > budget.stop_when_ledger_below_usd` sospendi i passi C2 e C3 e chiedi all'utente.

## Regole non negoziabili

- Nessun render senza `reference_image` e senza preflight del copy.
- Nessun prezzo, percentuale o data che non sia nell'offerta dichiarata. Per `scalers`: nessun prezzo.
- Kill e scale sono regole di codice di `rules.json`, non scelte di un modello.
- Pubblicazione su Meta solo dopo un si' umano. L'orchestratore non attiva campagne e non tocca i budget.
