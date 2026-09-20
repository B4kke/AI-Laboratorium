# 03 — Product UI and Observability

## Product principle

The web app should make a complex experiment understandable without forcing the user to inspect logs, JSON or database rows.

The default experience is **live narrative + visual state + metrics**, with raw data available as an expert/export layer.

The product must support both a simple “play two AIs against each other” experience and advanced evolutionary studies. A new user should not need to understand populations, mutation or holdouts before running something interesting.

## Main navigation

### Playground
Fast entry point for 1v1 experiments. Choose two models/agents and a built-in duel, or describe a game in natural language and let the Arena Designer create a validated ruleset.

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

## Playground / Quick Duel

The home experience should expose the shortest path to value:

```text
What do you want to test?
┌──────────────────────────────────────────────────────┐
│ "Lag en lek hvor to AI-er må forhandle om ..."      │
└──────────────────────────────────────────────────────┘
[ Create duel ]

Quick starts
[ Prisoner's Dilemma ] [ Negotiation ] [ Auction ]
[ Bluff ]              [ Survival ]    [ Trust ]

Agent/Model A                     Agent/Model B
[ NVIDIA/Zen model or champion ] [ NVIDIA/Zen model or champion ]
```

Built-in duels should be runnable with minimal configuration. The user can optionally set agent names, a short role/personality instruction, a saved `SOUL.md` preset and memory on/off.

### Describe the game

Natural-language input is converted by an Arena Designer into a constrained `ArenaSpec`, validated and then rendered back as readable rules.

The preview should read like a game sheet, for example:

**Market Crash — 20 rounds**

- Both agents begin with 1,000 credits.
- One role receives a private warning about the crash.
- Each turn allows BUY, SELL, HOLD and one message.
- The crash happens on a seeded round between 10 and 15.
- Highest terminal net worth wins.

Primary buttons:

- **Run duel**
- Edit idea
- Advanced rules

Do not make “inspect JSON” part of the normal flow.

### Post-duel actions

After any match expose:

- Run again / new seed
- Swap sides
- Best of N
- Change A/B model or agent
- Save as template
- Compare
- Generate report
- **Evolve this setup**

This creates a natural product ladder from curiosity to research:

```text
idea -> duel -> repeated test -> benchmark -> evolution
```

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

### Simplified 1v1 live view

A Quick Duel should use a lighter presentation than a population experiment:

```text
┌──────────────────────┬──────────────────────┐
│ Agent A              │ Agent B              │
│ model / score/state  │ model / score/state  │
├──────────────────────┴──────────────────────┤
│            World / round state              │
├─────────────────────────────────────────────┤
│ readable conversation + action timeline     │
│ A offered ...                               │
│ B replied ...                               │
│ A chose SELL ...                            │
├─────────────────────────────────────────────┤
│ Round 8/20       [pause view] [step] [speed]│
└─────────────────────────────────────────────┘
```

On mobile prioritize current state, latest interaction, compact A/B status, timeline, then expandable decision traces.

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