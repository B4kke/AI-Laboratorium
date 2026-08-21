# 03 — Product UI and Observability

## Product principle

The web app should make a complex experiment understandable without forcing the user to inspect logs, JSON or database rows.

The default experience is **live narrative + visual state + metrics**, with raw data available as an expert/export layer.

## Main navigation

### Dashboard
Shows active experiments, recent champions, failures, provider status, queue depth and notable changes.

### Experiments
Create, inspect, pause/resume, compare and archive experiment runs.

### Arena
Live and replay views of the simulated world.

### Agents
Inspect genome, memory, rating, lineage and historical behavior.

### Lineage
Interactive ancestry graph across generations.

### Reports
Generated experiment analyses, comparisons and PDF exports.

### Providers
Model availability, capabilities, quotas/rate state and recent latency/error observations.

## Experiment builder

Wizard/advanced form should support:

- arena type/version
- population size
- generation count or stop condition
- provider/model per role
- baseline agents
- mutation strategy
- selection strategy
- memory budget
- temperature/sampling options where supported
- per-turn/token/cost budgets
- number of trials/seeds
- holdout policy
- evaluator configuration
- concurrency
- deterministic experiment seed

Advanced settings can be collapsed. The normal user should not need to understand every parameter.

## Live Arena view

Desktop layout:

```text
+--------------------------------------------------------------+
| Experiment 42   Gen 18/100   Running   12 agents             |
+------------------------+-------------------------------------+
| World / arena state    | Live event narrative                |
| charts / map / board   |                                     |
|                        | Agent 7 offered Agent 4 ...          |
|                        | Agent 4 rejected ...                 |
|                        | Market shock: energy +38%            |
+------------------------+-------------------------------------+
| Population / scores / resource state / generation timeline   |
+--------------------------------------------------------------+
```

Mobile layout stacks these surfaces with a persistent compact experiment header and tabs for Live / Agents / Metrics / Lineage.

## Readable event stream

Every event gets a human-readable projection.

Do not display:

```json
{"type":"ACTION","actor_id":"a7","payload":{"qty":8}}
```

Display:

> **Agent 7 kjøpte 8 energienheter.**  
> Beholdningen økte fra 14 til 22. Kontantreserven falt til 592 kreditter.

Expandable technical details may show IDs/schema fields for debugging, but the default is prose.

## Decision trace

The product should make agent behavior inspectable without exposing hidden chain-of-thought.

For each important decision, show a compact card:

- **Observerte:** bounded facts the agent received
- **Mål:** explicit objective selected by the agent
- **Valgte:** action
- **Begrunnelse:** short user-facing rationale generated for audit
- **Confidence:** calibrated/self-reported value, clearly labelled as such
- **Resultat:** engine-computed outcome
- **Lærte:** accepted memory write, if any
- **Endret strategi:** relevant genome diff, if mutation stage changed it

This trace is a product artifact generated intentionally for observability. It is not a request for raw internal reasoning.

## Agent detail page

Header:

- name / immutable agent ID
- generation
- status: active / retired / champion / baseline
- provider + model snapshot
- parents
- rating + uncertainty/sample count

Tabs:

### Overview
Performance summary, current role, traits and major metrics.

### SOUL
Rendered Markdown and version history.

### Memory
Human-readable categorized memory with provenance and age.

### Decisions
Searchable decision traces and actions.

### Lineage
Parents, siblings, descendants and mutation operations.

### Diffs
Side-by-side or unified diffs between genome generations.

### Evaluation
Training, validation and sealed-holdout results kept visually distinct.

## Lineage visualization

Interactive DAG with:

- generations on horizontal or vertical axis
- parent -> child edges
- mutation/crossover edge types
- nodes sized by selected metric
- node badges for champion/hall-of-fame
- filters by arena/model/lineage
- tap/click to inspect genome diff

Must remain usable on mobile; default mobile view can show a focused ancestry path instead of the whole graph.

## Metrics views

Important default charts:

- active population by generation
- champion fitness/rating over time
- win-rate with uncertainty
- holdout gap
- behavioral diversity
- mutation acceptance/success rate
- provider latency/error rate
- token/request usage

Arena-specific panels can add wealth, resource, survival or negotiation metrics.

## Comparisons

Allow direct comparison of:

- agent A vs B
- champion vs baseline
- generation N vs generation M
- provider/model A vs B
- memory-on vs memory-off experiment
- selection strategy A vs B

Comparison surfaces should show both effect and uncertainty.

## AI-generated text rendering

Use AI Elements for generated Markdown/text surfaces rather than raw JSX text. Generated reports, decision rationales, mutation summaries and analysis cards should render clean Markdown with code/math support when needed.

AI-generated content should always be visually distinguishable from canonical engine facts.

Example:

- **Engine fact:** `Wealth = 14,220`
- **Agent explanation:** `Agenten sier at ...`
- **Evaluator analysis:** `Evaluatoren vurderer ...`

Do not blend these evidence classes.

## Realtime UX

UI should support:

- streaming new events
- pause visual feed without stopping experiment
- jump to latest
- filter by agent/event class
- pin important agents
- slow mode / step replay
- generation markers
- error/retry markers

Large experiments need aggregation so the browser is not asked to render every token-level event.

## Replay

Replay must be state-based, not a video recording.

Controls:

- play/pause
- step turn
- jump generation
- speed
- filter agent
- open decision trace at current state
- compare with another trial

## Accessibility and mobile

Minimum bar:

- keyboard navigable desktop controls
- semantic labels
- no chart where color is the only encoding
- touch targets suitable for phone
- no horizontal-page overflow at narrow width
- tables become cards/scroll regions deliberately
- graphs provide a textual fallback/summary

## Visual language

Prefer a serious laboratory/operations aesthetic over generic chatbot styling.

- dark mode first, light mode supported
- dense but legible information hierarchy
- clear status semantics
- Geist or equivalent clean typography
- monospace only for IDs/code/raw fields
- avoid decorative gradients and excessive glassmorphism

## Observability boundaries

Application observability and experiment observability are separate.

### Application
- request latency
- worker health
- DB errors
- provider errors
- queue depth
- realtime delivery lag

### Experiment
- generation progress
- event throughput
- agent actions
- retries
- mutation success
- evaluation state

Do not leak secrets, full provider payloads or sensitive auth headers into either stream.
