# 08 — Playground and AI Arena Builder

## Why this exists

AI-Laboratorium must not require a full evolutionary study every time the user wants to experiment.

The product needs a low-friction **Playground** where a user can put two agents against each other in seconds, watch the interaction live, inspect the result, and optionally turn that one-off duel into a repeatable benchmark or evolutionary experiment.

The simple surface and the research-grade surface share the same arena/event/evaluation primitives. Playground is not a toy implementation beside the real system; it is the easiest entry point into the same engine.

## Primary user flows

### 1. Quick Duel

The fastest path:

1. choose Agent/Model A
2. choose Agent/Model B
3. choose a built-in game
4. optionally edit a few rules
5. press **Start duel**
6. watch the duel live in readable text
7. inspect winner, score, decision traces and replay

Default built-in duel templates should include several qualitatively different games:

- repeated Prisoner's Dilemma
- trust / betrayal game
- negotiation over a fixed resource pool
- sealed-bid auction
- bargaining with private information
- bluff / truth game
- survival resource split
- coordination game where both can win or both can lose

Each template must be seeded and versioned.

### 2. “Describe the game”

A prominent text box should allow instructions such as:

> To modeller har 1 000 kreditter hver. De kan handle en ressurs i 20 runder. Én av dem vet at markedet krasjer mellom runde 10 og 15. De kan sende meldinger til hverandre, kjøpe, selge eller holde. Den med høyest formue etter krasjet vinner.

or:

> Lag en duell hvor de må overtale en nøytral AI-dommer til å velge deres løsning, men de får bare fem meldinger hver.

An **Arena Designer** model converts the natural-language idea into a constrained `ArenaSpec` draft. The generated arena is shown back to the user as readable rules before execution.

The user should see:

- title and short description
- players/roles
- initial resources/state
- public information
- private information per role
- legal actions
- communication rules
- turn order
- terminal condition
- scoring/win condition
- randomness/seed behavior
- budgets and maximum rounds
- evaluator method if deterministic scoring is impossible

The default action should be **Run**, not “open JSON”. Advanced users can inspect the underlying spec separately.

### 3. Duel → Experiment

After a one-off duel, offer actions:

- **Run again** with a new seed
- **Swap sides**
- **Best of N**
- **Change model**
- **Save as template**
- **Compare results**
- **Evolve this setup**

`Evolve this setup` converts the arena configuration into a normal evolution experiment where population, generations, mutation and holdouts can be added.

This gives the product a natural progression:

```text
idea -> duel -> repeated test -> benchmark -> evolution
```

## Arena Designer architecture

The Arena Designer must generate a declarative spec, **not arbitrary executable code**.

Example conceptual contract:

```ts
type ArenaSpec = {
  schemaVersion: string;
  title: string;
  description: string;
  players: PlayerRoleSpec[];
  initialState: StateDefinition;
  observations: ObservationPolicy[];
  actions: ActionDefinition[];
  communication: CommunicationPolicy;
  turnPolicy: TurnPolicy;
  transitionRules: RuleDefinition[];
  terminalRules: RuleDefinition[];
  scoring: ScoringDefinition;
  randomness: RandomnessPolicy;
  budgets: ArenaBudgets;
};
```

The actual runtime interprets this whitelisted DSL/spec with engine-owned operators.

Never `eval` model output, dynamically import generated code, or let an arena-generation prompt write server-side TypeScript/Python that is immediately executed.

## Arena generation pipeline

```text
User idea
   ↓
Arena Designer LLM
   ↓
ArenaSpec candidate
   ↓
Schema validation
   ↓
Semantic validator
   ↓
Simulation/lint checks
   ↓
Readable rule preview
   ↓
Run
```

### Schema validation

Reject malformed output and unknown operators.

### Semantic validation

Check at minimum:

- every agent has at least one legal path at each reachable non-terminal state where practical
- maximum turns/time/token budget exists
- terminal condition is reachable or hard-stop exists
- scores are defined for terminal/hard-stop states
- resource transfers preserve configured invariants
- hidden information cannot leak through the observation contract
- role count matches the requested duel mode
- no generated tool or filesystem/network capability is smuggled into the arena

### Simulation/lint checks

Before spending real model calls, run scripted/random policies against the generated spec to catch obvious deadlocks, impossible actions and broken scoring.

## Deterministic vs evaluator-scored games

Prefer deterministic engine scoring whenever the user’s game can be represented that way.

Examples:

- wealth after 20 turns
- surviving agents
- resource ownership
- auction utility
- contract settlement
- points from explicit rules

Some user ideas require qualitative judging. In those cases the spec may use an evaluator rubric with explicit criteria.

Evaluator-scored games must store:

- rubric version
- evaluator provider/model snapshot
- per-criterion scores
- short audit rationale
- role/order randomization where relevant
- repeated judgments when the result is close or high-stakes for champion selection

A one-off Playground result can be playful and fast. A result promoted into an evolutionary fitness signal must meet the stronger evaluation rules in `docs/02-evolution-and-evaluation.md`.

## Playground UI

### Home / Playground

The landing surface should make the simplest useful action obvious.

```text
What do you want to test?
┌──────────────────────────────────────────────────────┐
│ "Lag en lek hvor to AI-er må forhandle om ..."      │
└──────────────────────────────────────────────────────┘
[ Create duel ]

Quick starts
[ Prisoner's Dilemma ] [ Negotiation ] [ Auction ]
[ Bluff ]              [ Survival ]    [ Trust ]
```

Below that, allow direct selection of Model A and Model B.

### Generated rules preview

Do not make the user inspect a config object.

Example:

**Market Crash — 20 rounds**

- Both agents start with 1,000 credits.
- One role receives a private crash warning.
- Agents may BUY, SELL, HOLD or send one message per turn.
- The market crash occurs on a seeded round between 10 and 15.
- Highest terminal net worth wins.

Expandable **Advanced rules** can expose the exact structured configuration.

### Live duel

For a two-agent match, the UI can be dramatically simpler than the full population arena.

Desktop:

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
│ Round 8/20     [pause view] [step] [speed]  │
└─────────────────────────────────────────────┘
```

Mobile should prioritize:

1. current round/state
2. latest interaction
3. compact A/B score/status
4. timeline
5. expandable decision traces

## Readable behavior

The Playground should feel like watching two intelligences play, not tailing an API log.

A timeline item can read:

> **Astra tilbød Nova 320 kreditter for hele energilageret.**
>
> Astra says the goal is to secure supply before expected scarcity. Confidence: 68%.

Then:

> **Nova avslo tilbudet og krevde 470 kreditter.**
>
> Nova says the current information advantage makes waiting more valuable.

Engine facts, agent explanations and evaluator judgments remain visually distinct.

Private chain-of-thought is never requested or exposed.

## Model and identity configuration

Quick Duel should support:

- same model vs same model
- model A vs model B
- same base model with different `SOUL.md`
- saved agent/champion vs fresh model
- saved champion vs saved champion
- scripted baseline vs LLM

Optional simple fields:

- agent names
- short role/personality instruction
- existing `SOUL.md` preset
- memory on/off

The user should not have to configure mutation/evolution settings for a normal duel.

## Saved templates

Every valid generated arena can be saved as a versioned user template.

A template records:

- ArenaSpec
- human-readable rules
- Arena Designer model snapshot
- originating natural-language prompt
- validation version
- creation timestamp

Editing a template creates a new version so old experiment replay remains reproducible.

## Sharing and reports

A duel result can generate a lightweight report containing:

- arena/rules
- models/agents
- winner and score
- timeline highlights
- important decisions
- evaluator notes where applicable
- token/request usage
- replay link/id

Best-of-N or benchmark mode can generate statistical comparison reports and PDF using the normal reporting pipeline.

## Product principle

The advanced laboratory should be discoverable through use rather than required up front.

A new user should be able to type one sentence and watch two AI agents play within the same product that later supports 100-generation evolutionary studies.
