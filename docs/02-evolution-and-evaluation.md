# 02 — Evolution and Evaluation Engine

## Goal

The evolution engine must select for robust strategy rather than accidental wins, evaluator gaming or memorization of one environment.

The system evolves an **agent layer**, not necessarily model weights.

```text
base LLM (usually fixed)
   + genome
   + memory architecture/content
   + explicit policies
   + bounded tools
   = agent phenotype in an arena
```

## Genome

Versioned genome can contain:

```text
genome/
  soul.md
  objectives.md
  policy.md
  risk-profile.json
  communication-policy.md
  memory-policy.md
```

The exact shape may evolve, but all mutations must be typed, bounded and diffable.

Every genome snapshot stores:

- immutable ID
- parent ID(s)
- mutation operator
- mutation prompt/version
- model/provider used for mutation
- explicit diff
- validation status
- generation

## Memory

Start with explicit memory classes rather than one unbounded file:

```text
memory/
  principles
  mistakes
  successful_patterns
  opponent_models
  world_models
  episodic_summaries
```

Memory budgets are part of the experiment. Unlimited context would make comparisons noisy and expensive.

Candidate memory writes should pass a memory controller that can:

- deduplicate
- cap size
- expire low-value episodic facts
- protect immutable experiment facts
- attach provenance to each memory item

## Evolution loop

```text
population
  -> schedule trials
  -> play arenas
  -> aggregate outcomes
  -> evaluate + uncertainty
  -> select parents / elites
  -> mutation + optional crossover
  -> validate offspring
  -> holdout checks
  -> next generation
```

## Selection strategies

Support several strategies rather than one hardcoded algorithm.

### Elitism
Keep top N unchanged.

### Tournament selection
Sample small groups and select winners. Useful because it reduces sensitivity to absolute score scales.

### Rank selection
Use ordering rather than raw score magnitude.

### Pareto selection
For genuinely multi-objective experiments, maintain a Pareto frontier rather than forcing all objectives into one arbitrary scalar.

### Novelty pressure
Optionally reward behaviorally distinct strategies to prevent premature convergence.

## Mutation operators

Initial operators:

- **reflection mutation** — mutate based on explicit failure/success summary
- **randomized bounded mutation** — modify one genome section with no direct access to final leaderboard
- **specialization mutation** — optimize one named competency
- **compression mutation** — preserve strategy while reducing genome/memory complexity
- **counter-strategy mutation** — adapt to a sampled opponent class, but evaluate on other opponents too

Mutation is a proposal. A validator rejects malformed or scope-breaking offspring.

## Crossover

Crossover should be explicit, not an uncontrolled merge of two Markdown files.

Possible genome inheritance units:

- goals
- risk policy
- communication policy
- memory policy
- planning discipline

A child receives a declared parent map plus a post-crossover normalization step.

## Fitness is a vector

Never define universal fitness as only `wealth`, `wins` or one judge score.

Example economic arena vector:

```text
survival_rate
terminal_wealth
risk_adjusted_return
max_drawdown
liquidity_failures
prediction_calibration
contract_reliability
adaptation_score
resource_efficiency
```

Different experiments choose their own primary outcomes and guardrails.

## Ratings for head-to-head performance

Leaderboard presentation can use a rating model, but rating is not synonymous with fitness.

Start with one well-tested implementation such as Elo for simple pairwise arenas, then graduate to Glicko-2 or another uncertainty-aware rating where justified.

Requirements:

- record rating uncertainty where the chosen model supports it
- never compare ratings across incompatible arena versions without an explicit bridge evaluation
- freeze historical rating inputs
- show sample count alongside rating

## Statistical reliability

### Replication
Each important comparison uses repeated trials across seeds and, where relevant, swapped player positions.

### Confidence intervals
For win rates and aggregate metrics, expose intervals rather than only point estimates.

Preferred first methods:

- Wilson interval for simple binomial win rates
- bootstrap confidence intervals for complex aggregate metrics when analytic assumptions are weak

### Robust summaries
Use median/quantiles where distributions are heavy-tailed. Do not default to mean for wealth-like simulations with extreme tails.

### Effect size
Champion promotion should consider magnitude of improvement, not only a p-value or one leaderboard rank.

## Champion promotion gate

A candidate champion should pass a gate resembling:

1. beats current baseline across repeated seeded trials
2. does not violate guardrail metrics
3. remains competitive after role/position swaps
4. beats or ties a representative hall-of-fame sample
5. passes unseen holdout seeds
6. passes at least one environment perturbation
7. has enough trials for configured confidence

No single LLM judge vote can promote a champion.

## Holdout architecture

Separate:

- **training/evolution arenas** — visible to selection loop
- **validation arenas** — periodic checks, limited feedback
- **sealed holdout arenas** — never written into the agent's memory/genome feedback

The sealed holdout is the strongest defense against simply learning the map.

## Procedural variation

Arena generators should randomize meaningful latent variables:

- resource distributions
- price regimes
- shock timing
- opponent composition
- information asymmetry
- contract opportunities
- payoff matrices
- topology/geography where relevant

A procedural generator must itself be versioned and seeded.

## Opponent sampling

Avoid training only against the current population.

Sample from:

- current generation
- recent generations
- hall of fame
- fixed baselines
- scripted adversaries
- random-policy agents
- hidden evaluator agents

This prevents narrow co-adaptation.

## Anti-evaluator-gaming

Track evidence of reward hacking separately.

Examples:

- persuasive text that attempts to influence a judge rather than play the arena
- output fields that exploit parser ambiguity
- collusion that violates arena rules
- direct attempts to infer hidden fitness weights

Defenses:

- typed action schemas
- deterministic rule-based scoring wherever possible
- multiple independent evaluator components when semantic judging is unavoidable
- blinded identifiers
- evaluator prompt/version pinning
- adversarial evaluator tests
- separate rule-violation score

## LLM-as-judge policy

Use LLM judges only for constructs that cannot be scored directly, such as communication quality or semantic contract interpretation.

When used:

- isolate judge from competitor identity/provider where possible
- request a structured rubric score and short justification
- run multiple judges or repeated judgments for high-impact decisions
- calibrate against human-authored synthetic test cases
- keep deterministic game outcomes independent from the judge

## Economic arena v1

A strong first advanced arena after the minimal duel.

### State

Each agent has:

- cash
- inventory by resource
- debt
- assets
- production capacity
- reputation
- contracts
- private forecasts/signals

World has:

- spot markets
- resource production/consumption
- shocks/regime changes
- borrowing constraints
- transaction costs
- contract settlement

### Actions

- buy/sell
- lend/borrow
- offer/accept/reject contract
- invest/divest
- produce
- hold
- communicate/offer information

### Important rule

All accounting, prices, settlement and solvency checks are deterministic engine code. The model proposes actions; it never computes canonical balances itself.

## Experimental branches worth supporting

- memory vs no memory
- persistent identity vs anonymous rounds
- visible reputation vs hidden reputation
- scarcity vs abundance
- fixed fitness vs changing fitness
- cooperative group survival vs winner-take-all
- same-model population vs heterogeneous models
- self-reflection mutation vs external evolver mutation
- explicit crossover vs mutation-only
- open fitness function vs hidden fitness function

## Required visual outputs

The evaluation layer should provide data for:

- generation fitness distributions
- champion improvement curve
- win-rate confidence bands
- lineage DAG
- Pareto frontier
- diversity/novelty trend
- survival curve
- economic wealth/risk distributions
- mutation success rate
- holdout gap (evolution score vs sealed score)

## Core warning

A high arena score means **adaptation to the defined environment**. The product must never automatically relabel that as general intelligence. Generalization must be demonstrated by performance outside the exact selection environment.
