# CreativeOS

Sistema agentico per creative Meta Ads costruito sui tool dell'MCP **AI Ads**: un Planner scrive il piano, un Orchestratore lo esegue, otto agenti specialisti fanno il lavoro. I motori immagine sono GPT Image 2, GPT Image 2.5 (Flare, Sunburst) e Nano Banana (2 e Pro).

Architettura completa con diagrammi: [ARCHITECTURE.md](ARCHITECTURE.md).

## File

| Percorso | Contenuto |
|---|---|
| `creativeos/ARCHITECTURE.md` | Strati, corsie, stati, router dei motori, costi, rischi |
| `creativeos/architettura.html` | La stessa architettura come pagina con i diagrammi: si apre con doppio clic nel browser |
| `creativeos/registry/tools.json` | I 38 tool AI Ads con agente responsabile, corsia, classe di costo, consenso e decisione D1-D7 |
| `creativeos/registry/engines.json` | Motori, route per fase e placement, fallback, torneo |
| `creativeos/registry/rules.json` | Soglie dei gate, portafoglio 70/20/10, regole kill/scale, ciclo di vita dei concept |
| `creativeos/schemas/creative-plan.schema.json` | Contratto fra Planner e Orchestratore |
| `creativeos/schemas/concept-card.schema.json` | Unita' di lavoro che passa fra gli agenti |
| `creativeos/examples/plan-scalers-plus.json` | Piano di esempio in 24 passi |
| `.claude/skills/creativeos/SKILL.md` | Orchestratore |
| `.claude/agents/creativeos-*.md` | Planner e agenti specialisti, ognuno con i suoi tool MCP |
| `tests/creativeos-registry.test.mjs` | Coerenza fra registro, agenti, router e piano di esempio |

## Uso in Claude Code

Con l'MCP AI Ads connesso, apri una sessione nella repo e chiedi un ciclo creativo, per esempio:

> Avvia CreativeOS per Scalers+: analizza le ads che stanno performando sull'account, proponi 3 concept nuovi e produci le creative feed e Stories. Reference: <url moodboard>. Budget 15 USD.

La skill `creativeos` chiama `health`, delega il piano a `creativeos-planner`, mostra costi e passi da approvare, poi esegue il DAG. I file di ogni run finiscono in `creativeos/runs/<plan_id>/` (esclusa da git).

## Verifica

```bash
npm test
```

Il test fallisce se un tool AI Ads resta senza agente, se un agente usa un tool che non possiede, se il router cita un motore sconosciuto o se il piano di esempio viola dipendenze, consensi o l'obbligo di pre-flight.
