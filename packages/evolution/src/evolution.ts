import {
  agentConfigurationFromSnapshot,
  applyMutationProposal,
  buildMutationPrompt,
  createAgentSnapshot,
  parseMutationProposal,
  type GenomeDiff,
  type MutationEvidence,
  type MutationOperator,
} from "@ai-lab/agents";
import { getBuiltInArena, runDuel } from "@ai-lab/arena";
import {
  ExperimentSchema,
  GenerationSchema,
  LineageEdgeSchema,
  RunSchema,
  createDeterministicId,
  type AgentSnapshot,
  type AgentFilePath,
  type DuelResult,
  type EntityId,
  type Experiment,
  type Generation,
  type GenomeSnapshot,
  type LineageEdge,
  type MemoryItem,
  type ProviderSnapshot,
  type Run,
} from "@ai-lab/domain";
import { wilsonInterval, type ConfidenceInterval } from "@ai-lab/evaluation";
import { parseEventPayload } from "@ai-lab/events";
import type { ProviderRegistry } from "@ai-lab/providers";

export type FitnessVector = {
  averageMargin: number;
  consistency: number;
  lossRate: number;
  winRate: number;
};

export type CandidateEvaluation = {
  agent: AgentSnapshot;
  averageMargin: number;
  draws: number;
  evidence: readonly MutationEvidence[];
  fitness: number;
  fitnessVector: FitnessVector;
  genome: GenomeSnapshot;
  losses: number;
  provenance: {
    arenaVersion: string;
    evaluatorVersion: "fitness-vector-v1";
    genomeId: EntityId;
    modelId: string;
    providerId: AgentSnapshot["providerId"];
    seeds: readonly string[];
  };
  sampleCount: number;
  winRate: number;
  winRateInterval: ConfidenceInterval;
  wins: number;
};

export type EvolutionMutation = {
  child: AgentSnapshot;
  diff: GenomeDiff;
  lineage: LineageEdge;
  memoryWrites: readonly MemoryItem[];
  mutationModelSnapshot: ProviderSnapshot;
  parentSnapshotIds: readonly EntityId[];
  summary: string;
};

export type EvolutionGeneration = {
  bestFitness: number;
  candidates: readonly CandidateEvaluation[];
  generation: Generation;
  meanFitness: number;
  mutations: readonly EvolutionMutation[];
  retiredSnapshotIds: readonly EntityId[];
};

export type EvolutionProgress = {
  completedWork: number;
  generation: number;
  generationCount: number;
  message: string;
  phase: "completed" | "evaluating" | "holdout" | "mutating";
  totalWork: number;
};

export type ChampionDecision = {
  arenaVersion: string;
  challengerSnapshotId: EntityId;
  holdoutAverageMargin: number;
  holdoutSampleCount: number;
  holdoutWinRate: number;
  holdoutWinRateInterval: ConfidenceInterval;
  incumbentSnapshotId: EntityId;
  evaluatorVersion: "champion-holdout-v1";
  promoted: boolean;
  reasons: readonly string[];
  seeds: readonly string[];
};

export type EvolutionInput = {
  arenaId: string;
  clock?: () => Date;
  codeCommit?: string;
  concurrency?: number;
  generationCount: number;
  holdoutTrials: number;
  maxProviderCalls: number;
  mutationModel: {
    modelId: string;
    providerId: "nvidia-nim" | "opencode-zen";
  };
  onDuel?: (duel: DuelResult) => Promise<void> | void;
  onMutation?: (
    mutation: EvolutionMutation,
    context: { generationNumber: number; runId: EntityId },
  ) => Promise<void> | void;
  onProgress?: (progress: EvolutionProgress) => Promise<void> | void;
  onRetired?: (agent: AgentSnapshot) => Promise<void> | void;
  population: readonly AgentSnapshot[];
  registry: ProviderRegistry;
  runNonce: string;
  seed: string;
  trialsPerCandidate: number;
};

export type EvolutionResult = {
  best: CandidateEvaluation;
  championDecision: ChampionDecision;
  completedAt: string;
  estimatedProviderCalls: number;
  experiment: Experiment;
  generations: readonly EvolutionGeneration[];
  hallOfFame: readonly CandidateEvaluation[];
  lineage: readonly LineageEdge[];
  run: Run;
  totalDuels: number;
};

export type CandidateEvaluationSummary = Omit<CandidateEvaluation, "evidence" | "genome">;

export type EvolutionMutationSummary = {
  changedFiles: readonly AgentFilePath[];
  childAgentId: EntityId;
  childSnapshotId: EntityId;
  lineageId: EntityId;
  memoryWriteCount: number;
  mutationOperator: LineageEdge["mutationOperator"];
  parentSnapshotIds: readonly EntityId[];
  summary: string;
};

export type EvolutionGenerationSummary = {
  bestFitness: number;
  generation: Generation;
  meanFitness: number;
  mutationCount: number;
  retiredCount: number;
};

/**
 * Bounded job result for API polling. Full duels, snapshots and lineage are
 * already addressable in their own tables and must not be duplicated once per
 * candidate and generation inside evolution_jobs.result.
 */
export type StoredEvolutionResult = {
  best: CandidateEvaluationSummary;
  championDecision: ChampionDecision;
  completedAt: string;
  estimatedProviderCalls: number;
  experiment: Experiment;
  generations: readonly EvolutionGenerationSummary[];
  hallOfFameSnapshotIds: readonly EntityId[];
  lineageCount: number;
  recentMutations: readonly EvolutionMutationSummary[];
  run: Run;
  totalDuels: number;
};

function summarizeCandidate(candidate: CandidateEvaluation): CandidateEvaluationSummary {
  return {
    agent: candidate.agent,
    averageMargin: candidate.averageMargin,
    draws: candidate.draws,
    fitness: candidate.fitness,
    fitnessVector: candidate.fitnessVector,
    losses: candidate.losses,
    provenance: candidate.provenance,
    sampleCount: candidate.sampleCount,
    winRate: candidate.winRate,
    winRateInterval: candidate.winRateInterval,
    wins: candidate.wins,
  };
}

export function compactEvolutionResult(result: EvolutionResult): StoredEvolutionResult {
  const recentMutations = result.generations
    .flatMap(({ mutations }) => mutations)
    .slice(-8)
    .map(
      (mutation): EvolutionMutationSummary => ({
        changedFiles: mutation.child.genome.mutation?.changedFiles ?? [],
        childAgentId: mutation.child.agentId,
        childSnapshotId: mutation.child.id,
        lineageId: mutation.lineage.id,
        memoryWriteCount: mutation.memoryWrites.length,
        mutationOperator: mutation.lineage.mutationOperator,
        parentSnapshotIds: mutation.parentSnapshotIds,
        summary: mutation.summary,
      }),
    );
  return {
    best: summarizeCandidate(result.best),
    championDecision: result.championDecision,
    completedAt: result.completedAt,
    estimatedProviderCalls: result.estimatedProviderCalls,
    experiment: result.experiment,
    generations: result.generations.map(
      ({ bestFitness, generation, meanFitness, mutations, retiredSnapshotIds }) => ({
        bestFitness,
        generation,
        meanFitness,
        mutationCount: mutations.length,
        retiredCount: retiredSnapshotIds.length,
      }),
    ),
    hallOfFameSnapshotIds: result.hallOfFame.map(({ agent }) => agent.id),
    lineageCount: result.lineage.length,
    recentMutations,
    run: result.run,
    totalDuels: result.totalDuels,
  };
}

const mutationOperators: readonly MutationOperator[] = [
  "reflection",
  "counter_strategy",
  "specialization",
  "compression",
  "randomized",
  "crossover",
];

function assertIntegerRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} må være mellom ${minimum} og ${maximum}`);
  }
}

function compactHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function seededIndex(seed: string, modulo: number): number {
  return Number(BigInt(`0x${compactHash(seed)}`) % BigInt(modulo));
}

async function mapConcurrent<TInput, TOutput>(
  values: readonly TInput[],
  concurrency: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await mapper(value, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function outcomeByRound(result: DuelResult): Map<number, string> {
  const outcomes = new Map<number, string>();
  for (const event of result.events) {
    if (event.type !== "round.resolved") continue;
    const payload = parseEventPayload("round.resolved", event.payload);
    outcomes.set(payload.round, payload.narrative);
  }
  return outcomes;
}

function evidenceFromDuel(input: {
  candidate: AgentSnapshot;
  opponent: AgentSnapshot;
  result: DuelResult;
  scoreAgainst: number;
  scoreFor: number;
}): MutationEvidence {
  const outcomes = outcomeByRound(input.result);
  const decisions = input.result.events.flatMap((event) => {
    if (event.type !== "agent.decided" || event.actorId !== input.candidate.agentId) return [];
    const payload = parseEventPayload("agent.decided", event.payload);
    return [
      {
        actionId: payload.trace.actionId,
        message: payload.trace.message,
        outcome: outcomes.get(payload.round) ?? "Ingen registrert rundeutfall.",
        rationale: payload.trace.rationale,
        round: payload.round,
      },
    ];
  });
  return {
    arenaTitle: input.result.arena.title,
    decisions,
    matchId: input.result.matchId,
    opponentName: input.opponent.name,
    scoreAgainst: input.scoreAgainst,
    scoreFor: input.scoreFor,
    seed: input.result.seed,
  };
}

function evaluateFitness(margins: readonly number[], wins: number, losses: number): {
  fitness: number;
  vector: FitnessVector;
} {
  const sampleCount = margins.length;
  const averageMargin = margins.reduce((sum, margin) => sum + margin, 0) / sampleCount;
  const variance =
    margins.reduce((sum, margin) => sum + (margin - averageMargin) ** 2, 0) / sampleCount;
  const consistency = 1 / (1 + Math.sqrt(variance));
  const winRate = wins / sampleCount;
  const lossRate = losses / sampleCount;
  const vector = {
    averageMargin: Number(averageMargin.toFixed(4)),
    consistency: Number(consistency.toFixed(4)),
    lossRate: Number(lossRate.toFixed(4)),
    winRate: Number(winRate.toFixed(4)),
  };
  return {
    fitness: Number((averageMargin + winRate * 4 - lossRate * 2 + consistency).toFixed(4)),
    vector,
  };
}

async function evaluateCandidate(input: {
  arenaId: string;
  arenaVersion: string;
  candidate: AgentSnapshot;
  candidateIndex: number;
  generationNumber: number;
  onDuel?: EvolutionInput["onDuel"];
  population: readonly AgentSnapshot[];
  registry: ProviderRegistry;
  seed: string;
  trials: number;
}): Promise<CandidateEvaluation> {
  const margins: number[] = [];
  const evidence: MutationEvidence[] = [];
  const seeds: string[] = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (let trial = 0; trial < input.trials; trial += 1) {
    const candidates = input.population.filter(
      ({ agentId }) => agentId !== input.candidate.agentId,
    );
    const opponentIndex = seededIndex(
      `${input.seed}-g${input.generationNumber}-c${input.candidateIndex}-pair${Math.floor(trial / 2)}`,
      candidates.length,
    );
    const opponent = candidates[opponentIndex];
    if (opponent === undefined) throw new Error("Evolusjonen mangler en gyldig motstander");
    const swapSides = trial % 2 === 1;
    const trialSeed = `${input.seed}-g${input.generationNumber}-c${input.candidateIndex}-t${trial}`;
    seeds.push(trialSeed);
    const result = await runDuel(
      {
        agentA: agentConfigurationFromSnapshot(input.candidate),
        agentB: agentConfigurationFromSnapshot(opponent),
        arenaId: input.arenaId,
        seed: trialSeed,
        swapSides,
      },
      input.registry,
    );
    await input.onDuel?.(result);
    const scoreFor = result.scores[swapSides ? "b" : "a"];
    const scoreAgainst = result.scores[swapSides ? "a" : "b"];
    margins.push(scoreFor - scoreAgainst);
    if (scoreFor > scoreAgainst) wins += 1;
    else if (scoreFor < scoreAgainst) losses += 1;
    else draws += 1;
    evidence.push(
      evidenceFromDuel({
        candidate: input.candidate,
        opponent,
        result,
        scoreAgainst,
        scoreFor,
      }),
    );
  }
  const { fitness, vector } = evaluateFitness(margins, wins, losses);
  return {
    agent: input.candidate,
    averageMargin: vector.averageMargin,
    draws,
    evidence,
    fitness,
    fitnessVector: vector,
    genome: input.candidate.genome,
    losses,
    provenance: {
      arenaVersion: input.arenaVersion,
      evaluatorVersion: "fitness-vector-v1",
      genomeId: input.candidate.genome.id,
      modelId: input.candidate.modelId,
      providerId: input.candidate.providerId,
      seeds,
    },
    sampleCount: input.trials,
    winRate: vector.winRate,
    winRateInterval: wilsonInterval(wins, input.trials),
    wins,
  };
}

function operatorFor(seed: string, generation: number, childIndex: number): MutationOperator {
  const index = seededIndex(`${seed}-g${generation}-child${childIndex}`, mutationOperators.length);
  const operator = mutationOperators[index];
  if (operator === undefined) throw new Error("Evolusjonen mangler mutasjonsoperator");
  return operator;
}

async function mutateCandidate(input: {
  childIndex: number;
  clock: () => Date;
  generation: number;
  mutationModel: EvolutionInput["mutationModel"];
  mutationModelSnapshot: ProviderSnapshot;
  parent: CandidateEvaluation;
  registry: ProviderRegistry;
  runId: EntityId;
  runNonce: string;
  secondaryParent?: CandidateEvaluation;
  seed: string;
}): Promise<EvolutionMutation> {
  const operator = operatorFor(input.seed, input.generation, input.childIndex);
  const secondaryParent = operator === "crossover" ? input.secondaryParent : undefined;
  const provider = input.registry.get(input.mutationModel.providerId);
  if (provider.generateText === undefined) {
    throw new Error(`Provideren ${provider.id} støtter ikke tekstbasert agentmutasjon`);
  }
  const prompt = buildMutationPrompt({
    evidence: input.parent.evidence,
    mutationModel: input.mutationModel,
    operator,
    parentGenome: input.parent.agent.genome,
    parentMemory: input.parent.agent.memory,
    ...(secondaryParent === undefined
      ? {}
      : { secondaryParent: secondaryParent.agent.genome }),
  });
  const response = await provider.generateText({
    maxTokens: 4_000,
    modelId: input.mutationModel.modelId,
    prompt: prompt.prompt,
    system: prompt.system,
    temperature: operator === "randomized" ? 0.65 : 0.2,
  });
  const proposal = parseMutationProposal(response.content);
  const childAgentId = createDeterministicId(
    "agent",
    compactHash(
      `${input.runNonce}-${input.seed}-${input.generation}-${input.childIndex}-${input.parent.agent.id}-${proposal.soul}`,
    ),
  );
  const sourceMatchId = input.parent.evidence.at(-1)?.matchId;
  if (sourceMatchId === undefined) throw new Error("Mutasjonen mangler observerbare kampdata");
  const applied = applyMutationProposal({
    agentId: childAgentId,
    clock: input.clock,
    generation: input.generation,
    mutationModel: input.mutationModel,
    operator,
    parentGenome: input.parent.agent.genome,
    parentMemory: {
      ...input.parent.agent.memory,
      agentId: childAgentId,
    },
    proposal,
    ...(secondaryParent === undefined
      ? {}
      : { secondaryParent: secondaryParent.agent.genome }),
    sourceMatchId,
  });
  const parentSnapshotIds = [
    input.parent.agent.id,
    ...(secondaryParent === undefined ? [] : [secondaryParent.agent.id]),
  ];
  const child = createAgentSnapshot({
    agentId: childAgentId,
    clock: input.clock,
    genome: applied.genome,
    memory: applied.memory,
    modelId: input.parent.agent.modelId,
    name: `${input.parent.agent.name} · G${input.generation}`.slice(0, 60),
    parentSnapshotIds,
    providerId: input.parent.agent.providerId,
    status: "active",
    strategy: input.parent.agent.strategy,
  });
  const lineage = LineageEdgeSchema.parse({
    childGenomeId: child.genome.id,
    id: createDeterministicId(
      "lineage",
      compactHash(`${input.runId}-${parentSnapshotIds.join("-")}-${child.genome.id}`),
    ),
    mutationOperator: operator,
    parentGenomeIds: [
      input.parent.agent.genome.id,
      ...(secondaryParent === undefined ? [] : [secondaryParent.agent.genome.id]),
    ],
  });
  return {
    child,
    diff: applied.diff,
    lineage,
    memoryWrites: applied.memoryWrites,
    mutationModelSnapshot: input.mutationModelSnapshot,
    parentSnapshotIds,
    summary: applied.summary,
  };
}

async function evaluateHoldout(input: {
  arenaId: string;
  arenaVersion: string;
  challenger: AgentSnapshot;
  incumbent: AgentSnapshot;
  onDuel?: EvolutionInput["onDuel"];
  registry: ProviderRegistry;
  seed: string;
  trials: number;
}): Promise<ChampionDecision> {
  let wins = 0;
  let totalMargin = 0;
  const seeds: string[] = [];
  for (let trial = 0; trial < input.trials; trial += 1) {
    const swapSides = trial % 2 === 1;
    const trialSeed = `${input.seed}-sealed-holdout-${trial}`;
    seeds.push(trialSeed);
    const result = await runDuel(
      {
        agentA: agentConfigurationFromSnapshot(input.challenger),
        agentB: agentConfigurationFromSnapshot(input.incumbent),
        arenaId: input.arenaId,
        seed: trialSeed,
        swapSides,
      },
      input.registry,
    );
    await input.onDuel?.(result);
    const scoreFor = result.scores[swapSides ? "b" : "a"];
    const scoreAgainst = result.scores[swapSides ? "a" : "b"];
    totalMargin += scoreFor - scoreAgainst;
    if (scoreFor > scoreAgainst) wins += 1;
  }
  const interval = wilsonInterval(wins, input.trials);
  const averageMargin = totalMargin / input.trials;
  const reasons: string[] = [];
  if (averageMargin <= 0) reasons.push("Holdout-marginen er ikke positiv.");
  if (interval.lower <= 0.5) reasons.push("95 %-intervallets nedre grense er ikke over 50 %.");
  if (input.trials < 4) reasons.push("Holdout-utvalget er for lite.");
  return {
    arenaVersion: input.arenaVersion,
    challengerSnapshotId: input.challenger.id,
    holdoutAverageMargin: Number(averageMargin.toFixed(4)),
    holdoutSampleCount: input.trials,
    holdoutWinRate: Number((wins / input.trials).toFixed(4)),
    holdoutWinRateInterval: interval,
    incumbentSnapshotId: input.incumbent.id,
    evaluatorVersion: "champion-holdout-v1",
    promoted: reasons.length === 0,
    reasons: reasons.length === 0 ? ["Alle forhåndsdefinerte holdout-krav er oppfylt."] : reasons,
    seeds,
  };
}

function validateInput(input: EvolutionInput): void {
  if (getBuiltInArena(input.arenaId) === undefined) {
    throw new Error(`Ukjent evolusjonsarena: ${input.arenaId}`);
  }
  assertIntegerRange(input.generationCount, 1, 100, "Antall generasjoner");
  assertIntegerRange(input.population.length, 2, 100, "Populasjonen");
  assertIntegerRange(input.trialsPerCandidate, 2, 20, "Antall forsøk per kandidat");
  assertIntegerRange(input.holdoutTrials, 4, 40, "Antall holdout-forsøk");
  if (input.trialsPerCandidate % 2 !== 0 || input.holdoutTrials % 2 !== 0) {
    throw new Error("Evalueringsdueller må komme i sidebyttede par");
  }
  assertIntegerRange(input.concurrency ?? 2, 1, 8, "Parallellitet");
  assertIntegerRange(input.maxProviderCalls, 100, 1_000_000, "Maksimalt antall modellkall");
  const agentIds = new Set(input.population.map(({ agentId }) => agentId));
  const snapshotIds = new Set(input.population.map(({ id }) => id));
  if (agentIds.size !== input.population.length || snapshotIds.size !== input.population.length) {
    throw new Error("Hver evolusjonsplass må ha en unik agent og et unikt snapshot");
  }
  if (input.population.some(({ providerId }) => providerId === "mock")) {
    throw new Error("Scripted mock-agenter kan bare brukes som tydelig merkede kontroller, ikke i Evolution");
  }
  if (input.runNonce.trim().length === 0 || input.runNonce.length > 128) {
    throw new Error("Evolution-run krever en unik runNonce på maksimalt 128 tegn");
  }
}

export async function runEvolution(input: EvolutionInput): Promise<EvolutionResult> {
  validateInput(input);
  const arena = getBuiltInArena(input.arenaId);
  if (arena === undefined) throw new Error(`Ukjent evolusjonsarena: ${input.arenaId}`);
  const concurrency = input.concurrency ?? 2;
  const now = input.clock ?? (() => new Date());
  const estimatedProviderCalls =
    input.generationCount *
      input.population.length *
      input.trialsPerCandidate *
      arena.rounds *
      2 +
    Math.max(0, input.generationCount - 1) *
      (input.population.length - Math.ceil(input.population.length * 0.25)) +
    input.holdoutTrials * arena.rounds * 2;
  if (estimatedProviderCalls > input.maxProviderCalls) {
    throw new Error(
      `Kjøringen krever anslagsvis ${estimatedProviderCalls} modellkall, over grensen ${input.maxProviderCalls}`,
    );
  }

  for (const snapshot of input.population) {
    await input.registry.get(snapshot.providerId).captureSnapshot(snapshot.modelId);
  }
  const mutationProvider = input.registry.get(input.mutationModel.providerId);
  if (mutationProvider.generateText === undefined) {
    throw new Error(`Provideren ${mutationProvider.id} støtter ikke tekstbasert agentmutasjon`);
  }
  const mutationModelSnapshot = await mutationProvider.captureSnapshot(input.mutationModel.modelId);
  const experimentId = createDeterministicId(
    "experiment",
    compactHash(
      JSON.stringify({
        arenaId: input.arenaId,
        generationCount: input.generationCount,
        holdoutTrials: input.holdoutTrials,
        mutationModel: input.mutationModel,
        populationSnapshotIds: input.population.map(({ id }) => id),
        trialsPerCandidate: input.trialsPerCandidate,
      }),
    ),
  );
  const runId = createDeterministicId(
    "run",
    compactHash(`${experimentId}-${input.seed}-${input.runNonce}`),
  );
  const experiment = ExperimentSchema.parse({
    arenaVersion: arena.version,
    createdAt: now().toISOString(),
    id: experimentId,
    name: `Evolusjon i ${arena.title}`,
    status: "completed",
  });
  const run = RunSchema.parse({
    codeCommit: input.codeCommit ?? "working-tree",
    experimentId,
    id: runId,
    seed: input.seed,
    status: "completed",
  });

  let population = [...input.population];
  const generations: EvolutionGeneration[] = [];
  const hallOfFame: CandidateEvaluation[] = [];
  const lineage: LineageEdge[] = [];
  let completedWork = 0;
  const evaluationWork = input.generationCount * population.length;
  const mutationWork =
    Math.max(0, input.generationCount - 1) *
    (population.length - Math.ceil(population.length * 0.25));
  const totalWork = evaluationWork + mutationWork + input.holdoutTrials;
  for (let generationNumber = 0; generationNumber < input.generationCount; generationNumber += 1) {
    await input.onProgress?.({
      completedWork,
      generation: generationNumber + 1,
      generationCount: input.generationCount,
      message: `Evaluerer ${population.length} ekte agent-snapshots`,
      phase: "evaluating",
      totalWork,
    });
    const candidates = await mapConcurrent(population, concurrency, async (candidate, index) => {
      const evaluated = await evaluateCandidate({
        arenaId: input.arenaId,
        arenaVersion: arena.version,
        candidate,
        candidateIndex: index,
        generationNumber,
        ...(input.onDuel === undefined ? {} : { onDuel: input.onDuel }),
        population,
        registry: input.registry,
        seed: input.seed,
        trials: input.trialsPerCandidate,
      });
      completedWork += 1;
      return evaluated;
    });
    const ranked = candidates.toSorted(
      (left, right) => right.fitness - left.fitness || left.agent.id.localeCompare(right.agent.id),
    );
    const best = ranked[0];
    if (best === undefined) throw new Error("Evolusjonen produserte ingen kandidat");
    if (!hallOfFame.some(({ agent }) => agent.id === best.agent.id)) hallOfFame.push(best);
    const generation = GenerationSchema.parse({
      activeAgentIds: population.map(({ agentId }) => agentId),
      id: createDeterministicId("generation", compactHash(`${runId}-${generationNumber}`)),
      number: generationNumber,
      runId,
    });
    const eliteCount = Math.max(1, Math.ceil(population.length * 0.25));
    const elites = ranked.slice(0, eliteCount);
    const mutations: EvolutionMutation[] = [];
    const retiredSnapshotIds: EntityId[] = [];

    if (generationNumber < input.generationCount - 1) {
      const offspringCount = population.length - eliteCount;
      await input.onProgress?.({
        completedWork,
        generation: generationNumber + 1,
        generationCount: input.generationCount,
        message: `Muterer ${offspringCount} SOUL.md- og minneversjoner med ${input.mutationModel.modelId}`,
        phase: "mutating",
        totalWork,
      });
      const childIndexes = Array.from({ length: offspringCount }, (_, index) => index);
      const children = await mapConcurrent(childIndexes, concurrency, async (childIndex) => {
        const parent = elites[childIndex % elites.length];
        const secondaryParent = ranked[(childIndex + 1) % ranked.length];
        if (parent === undefined) throw new Error("Evolusjonen mangler en eliteforelder");
        const mutation = await mutateCandidate({
          childIndex,
          clock: now,
          generation: generationNumber + 1,
          mutationModel: input.mutationModel,
          mutationModelSnapshot,
          parent,
          registry: input.registry,
          runId,
          runNonce: input.runNonce,
          ...(secondaryParent === undefined || secondaryParent.agent.id === parent.agent.id
            ? {}
            : { secondaryParent }),
          seed: input.seed,
        });
        await input.onMutation?.(mutation, {
          generationNumber: generationNumber + 1,
          runId,
        });
        completedWork += 1;
        return mutation;
      });
      mutations.push(...children);
      lineage.push(...children.map(({ lineage: edge }) => edge));
      const retainedSnapshotIds = new Set(elites.map(({ agent }) => agent.id));
      retiredSnapshotIds.push(
        ...population.filter(({ id }) => !retainedSnapshotIds.has(id)).map(({ id }) => id),
      );
      for (const retiredSnapshotId of retiredSnapshotIds) {
        const retired = population.find(({ id }) => id === retiredSnapshotId);
        if (retired !== undefined) await input.onRetired?.(retired);
      }
      population = [...elites.map(({ agent }) => agent), ...children.map(({ child }) => child)];
    }

    generations.push({
      bestFitness: best.fitness,
      candidates: ranked,
      generation,
      meanFitness: Number(
        (ranked.reduce((sum, candidate) => sum + candidate.fitness, 0) / ranked.length).toFixed(4),
      ),
      mutations,
      retiredSnapshotIds,
    });
  }

  const finalCandidates = generations.at(-1)?.candidates;
  const challenger = finalCandidates?.[0];
  const incumbent = hallOfFame
    .filter(({ agent }) => agent.id !== challenger?.agent.id)
    .toSorted(
      (left, right) => right.fitness - left.fitness || left.agent.id.localeCompare(right.agent.id),
    )[0] ?? finalCandidates?.[1];
  if (challenger === undefined || incumbent === undefined) {
    throw new Error("Evolusjonen fullførte uten to holdout-kandidater");
  }
  await input.onProgress?.({
    completedWork,
    generation: input.generationCount,
    generationCount: input.generationCount,
    message: "Kjører forseglede holdout-dueller før eventuell champion-promotering",
    phase: "holdout",
    totalWork,
  });
  const championDecision = await evaluateHoldout({
    arenaId: input.arenaId,
    arenaVersion: arena.version,
    challenger: challenger.agent,
    incumbent: incumbent.agent,
    ...(input.onDuel === undefined ? {} : { onDuel: input.onDuel }),
    registry: input.registry,
    seed: input.seed,
    trials: input.holdoutTrials,
  });
  completedWork += input.holdoutTrials;
  await input.onProgress?.({
    completedWork,
    generation: input.generationCount,
    generationCount: input.generationCount,
    message: championDecision.promoted
      ? "Champion-kriteriene er oppfylt"
      : "Holdout fullført uten champion-promotering",
    phase: "completed",
    totalWork,
  });
  return {
    best: challenger,
    championDecision,
    completedAt: now().toISOString(),
    estimatedProviderCalls,
    experiment,
    generations,
    hallOfFame,
    lineage,
    run,
    totalDuels:
      input.generationCount * input.population.length * input.trialsPerCandidate +
      input.holdoutTrials,
  };
}
