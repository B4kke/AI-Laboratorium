# 04 — Providers, Runtime and Deployment

## Provider strategy

The experiment engine talks only to an internal provider interface. NVIDIA NIM and OpenCode Zen are adapters, not architectural dependencies.

```ts
interface ModelProvider {
  id: string;
  listModels(): Promise<ModelDescriptor[]>;
  generate(request: NormalizedGenerationRequest): Promise<NormalizedGenerationResult>;
  stream?(request: NormalizedGenerationRequest): AsyncIterable<NormalizedGenerationEvent>;
  health(): Promise<ProviderHealth>;
}
```

Normalize:

- model identity
- capabilities
- tool support
- structured-output support
- context limit where discoverable
- latency
- usage/tokens when provider reports them
- finish reason
- provider error class
- retryability

## NVIDIA NIM

Official hosted prototype APIs currently expose free endpoints for multiple models through an OpenAI-compatible API. Current examples use:

```text
https://integrate.api.nvidia.com/v1
```

NVIDIA NIM documentation also exposes OpenAI-compatible endpoints such as `/v1/chat/completions`, `/v1/responses` and `/v1/models`.

Do not hardcode a permanent list of free models. Store a provider snapshot when an experiment starts because availability and terms can change.

Initial adapter goals:

- model discovery
- chat/responses support as required by selected model
- streaming
- structured action output
- normalized retries/errors
- request timeout and cancellation
- per-model capability metadata

## OpenCode Zen

Zen provides an API gateway with model discovery at:

```text
https://opencode.ai/zen/v1/models
```

Current documentation exposes both Responses and OpenAI-compatible Chat Completions endpoints, and includes models explicitly labelled `Free`.

Important: free model availability is mutable. The app should fetch current metadata and mark the exact provider/model snapshot used by each run.

Initial adapter goals:

- discover models dynamically
- identify models marked free from provider metadata where reliably exposed
- support `/v1/responses` and `/v1/chat/completions` through normalized adapter paths
- reject silently falling from a configured free-only policy into a paid model

## Provider policy modes

Experiment config should support:

### Exact
Use exactly provider/model X or fail.

### Free-only fallback
Use configured free providers/models only. Never incur paid fallback silently.

### Capability fallback
Fallback among models satisfying required capabilities.

### Comparison
Pin different agents/roles to different models for controlled experiments.

## Model snapshot

Every run stores:

- provider
- provider model ID
- discovered display name
- endpoint family
- relevant capability flags
- pricing/free classification if known at start
- snapshot timestamp
- request settings

This prevents future UI from pretending an old run used today's provider catalog.

## Rate and quota control

A central scheduler should enforce:

- max requests in flight per provider
- optional max requests in flight per model
- exponential backoff + jitter
- `Retry-After` handling
- circuit breaker on repeated provider failures
- configurable experiment token/request budget
- cancellation propagation

Provider rate limits are an operational input, not an arena mechanic. A throttled provider must not disadvantage one competitor inside the game.

## Fairness under provider latency

Never use wall-clock response speed as an arena advantage unless the experiment explicitly studies latency.

Turn deadlines should either:

- apply equally using model-compute timeout rules, or
- be disabled as a game mechanic and treated only as operational timeout.

## Structured output

Arena actions should be parsed into a typed schema. Free-form prose may accompany the action as communication or decision rationale, but canonical state transitions use validated fields.

If a provider lacks reliable native structured output, use a constrained JSON/text parser at the adapter boundary and reject invalid actions rather than letting malformed text mutate world state.

## Prompt/version management

Prompts are code/data artifacts and must be versioned.

Track separately:

- system/runtime prompt
- arena observation template
- action schema version
- mutation prompt
- evaluator prompt
- report-analysis prompt

A benchmark is not comparable when these change without versioning.

## Hosting principles

The application contains two very different workloads:

1. interactive web/control-plane requests
2. long-running, bursty experiment workers

Do not assume one host primitive is optimal for both.

## Render deployment profile

Good conceptual fit for a first integrated deployment because a persistent worker can run experiments independently of HTTP request lifetime.

Target shape:

```text
web service       Next.js/control plane
worker service    experiment runner
Postgres          shared canonical state
```

Before implementation, verify current Render plan limits and whether the chosen tier supports the required background-worker/runtime behavior.

## Vercel deployment profile

Vercel is a strong fit for the frontend and Next.js control plane.

Long-running experiment execution must use a runtime whose duration/retry semantics are explicitly validated. Possible future options include a durable workflow/queue architecture or a separate runner process outside normal request functions.

Do not choose a Vercel-only architecture until current duration, queue/workflow and cost constraints are checked against 100+ generation experiments.

## Recommended first deployment decision

Keep the code portable, but implement the first runner as a normal long-lived Node process with a database-backed queue contract.

That allows:

- local development
- Render worker deployment
- later replacement by a Vercel durable workflow/queue implementation without rewriting arena/evolution packages

### Implementert runtimeprofil

Denne profilen er nå kodet som:

- `apps/web`: validerer/kølegger jobber og leser status
- `packages/db`: kanoniske agentsnapshots, events, dueller, lineage og leased Evolution-jobber i PostgreSQL
- `workers/runner`: langlivet Node-prosess som claimer jobber, fornyer lease, kjører ekte providerkall og persisterer hvert barnesnapshot
- `render.yaml`: web + PostgreSQL + separat Docker-worker

Worker og web oppretter providerregister fra de samme miljøvariabelnavnene. Agentplasser lagrer bare provider-/modell-ID, aldri API-nøkkelen.

## Environment variables

Likely initial secret/config names:

```text
DATABASE_URL
NVIDIA_API_KEY
OPENCODE_ZEN_API_KEY
APP_BASE_URL
WORKER_CONCURRENCY
PROVIDER_FREE_ONLY
```

Never expose provider keys to the browser.

## Cost/usage accounting

Even when using free endpoints, track:

- calls
- input/output tokens when available
- failed/retried calls
- model/provider
- generation/trial attribution

This lets the user estimate what a large experiment would cost if free access changes later.

## Degraded mode

If every external provider is unavailable, the UI should remain functional for:

- browsing past experiments
- replay
- reports
- comparison
- scripted/mock arena tests

Provider outage should not make the laboratory unreadable.

## Official references checked during foundation planning

- NVIDIA NIM API reference: `https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html`
- NVIDIA hosted model catalog: `https://build.nvidia.com/`
- OpenCode Zen: `https://opencode.ai/docs/zen/`

Implementation agents must re-check current docs before coding provider-specific APIs.
