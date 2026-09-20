# 07 — Roadmap and Task Queue

## Delivery strategy

Build the laboratory vertically. Each milestone should produce one end-to-end capability that can be demonstrated and measured rather than a large amount of disconnected framework code.

The product must have two complementary entry points from early development:

1. **Playground:** fast 1v1 duels, built-in games and natural-language arena creation.
2. **Laboratory:** repeated evaluation, evolution, lineage, holdouts and research-grade analysis.

Both paths use the same arena/event/evaluation engine. Playground is not a throwaway demo.

## P0 — Foundation contracts

**Goal:** establish a stable core that later UI and arenas can trust.

### P0.1 Bootstrap monorepo

- Next.js App Router web app
- TypeScript strict mode
- shared package structure from architecture doc
- lint/typecheck/test scripts
- environment schema
- CI on pull requests

**Evidence:** fresh checkout can install, typecheck, test and build.

### P0.2 Domain IDs and versioned schemas

Implement typed contracts for:

- Experiment
- Run
- Generation
- Agent
- GenomeSnapshot
- MemorySnapshot
- Arena
- Match/Trial
- EventEnvelope
- Evaluation
- LineageEdge
- ProviderSnapshot
- ArenaSpec / generated arena version

Use runtime validation at external/untrusted boundaries.

**Evidence:** schema tests including invalid/untrusted payloads.

### P0.3 Event store + projections

Implement append-only event persistence and projections for:

- current run status
- generation state
- agent state
- readable event feed

**Evidence:** replaying stored events reconstructs the same projection.

### P0.4 Provider abstraction

Implement provider-neutral contracts, then:

1. NVIDIA NIM adapter
2. OpenCode Zen adapter
3. mock/scripted provider for deterministic CI

Requirements:

- runtime model discovery
- exact/free-only provider policies
- request budgets
- retries/backoff
- normalized errors
- model snapshot persistence

**Evidence:** adapter integration tests use mocked provider responses; optional manual smoke uses configured API keys.

## P1 — First complete evolutionary loop

**Goal:** prove evolution end-to-end before building the complex economic world.

### P1.1 Minimal duel arena

A deterministic, seeded game with:

- two agents
- bounded negotiation messages
- typed actions
- deterministic scoring
- role swapping

Possible starting game: repeated Prisoner's Dilemma variant with finite resources and partial information.

### P1.2 Agent genome + memory controller

Implement:

- immutable genome snapshots
- bounded memory categories
- provenance
- diff generation
- mutation proposal validation

### P1.3 Evolution engine v1

Implement:

- elitism
- tournament/rank selection
- reflection mutation
- hall of fame
- retirement without deletion
- deterministic seeded scheduler

### P1.4 Evaluation v1

Implement:

- repeated trials
- role swapping
- win rate
- Wilson interval
- simple Elo leaderboard
- baseline agent
- hidden holdout seeds

**P1 acceptance:** run 10+ generations, produce a lineage and demonstrate champion vs baseline with uncertainty.

## P1.5 — Playground and AI Arena Builder

**Goal:** make the engine useful for spontaneous two-agent experiments before the user needs to configure evolution.

### P1.5.1 Built-in Quick Duels

Ship a small set of versioned 1v1 templates using the normal arena engine:

- Prisoner's Dilemma
- trust/betrayal
- negotiation over fixed resources
- auction
- bluff/truth
- survival resource split
- coordination

The user selects Model/Agent A, Model/Agent B and presses **Start duel**.

### P1.5.2 ArenaSpec DSL

Implement a constrained declarative `ArenaSpec` with engine-owned operators for:

- roles
- initial state/resources
- public/private information
- legal actions
- communication
- turn order
- transitions
- terminal conditions
- scoring
- randomness
- budgets

Model-generated executable code is explicitly out of scope. Generated specs are data interpreted by trusted runtime code.

### P1.5.3 Natural-language Arena Designer

Allow the user to type a game idea in normal language. An Arena Designer model produces an `ArenaSpec` candidate.

Before execution:

1. schema validate
2. semantic validate
3. run scripted/random-policy lint simulations
4. render a readable rules preview
5. only then allow real LLM agents to enter the arena

### P1.5.4 Duel escalation

After a duel, support:

- run again/new seed
- swap sides
- Best of N
- model/agent replacement
- save as template
- compare
- **Evolve this setup**

This establishes the intended progression:

```text
idea -> duel -> repeated test -> benchmark -> evolution
```

**P1.5 acceptance:** from a phone-sized viewport, a user can type a novel two-agent game, receive readable validated rules, run the duel, watch it live, inspect the winner and replay it without reading JSON.

## P2 — Web product / observability

**Goal:** make the lab usable without terminal/log inspection.

### P2.1 Playground / home

The landing experience should expose:

- “Describe the game” input
- Quick Duel templates
- Model/Agent A vs Model/Agent B selectors
- recent duels/experiments

Do not make the research dashboard the only entry point.

### P2.2 Experiment dashboard

Use Next.js + shadcn/ui. Apply dashboard information hierarchy rather than generic admin-template layout.

### P2.3 Experiment builder

Start with minimal duel options; advanced configuration can expand later.

### P2.4 Live event narrative

Use AI Elements for AI-generated Markdown surfaces. Render canonical engine facts separately from agent/evaluator text.

### P2.5 Agent inspector

Tabs:

- overview
- SOUL
- memory
- decisions
- diffs
- evaluation
- lineage

### P2.6 Lineage view

Interactive graph + mobile focused ancestry path.

### P2.7 Replay

State-based step/play/jump replay from event log.

**P2 acceptance:** user can create, run, watch, inspect and replay both a simple duel and an evolutionary experiment from a phone-sized viewport.

## P3 — Reporting and analysis

### P3.1 Metric computation layer

Centralize metric definitions and provenance.

### P3.2 Analytical report model

Build canonical report snapshot containing:

- experiment metadata
- metrics
- uncertainty
- chart datasets
- lineage highlights
- limitations

### P3.3 Report reader

Responsive in-app report.

### P3.4 PDF export

HTML/print-based deterministic export with run provenance.

### P3.5 Comparison reports

Support experiment A/B and champion/baseline comparisons.

### P3.6 Duel reports

One-off duels should generate a lightweight report; Best-of-N/benchmark mode should use statistical comparison reporting and PDF export.

**P3 acceptance:** a completed run can generate a report that remains unchanged even if the live experiment data later evolves.

## P4 — Economic World

**Goal:** first rich, open-ended arena.

### P4.1 Accounting engine

Deterministic double-entry-like or otherwise invariant-checked ledger for:

- cash
- inventory
- debt
- assets
- transfers
- contracts

### P4.2 Market engine

- resources
- production/consumption
- market clearing or deterministic exchange mechanism
- transaction costs
- liquidity

### P4.3 Contracts

Typed offers, acceptance, settlement and default consequences.

### P4.4 Shocks/regimes

Seeded procedural events:

- supply shock
- demand shock
- credit tightening
- technology improvement
- scarcity

### P4.5 Private signals

Controlled information asymmetry.

### P4.6 Economic evaluation

Metrics include:

- survival
- terminal wealth distribution
- drawdown
- liquidity failures
- risk-adjusted return
- contract reliability
- prediction calibration

**P4 acceptance:** same agent lineage is tested across unseen economic regimes and can be compared against scripted and LLM baselines.

## P5 — Advanced evolution

- Pareto / multi-objective selection
- novelty search / behavioral diversity
- explicit crossover operators
- island populations
- migration between populations
- species/strategy clustering
- adaptive opponent sampling
- Glicko-2 or uncertainty-aware rating
- champion league across specialized lineages
- sealed generalization gauntlet

## P6 — Research-grade features

- experiment templates
- batch studies
- statistically planned experiment sizes
- reproducibility bundles
- shareable report snapshots
- richer lineage analytics
- model/provider comparison studies
- plugin SDK for new arenas
- scripted baseline SDK
- evaluator calibration suite

## First frontend skill sequence

When GPT Work starts frontend implementation, use these skills deliberately:

1. `vercel/nextjs` for architecture and App Router boundaries
2. `vercel/shadcn` for product primitives
3. `vercel/ai-elements` for generated text/event/rationale rendering
4. `vercel/ai-sdk` only after provider/runtime contracts are clear and current APIs are verified
5. `vercel/react-best-practices` after multi-component implementation
6. `vercel/agent-browser-verify` / `vercel/verification` for real browser validation

## First analytics/evaluation skill sequence

1. `data-analytics/design-kpis` to define primary outcomes, drivers and guardrails per arena
2. `data-analytics/validate-data` for metric/result QA
3. `data-analytics/visualize-data` for quantitative figures
4. `data-analytics/build-dashboard` for operational experiment monitoring
5. `data-analytics/build-report` for durable experiment reports

## Immediate GPT Work queue

Work should take these in order unless fresh evidence invalidates an assumption.

### Implementasjonsbevis per 2026-08-23

Følgende er implementert i kode, men skal fortsatt skilles fra produksjonsverifisering:

- **Agent-snapshot:** PostgreSQL lagrer en stabil «Agent N»-identitet og immutable snapshots som binder provider/modell, `SOUL.md`, øvrige virtuelle filer, bounded memory og foreldre. UI/API kan hente et eksakt agentnummer og komplett versjonshistorikk/lineage uavhengig av paginert liste.
- **Quick Duel:** lagrede snapshots løses på serveren; den faktiske siste motpartsreplikken og en immutable samtalehistorikk går inn i neste providerkall, og UI viser providerens faktiske `message` uten fabrikkert fallback.
- **Evolution v1:** konfigurasjon støtter 1–100 brukerbestemte utslagsrunder, 10–100 agenter, en sentral standardmodell og per-plass-overstyring av lagret agent/modell. Planen ender alltid med én sluttmutert agent. Scripted providers avvises som evolusjonskandidater, og informativt bruksestimat er ingen kjøresperre.
- **Mutasjon:** hver overlevende modell lager først et validert selvrefleksjonsforslag for egen `SOUL.md`, filer, minne og taktikk. En eksplisitt remote hoved-AI mottar forslaget og bare observerbare kampdata, og avgjør den endelige validerte versjonen. Nye immutable snapshots, diff, provider/model-snapshots, memory-provenance og lineage persisteres under samme stabile Agent N-identitet; tapere merkes retired uten sletting.
- **Evaluering:** gjentatte seedede trials i sidebyttede par, fitnessvektor, evaluatorversjon, generasjonsvis hall of fame, Wilson-intervall og forseglede holdout-seeds ligger i resultatproveniensen. Champion-promotering krever positiv margin og nedre 95 %-grense over 50 % mot en historisk incumbent når en finnes.
- **Runtime:** web er kontrollplan; PostgreSQL-kø og en separat Node-worker kjører lange forsøk, fornyer lease under dueller og gjenopptar idempotente duel-/mutasjonssteg etter worker-restart.

Automatiserte tester bruker en fake remote provider og beviser at modellgenerert SOUL/minne påvirker nye snapshots uten å bruke ekstern kvote. En produksjonssmoke med ekte provider-nøkkel, faktisk PostgreSQL og deployet worker må gjennomføres før funksjonen kalles produksjonsklar. Bredere hall-of-fame-sampling, miljøperturbasjon og distribuert provider-rateplanlegging står fortsatt igjen fra den fulle P1/P2-planen.

### TASK-001 — Bootstrap project

Create monorepo skeleton and CI. No elaborate UI yet.

### TASK-002 — Domain contracts

Implement versioned schemas and IDs. Add contract tests, including an initial `ArenaSpec` contract.

### TASK-003 — Event primitives

Append-only event contract, in-memory first if database setup would block progress. Add deterministic projection/replay test.

### TASK-004 — Mock provider

Create deterministic provider adapter to unblock arena/evolution tests without burning API quota.

### TASK-005 — Minimal duel arena

Implement one seeded deterministic arena with typed actions.

### TASK-006 — Agent snapshot model

Implement genome/memory snapshots and diffable mutations.

### TASK-007 — Evolution loop

Run a multi-generation simulation entirely in tests/CLI with mock provider.

### TASK-008 — Evaluation

Add repeated trials, role swaps, Wilson interval and baseline comparison.

### TASK-009 — NVIDIA NIM adapter

Re-read current NVIDIA docs; implement only verified endpoint/capability behavior.

### TASK-010 — OpenCode Zen adapter

Re-read current Zen docs/model metadata; support free-only policy without silent paid fallback.

### TASK-011 — First web vertical slice / Quick Duel

Create Playground -> select A/B -> choose built-in duel -> start -> watch readable events -> inspect result -> replay.

This should be the first visible product experience, not a giant dashboard.

### TASK-012 — ArenaSpec validator

Implement declarative arena schema, semantic validation and scripted/random-policy lint simulation. No model-generated code execution.

### TASK-013 — Natural-language Arena Designer

Prompt -> ArenaSpec candidate -> validation -> readable rules preview -> run. Persist originating prompt, designer model snapshot and arena version.

### TASK-014 — Duel escalation

Add new seed, side swap, Best-of-N, save template, compare and `Evolve this setup`.

### TASK-015 — Mobile verification

Verify Playground and live duel at narrow viewport, touch behavior and no overflow before expanding the dashboard.

## Do not start yet

Until the P1 loop works, avoid:

- giant economic simulation
- dozens of hand-built arenas
- sophisticated 3D visualization
- Kubernetes/microservice sprawl
- custom auth complexity
- model fine-tuning
- vector DB because «AI project»
- token-level chain-of-thought storage
- arbitrary model-generated server code for arenas

## First milestone definition

The first milestone is not «the website looks cool».

It is:

> A user can run a simple seeded two-agent duel from a mobile-friendly web flow, watch and replay it in readable form; the same underlying engine can run multiple generations, evolve bounded `SOUL`/memory snapshots, promote a champion using repeated evaluation, and accept a validated natural-language-generated ArenaSpec without executing arbitrary generated code.
