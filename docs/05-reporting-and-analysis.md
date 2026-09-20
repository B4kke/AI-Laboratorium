# 05 — Reporting and Analysis

## Goal

Every serious experiment should end in more than a leaderboard. The platform must explain what happened, how certain the result is, which strategies evolved, and whether the champion generalized.

Reports are generated from immutable experiment data and a pinned report schema/version.

## Report types

### Experiment report
One complete run or lineage.

### Agent report
Deep analysis of one agent/champion across generations.

### Comparison report
A/B comparison of models, genomes, arena settings, memory policies or selection strategies.

### Arena report
Aggregate behavior of an arena across multiple experiments.

### Evolution report
Lineage-level analysis of mutation, diversity and strategy convergence.

## Required experiment report structure

1. Executive summary
2. Experiment configuration
3. Population and provider/model snapshot
4. Arena and seed methodology
5. Primary outcomes
6. Uncertainty / sample counts
7. Fitness vector and guardrails
8. Champion vs baseline
9. Holdout/generalization results
10. Lineage and mutation analysis
11. Behavioral observations
12. Anomalies / evaluator-gaming evidence
13. Resource/token/provider usage
14. Limitations
15. Reproducibility metadata

## Evidence classes

Clearly distinguish:

- **Engine facts** — deterministic state and outcomes
- **Derived statistics** — calculated from engine facts
- **Agent statements** — what agents explicitly claimed
- **Evaluator judgments** — semantic rubric assessments
- **AI-generated analysis** — narrative interpretation

Reports must never present agent self-description as an objective engine fact.

## Statistical content

Depending on arena/report:

- trial count and seed count
- win/loss/draw distribution
- Wilson interval for win rates
- bootstrap confidence intervals for aggregate metrics
- median, quantiles and tail outcomes
- effect size against baseline
- rating + uncertainty where applicable
- Pareto status / domination count
- holdout gap
- survival curve
- mutation success and regression rate

The report generator consumes already-validated metrics; it should not silently redefine them in prose.

## Visuals

Useful default figures:

- champion score/rating by generation
- fitness distribution by generation
- lineage DAG excerpt
- Pareto frontier
- training vs holdout comparison
- diversity trend
- survival curve
- wealth/resource trajectories for economic arenas
- provider usage and latency
- mutation categories vs downstream performance

Every chart should answer a concrete question. Do not add decorative charts.

## PDF

Preferred path:

```text
canonical experiment snapshot
  -> report data model
  -> responsive HTML report
  -> print/PDF export
```

Reasons:

- same report can be viewed in-browser
- easier responsive/mobile design
- deterministic layout contract
- PDF is an export, not a separate truth source

PDF should include:

- title and run ID
- generated timestamp
- experiment snapshot timestamp
- page numbers
- methodology/limitations
- enough provenance to locate the exact run

## In-app report reader

The report center should allow:

- filter by experiment/agent/type/date
- open rendered report
- compare report versions
- download PDF
- download bounded CSV/JSON datasets
- copy shareable internal URL if auth model permits

Raw JSON is a download/debug option, not the main reading experience.

## AI-assisted analysis

A report analyst model may summarize patterns, but must be constrained to provided experiment evidence.

Analysis prompt should:

- cite experiment metric IDs or named sections internally
- identify uncertainty and missing data
- separate observed fact from interpretation
- avoid claiming causality from correlation alone
- flag possible overfitting
- highlight contradictory evidence

High-stakes champion promotion remains rule/statistics driven; report prose cannot override it.

## Mutation analysis

This is a signature feature.

For each successful lineage, reports should be able to show:

```text
Generation 0 -> 12
  added loss-aversion rule
  holdout survival +4.2 pp

Generation 12 -> 27
  compressed opponent memory
  token usage -18%
  performance unchanged within uncertainty

Generation 27 -> 41
  introduced early alliance heuristic
  training score +9%
  holdout score -7%
  flagged as likely overfit
```

The system should correlate mutation categories with downstream performance while avoiding claims stronger than the data allows.

## Reproducibility appendix

Machine-readable metadata should include:

- experiment/run IDs
- code version/commit
- arena version
- generator version
- seeds
- provider/model snapshot
- prompts/schema versions
- genome IDs
- evaluator versions
- statistical method versions/config

## Report generation lifecycle

```text
run complete
  -> freeze analysis snapshot
  -> compute/validate metrics
  -> generate chart datasets
  -> optional AI narrative
  -> render HTML
  -> validate report
  -> mark report ready
  -> optional PDF export
```

A report never reads live mutable state after its snapshot is frozen.

## Dashboard vs report

Dashboard = current/interactive operational view.

Report = durable, frozen, auditable interpretation of a defined experiment snapshot.

Both may share visualization primitives, but their data contracts should remain distinct.
