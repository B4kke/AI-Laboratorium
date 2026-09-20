# 01 — System Architecture

## Architectural goal

Separate the product into three planes so that experiments remain reproducible and hosting choices do not leak into arena logic.

```text
CONTROL PLANE
web UI, experiment builder, auth, report requests
        |
        v
EXECUTION PLANE
scheduler -> experiment workers -> provider adapters
        |
        v
DATA / OBSERVABILITY PLANE
Postgres + event log + projections + artifacts
```

## Proposed monorepo

```text
apps/
  web/                     Next.js App Router UI + API facade
workers/
  runner/                  long-running experiment execution
packages/
  domain/                  IDs, schemas, common contracts
  agents/                  genome, memory, agent state
  arena/                   arena interface + built-in arenas
  evolution/               selection/mutation/crossover/lineage
  evaluation/              rating, holdout, stats, anti-overfit
  providers/               LLM provider interface + adapters
  events/                  event schema + projections
  reports/                 analytical report contracts
  db/                      schema/repositories/migrations
  ui/                      shared presentational components
```

## Control plane

Next.js handles:

- experiment creation and configuration
- browsing agents, generations and lineages
- live experiment view
- replay
- metrics/dashboard surfaces
- report requests and downloads
- provider/model capability display

Server Components should render read-heavy views where practical. Streaming/live state should use a narrowly scoped client layer, not turn the whole app into a client application.

## Execution plane

Long-running generations must not depend on a browser tab or request lifetime.

### Runner responsibilities

- claim queued work
- pin experiment configuration and provider snapshot
- instantiate arena and agents
- execute turns
- persist events incrementally
- enforce budgets and stop conditions
- evaluate outcomes
- run mutation/crossover pipeline
- persist generation snapshots
- publish progress
- resume safely after process interruption

The worker should be idempotent at step boundaries. A crash must not produce a second contradictory generation.

## State model

Prefer event-oriented persistence.

### Immutable records

- experiment created
- experiment configuration version
- model/provider snapshot
- arena version
- agent genome snapshot
- memory snapshot
- turn observation
- decision trace
- action
- world transition
- outcome
- evaluation result
- mutation proposal/result
- lineage edge
- report snapshot

### Mutable projections

- current experiment status
- current generation
- current population
- leaderboard projection
- live world state projection
- agent summary projection

Immutable events enable replay, debugging and future re-projection as UI requirements change.

## Suggested persistence

Postgres is the canonical store for metadata, experiment state and event indices.

Potential logical tables:

```text
experiments
experiment_versions
runs
generations
agents
agent_snapshots
genome_snapshots
memory_snapshots
arena_instances
events
matches
evaluations
ratings
lineage_edges
artifacts
provider_snapshots
```

Large replay blobs, generated PDFs or large analysis artifacts can move to object storage later. Do not optimize prematurely.

## Typed event contract

Every event should have a common envelope:

```ts
type EventEnvelope<TType, TPayload> = {
  id: string;
  experimentId: string;
  runId: string;
  generation: number;
  sequence: number;
  occurredAt: string;
  type: TType;
  actorId?: string;
  arenaVersion: string;
  payload: TPayload;
};
```

`sequence` is critical for deterministic display ordering. Wall-clock time alone is insufficient.

## Human-readable projection

Raw event payloads remain available for export/debugging, but the product default is a readable projection.

Example internal event:

```text
action.trade.executed
```

Readable UI projection:

```text
Agent 12 kjøpte 8 energienheter til 31 kreditter.
Likviditet: 840 -> 592.
Agenten oppga at målet var å redusere risikoen for en forventet energikrise.
```

The projection layer is versioned so old event logs can remain immutable while presentation improves.

## Arena plugin contract

Arenas should implement a common interface resembling:

```ts
interface Arena<TState, TObservation, TAction> {
  id: string;
  version: string;
  initialize(seed: string, config: unknown): TState;
  observe(state: TState, agentId: string): TObservation;
  legalActions(state: TState, agentId: string): unknown;
  apply(state: TState, actorId: string, action: TAction): TransitionResult<TState>;
  isTerminal(state: TState): boolean;
  summarize(state: TState): ArenaSummary;
}
```

Arena code, not the LLM, validates legal actions.

## Agent runtime contract

An agent receives only the bounded context required by the arena:

- current observation
- public history allowed by arena
- private information allowed by arena
- own current genome
- own memory projection
- legal action schema

The model returns structured output containing:

- action
- optional message to other agents
- explicit short decision rationale for the audit UI
- confidence
- memory candidate writes

Any `SOUL.md`/memory mutation happens in a separate mutation stage after outcome, never as arbitrary filesystem writes.

## Scheduling

Need two levels:

1. experiment queue
2. internal matchup/trial scheduler

The scheduler must account for:

- provider quota/rate limit
- maximum concurrency
- experiment priority
- seeded deterministic ordering
- retries
- trial replication requirements

## Realtime transport

Keep transport replaceable. Start with one of:

- SSE for server -> browser experiment event streams
- database-backed realtime subscription where already available

WebSocket is not mandatory for the first version because most interaction is server-to-client streaming plus normal mutations.

## PDF/report path

Do not generate PDF directly inside arena workers. Persist a completed report snapshot, render a report-oriented HTML representation, then convert/export. This separates experiment truth from presentation.

## Deployment profiles

### Profile A — Render-centric

- Next.js web service
- persistent/background runner service
- Postgres

This is operationally natural for long-running workers.

### Profile B — Vercel-centric/hybrid

- Next.js frontend/control plane on Vercel
- runner hosted in a runtime that safely supports long executions, or an explicitly validated durable Vercel workflow architecture
- shared Postgres

Do not force long generations into ordinary request/response functions merely to stay on one vendor.

## Evolution of the architecture

Phase 0 should establish contracts, storage and one arena before microservices. Separate packages and process boundaries conceptually, but begin with the smallest deployable architecture that can later split cleanly.
