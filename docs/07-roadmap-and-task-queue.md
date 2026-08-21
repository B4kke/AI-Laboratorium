# 07 — Roadmap and Task Queue

## Delivery strategy

Build the laboratory vertically. Each milestone should produce one end-to-end capability that can be demonstrated and measured rather than a large amount of disconnected framework code.

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

## P2 — Web product / observability

**Goal:** make the lab usable without terminal/log inspection.

### P2.1 Experiment dashboard

Use Next.js + shadcn/ui. Apply dashboard information hierarchy rather than generic admin-template layout.

### P2.2 Experiment builder

Start with minimal duel options; advanced configuration can expand later.

### P2.3 Live event narrative

Use AI Elements for AI-generated Markdown surfaces. Render canonical engine facts separately from agent/evaluator text.

### P2.4 Agent inspector

Tabs:

- overview
- SOUL
- memory
- decisions
- diffs
- evaluation
- lineage

### P2.5 Lineage view

Interactive graph + mobile focused ancestry path.

### P2.6 Replay

State-based step/play/jump replay from event log.

**P2 acceptance:** user can create, run, watch, inspect and replay an experiment from a phone-sized viewport.

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

### TASK-001 — Bootstrap project

Create monorepo skeleton and CI. No elaborate UI yet.

### TASK-002 — Domain contracts

Implement versioned schemas and IDs. Add contract tests.

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

### TASK-011 — First web vertical slice

Create experiment -> start run -> watch readable events -> inspect result.

### TASK-012 — Mobile verification

Verify narrow viewport, touch behavior and no overflow before expanding the dashboard.

## Do not start yet

Until the P1 loop works, avoid:

- giant economic simulation
- dozens of arenas
- sophisticated 3D visualization
- Kubernetes/microservice sprawl
- custom auth complexity
- model fine-tuning
- vector DB because «AI project»
- token-level chain-of-thought storage

## First milestone definition

The first milestone is not «the website looks cool».

It is:

> A reproducible seeded experiment can run multiple generations, evolve bounded `SOUL`/memory snapshots, promote a champion using repeated evaluation, replay its history, and expose all of this through one simple mobile-friendly web flow.
