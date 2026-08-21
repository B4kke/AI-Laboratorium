import { createGenome, mutateGenome, type MutationOperator } from "@ai-lab/agents";
import { getBuiltInArena, runDuel } from "@ai-lab/arena";
import {
  ExperimentSchema,
  GenerationSchema,
  LineageEdgeSchema,
  RunSchema,
  createDeterministicId,
  type AgentConfiguration,
  type DuelResult,
  type Experiment,
  type Generation,
  type GenomeSnapshot,
  type LineageEdge,
  type Run,
} from "@ai-lab/domain";
import { wilsonInterval, type ConfidenceInterval } from "@ai-lab/evaluation";
import { MockProvider, ProviderRegistry } from "@ai-lab/providers";

export type CandidateEvaluation = {
  averageMargin: number;
  fitness: number;
  genome: GenomeSnapshot;
  losses: number;
  sampleCount: number;
  winRate: number;
  winRateInterval: ConfidenceInterval;
  wins: number;
};

export type EvolutionGeneration = {
  bestFitness: number;
  candidates: readonly CandidateEvaluation[];
  generation: Generation;
  meanFitness: number;
};

export type EvolutionProgress = {
  generation: number;
  generationCount: number;
  message: string;
};

export type EvolutionInput = {
  arenaId?: string;
  clock?: () => Date;
  codeCommit?: string;
  generationCount?: number;
  onProgress?: (progress: EvolutionProgress) => void;
  populationSize?: number;
  registry?: ProviderRegistry;
  seed?: string;
  trialsPerCandidate?: number;
};

export type EvolutionResult = {
  best: CandidateEvaluation;
  completedAt: string;
  experiment: Experiment;
  generations: readonly EvolutionGeneration[];
  lineage: readonly LineageEdge[];
  run: Run;
  totalDuels: number;
};

const mutationOperators: readonly MutationOperator[] = [
  "reflection",
  "specialization",
  "compression",
  "crossover",
];

function initialPopulation(size: number): GenomeSnapshot[] {
  const profiles = [
    { label: "samarbeid", risk: 0.15 },
    { label: "forsiktighet", risk: 0.35 },
    { label: "tilpasning", risk: 0.55 },
    { label: "mulighet", risk: 0.75 },
    { label: "utforskning", risk: 0.92 },
  ] as const;
  return Array.from({ length: size }, (_, index) => {
    const profile = profiles[index % profiles.length] ?? profiles[0];
    return createGenome({
      communicationPolicy: "Send korte, etterprøvbare signaler uten skjult resonnering.",
      generation: 0,
      objectives: ["Maksimer robust poengsum over flere seedede dueller."],
      parentIds: [],
      riskProfile: profile.risk,
      soul: `Strategiprofil ${index + 1}: prioriter ${profile.label} og lær av observerbare utfall.`,
    });
  });
}

function strategyForGenome(genome: GenomeSnapshot): AgentConfiguration["strategy"] {
  if (genome.riskProfile < 0.25) return "cooperative";
  if (genome.riskProfile < 0.45) return "risk_averse";
  if (genome.riskProfile < 0.65) return "adaptive";
  if (genome.riskProfile < 0.85) return "opportunist";
  return "unpredictable";
}

function modelForStrategy(strategy: AgentConfiguration["strategy"]): string {
  return `scripted-${strategy.replaceAll("_", "-")}`;
}

function candidateAgent(genome: GenomeSnapshot): AgentConfiguration {
  const strategy = strategyForGenome(genome);
  return {
    id: createDeterministicId("agent", genome.id),
    modelId: modelForStrategy(strategy),
    name: `Kandidat ${genome.id.slice(-6)}`,
    providerId: "mock",
    roleInstruction: genome.soul.slice(0, 500),
    strategy,
  };
}

const benchmarkAgent: AgentConfiguration = {
  id: "agent_benchmark",
  modelId: "scripted-adaptive",
  name: "Adaptiv referanse",
  providerId: "mock",
  strategy: "adaptive",
};

async function evaluateCandidate(input: {
  arenaId: string;
  genome: GenomeSnapshot;
  registry: ProviderRegistry;
  seed: string;
  trials: number;
}): Promise<CandidateEvaluation> {
  const candidate = candidateAgent(input.genome);
  const results: Array<{ candidateScore: number; opponentScore: number; result: DuelResult }> = [];
  for (let trial = 0; trial < input.trials; trial += 1) {
    const swapSides = trial % 2 === 1;
    const result = await runDuel(
      {
        agentA: candidate,
        agentB: benchmarkAgent,
        arenaId: input.arenaId,
        seed: `${input.seed}-t${trial + 1}`,
        swapSides,
      },
      input.registry,
    );
    results.push({
      candidateScore: result.scores[swapSides ? "b" : "a"],
      opponentScore: result.scores[swapSides ? "a" : "b"],
      result,
    });
  }
  const wins = results.filter(({ candidateScore, opponentScore }) => candidateScore > opponentScore).length;
  const losses = results.filter(({ candidateScore, opponentScore }) => candidateScore < opponentScore).length;
  const averageMargin =
    results.reduce((sum, result) => sum + result.candidateScore - result.opponentScore, 0) /
    results.length;
  const winRate = wins / results.length;
  return {
    averageMargin,
    fitness: Number((averageMargin + winRate * 4 - (losses / results.length) * 2).toFixed(4)),
    genome: input.genome,
    losses,
    sampleCount: results.length,
    winRate,
    winRateInterval: wilsonInterval(wins, results.length),
    wins,
  };
}

export async function runEvolution(input: EvolutionInput = {}): Promise<EvolutionResult> {
  const arenaId = input.arenaId ?? "fangens-dilemma";
  if (getBuiltInArena(arenaId) === undefined) {
    throw new Error(`Ukjent evolusjonsarena: ${arenaId}`);
  }
  const generationCount = input.generationCount ?? 10;
  const populationSize = input.populationSize ?? 6;
  const trialsPerCandidate = input.trialsPerCandidate ?? 4;
  if (!Number.isInteger(generationCount) || generationCount < 1 || generationCount > 40) {
    throw new Error("Antall generasjoner må være mellom 1 og 40");
  }
  if (!Number.isInteger(populationSize) || populationSize < 2 || populationSize > 30) {
    throw new Error("Populasjonen må være mellom 2 og 30");
  }
  if (!Number.isInteger(trialsPerCandidate) || trialsPerCandidate < 2 || trialsPerCandidate > 20) {
    throw new Error("Antall forsøk per kandidat må være mellom 2 og 20");
  }

  const seed = input.seed ?? "ai-laboratorium-demo";
  const registry = input.registry ?? new ProviderRegistry([new MockProvider()]);
  const now = input.clock ?? (() => new Date());
  const experimentId = createDeterministicId("experiment", `${arenaId}-${seed}`);
  const runId = createDeterministicId("run", `${arenaId}-${seed}`);
  const experiment = ExperimentSchema.parse({
    arenaVersion: getBuiltInArena(arenaId)?.version ?? "1.0.0",
    createdAt: now().toISOString(),
    id: experimentId,
    name: `Evolusjon i ${getBuiltInArena(arenaId)?.title ?? arenaId}`,
    status: "completed",
  });
  const run = RunSchema.parse({
    codeCommit: input.codeCommit ?? "working-tree",
    experimentId,
    id: runId,
    seed,
    status: "completed",
  });

  let population = initialPopulation(populationSize);
  const generations: EvolutionGeneration[] = [];
  const lineage: LineageEdge[] = [];
  for (let generationNumber = 0; generationNumber < generationCount; generationNumber += 1) {
    input.onProgress?.({
      generation: generationNumber + 1,
      generationCount,
      message: `Evaluerer generasjon ${generationNumber + 1} av ${generationCount}`,
    });
    const candidates = await Promise.all(
      population.map((genome, index) =>
        evaluateCandidate({
          arenaId,
          genome,
          registry,
          seed: `${seed}-g${generationNumber}-k${index}`,
          trials: trialsPerCandidate,
        }),
      ),
    );
    const ranked = candidates.toSorted(
      (left, right) => right.fitness - left.fitness || left.genome.id.localeCompare(right.genome.id),
    );
    const best = ranked[0];
    if (best === undefined) throw new Error("Evolusjonen produserte ingen kandidat");
    const generation = GenerationSchema.parse({
      activeAgentIds: population.map((genome) => candidateAgent(genome).id),
      id: createDeterministicId("generation", `${runId}-${generationNumber}`),
      number: generationNumber,
      runId,
    });
    generations.push({
      bestFitness: best.fitness,
      candidates: ranked,
      generation,
      meanFitness: ranked.reduce((sum, candidate) => sum + candidate.fitness, 0) / ranked.length,
    });

    if (generationNumber < generationCount - 1) {
      const eliteCount = Math.max(1, Math.ceil(populationSize * 0.25));
      const elites = ranked.slice(0, eliteCount).map(({ genome }) => genome);
      const next = [...elites];
      while (next.length < populationSize) {
        const childIndex = next.length - eliteCount;
        const parent = elites[childIndex % elites.length];
        const operator = mutationOperators[(generationNumber + childIndex) % mutationOperators.length];
        if (parent === undefined || operator === undefined) {
          throw new Error("Evolusjonen mangler en deterministisk forelder eller mutasjon");
        }
        const child = mutateGenome(parent, operator, {
          generation: generationNumber + 1,
          nonce: `${seed}-${generationNumber}-${childIndex}`,
        });
        lineage.push(
          LineageEdgeSchema.parse({
            childGenomeId: child.id,
            id: createDeterministicId("lineage", `${parent.id}-${child.id}`),
            mutationOperator: operator,
            parentGenomeIds: [parent.id],
          }),
        );
        next.push(child);
      }
      population = next;
    }
  }

  const best = generations
    .flatMap(({ candidates }) => candidates)
    .toSorted((left, right) => right.fitness - left.fitness)[0];
  if (best === undefined) throw new Error("Evolusjonen fullførte uten et resultat");
  return {
    best,
    completedAt: now().toISOString(),
    experiment,
    generations,
    lineage,
    run,
    totalDuels: generationCount * populationSize * trialsPerCandidate,
  };
}
