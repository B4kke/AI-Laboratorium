# AI-Laboratorium

AI-Laboratorium er en avansert, webbasert plattform for å kjøre, observere og analysere evolusjonære multi-agent-eksperimenter med språkmodeller.

Målet er ikke bare å la to modeller «spille mot hverandre», men å bygge et reproducerbart laboratorium der agent-strategier kan selekteres, muteres, krysses, testes og sammenlignes over mange generasjoner. Agentenes evolverbare lag kan blant annet bestå av `SOUL.md`, strukturert langtidshukommelse, strategiregler og verktøypolicyer, mens selve basemodellen kan holdes konstant.

## Produktmål

Plattformen skal kunne:

- opprette arenaer og eksperimenter med 2–N agenter
- kjøre generasjoner med seleksjon, mutasjon, crossover og hall-of-fame
- bruke flere LLM-leverandører gjennom en felles provider-adapter
- bruke NVIDIA NIM som hovedleverandør og OpenCode Zen som sekundær/fallback, med runtime model discovery fremfor hardkodede modellister
- vise live hendelser i lesbar tekst på desktop og mobil
- vise agentens handling, observasjon, eksplisitte beslutningsbegrunnelse, confidence, verktøybruk og endringer i `SOUL.md`/memory uten å forsøke å eksponere privat chain-of-thought
- visualisere lineage, fitness, Elo/Glicko-lignende rating, Pareto-front, ressursutvikling og arena-state
- replaye hele kamper/generasjoner deterministisk der miljøet tillater det
- generere analyser og nedlastbare rapporter, inkludert PDF
- eksportere rådata for forskning uten at hoved-UI-et blir en JSON-viewer
- kjøres mobilvennlig som en moderne webapplikasjon
- kunne deployes på Vercel eller Render uten å låse domenelogikken til én host

## Første prinsipper

1. **Reproduserbarhet foran spektakel.** Seed, modell, prompt-/genomversjon, arena-versjon og evaluator skal kunne spores.
2. **Ingen permanent sletting av tapere.** En agent kan elimineres fra populasjonen, men historiske snapshots og lineage beholdes for analyse.
3. **Fitness er fler-dimensjonal.** En enkelt score skal ikke få lov til å definere «best» alene.
4. **Holdout-evaluering.** Champion må testes på miljøer og seeds den ikke har evolvert direkte mot.
5. **Observerbart, men ikke rå chain-of-thought.** Produktet viser strukturerte decision traces og handlinger, ikke skjult intern resonnering.
6. **Sandbox først.** Agenten får bare endre sitt eget virtuelle genom/minne gjennom eksplisitte API-er; ikke host-filsystem, evaluator eller andre agenters state.
7. **Provider-uavhengighet.** Arena- og evolusjonsmotoren skal ikke kjenne NVIDIA/OpenCode-spesifikke detaljer.
8. **Statistikk må kunne etterprøves.** Resultater skal inkludere usikkerhet, antall trials, seeds og metodikk.

## Planlagt arkitektur

```text
apps/web                 Next.js web UI / API surface
packages/arena           arena-regler og world state
packages/evolution       seleksjon, mutation, crossover, lineage
packages/agents          agent runtime, genome og memory contracts
packages/providers       NVIDIA NIM / OpenCode Zen adapters
packages/evaluation      fitness, ratings, holdouts, statistics
packages/events          typed event log + readable projection
packages/reports         analysis/report/PDF pipeline
packages/db              persistence contracts / migrations
workers/runner           langvarige experiment workers
```

## Foundation plan

Les i denne rekkefølgen:

1. [`AGENTS.md`](AGENTS.md) — arbeidskontrakt for GPT Work/Codex
2. [`docs/00-project-charter.md`](docs/00-project-charter.md) — mål, forskningsspørsmål og scope
3. [`docs/01-system-architecture.md`](docs/01-system-architecture.md) — control/execution/data plane, event store og runtime
4. [`docs/02-evolution-and-evaluation.md`](docs/02-evolution-and-evaluation.md) — genome, memory, seleksjon, mutation, holdout og statistikk
5. [`docs/03-product-ui-and-observability.md`](docs/03-product-ui-and-observability.md) — mobil UI, live arena, decision traces og lineage
6. [`docs/04-providers-runtime-and-deployment.md`](docs/04-providers-runtime-and-deployment.md) — NVIDIA NIM, OpenCode Zen, free-only policy og Render/Vercel
7. [`docs/05-reporting-and-analysis.md`](docs/05-reporting-and-analysis.md) — analyser, rapporter og PDF
8. [`docs/06-security-and-experiment-integrity.md`](docs/06-security-and-experiment-integrity.md) — sandbox, evaluator-integritet og holdout-secrecy
9. [`docs/07-roadmap-and-task-queue.md`](docs/07-roadmap-and-task-queue.md) — P0–P6 og konkret TASK-001 → TASK-012

Første milepæl er eksplisitt definert som et **reproduserbart multi-generation vertical slice**, ikke bare en pen nettside.
