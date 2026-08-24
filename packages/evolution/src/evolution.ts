import {
  agentConfigurationFromSnapshot,
  applyMutationProposal,
  buildMutationPrompt,
  createAgentSnapshot,
  MutationProposalSchema,
  parseMutationProposal,
  type GenomeDiff,
  type MutationEvidence,
  type MutationOperator,
  type MutationProposal,
} from "@ai-lab/agents";
import { getBuiltInArena, runDuel } from "@ai-lab/arena";
import {
  AgentSnapshotSchema,
  DuelResultSchema,
  ExperimentSchema,
  GenerationSchema,
  LineageEdgeSchema,
  MemoryItemSchema,
  ProviderSnapshotSchema,
  RunSchema,
  createDeterministicId,
  type AgentFilePath,
  type AgentSnapshot,
  type DuelResult,
  type EntityId,
  type EventEnvelope,
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
import type {
  NormalizedUsage,
  ProviderRegistry,
  TextGenerationResult,
} from "@ai-lab/providers";
import { z } from "zod";

import {
  estimateProviderCalls,
  evolutionPopulationSchedule,
  survivorCountAfterGeneration,
} from "./config";

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
  evidenceMatchIds: readonly EntityId[];
  lineage: LineageEdge;
  memoryWrites: readonly MemoryItem[];
  mutationModelSnapshot: ProviderSnapshot;
  parentSnapshotIds: readonly EntityId[];
  selfModelSnapshot: ProviderSnapshot;
  selfProposal: MutationProposal;
  stepId: string;
  summary: string;
  usage: NormalizedUsage;
};

export type EvolutionGeneration = {
  activePopulationSize: number;
  bestFitness: number;
  candidates: readonly CandidateEvaluation[];
  eliminatedSnapshotIds: readonly EntityId[];
  generation: Generation;
  meanFitness: number;
  mutations: readonly EvolutionMutation[];
  survivorSnapshotIds: readonly EntityId[];
};

export type EvolutionProgress = {
  activeAgents: number;
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

export type EvolutionUsage = {
  inputTokens: number;
  outputTokens: number;
  providerCalls: number;
  totalTokens: number;
};

export type EvolutionDuelContext = {
  generationNumber: number;
  phase: "evaluation" | "holdout";
  stepId: string;
};

export type EvolutionResumeStore = {
  loadDuel(stepId: string): Promise<DuelResult | null>;
  loadMutation(stepId: string): Promise<EvolutionMutation | null>;
  saveDuel(stepId: string, duel: DuelResult): Promise<void>;
  saveMutation(stepId: string, mutation: EvolutionMutation): Promise<void>;
};

export type EvolutionInput = {
  arenaId: string;
  clock?: () => Date;
  codeCommit?: string;
  concurrency?: number;
  generationCount: number;
  holdoutTrials: number;
  incumbent?: AgentSnapshot;
  mutationModel: {
    modelId: string;
    providerId: "nvidia-nim" | "opencode-zen";
  };
  onDuel?: (duel: DuelResult, context: EvolutionDuelContext) => Promise<void> | void;
  onDuelEvent?: (
    event: EventEnvelope,
    context: EvolutionDuelContext,
  ) => Promise<void> | void;
  onMutation?: (
    mutation: EvolutionMutation,
    context: { generationNumber: number; runId: EntityId; stepId: string },
  ) => Promise<void> | void;
  onProgress?: (progress: EvolutionProgress) => Promise<void> | void;
  onProviderSnapshot?: (
    snapshot: ProviderSnapshot,
    context: { runId: EntityId },
  ) => Promise<void> | void;
  onRetired?: (agent: AgentSnapshot) => Promise<void> | void;
  population: readonly AgentSnapshot[];
  registry: ProviderRegistry;
  resumeStore?: EvolutionResumeStore;
  runNonce: string;
  seed: string;
  signal?: AbortSignal;
  trialsPerCandidate: number;
};

export type EvolutionResult = {
  best: CandidateEvaluation;
  championDecision: ChampionDecision;
  completedAt: string;
  estimatedProviderCalls: number;
  experiment: Experiment;
  finalPopulationSize: 1;
  generations: readonly EvolutionGeneration[];
  hallOfFame: readonly CandidateEvaluation[];
  lineage: readonly LineageEdge[];
  providerSnapshots: readonly ProviderSnapshot[];
  run: Run;
  totalDuels: number;
  usage: EvolutionUsage;
  winner: AgentSnapshot;
};

export type CandidateEvaluationSummary = Omit<CandidateEvaluation, "evidence" | "genome">;

export type EvolutionMutationSummary = {
  changedFiles: readonly AgentFilePath[];
  childAgentId: EntityId;
  childSnapshotId: EntityId;
  evidenceMatchIds: readonly EntityId[];
  lineageId: EntityId;
  memoryWriteCount: number;
  mutationOperator: LineageEdge["mutationOperator"];
  parentSnapshotIds: readonly EntityId[];
  selfReflectionSummary: string;
  stepId: string;
  summary: string;
};

export type EvolutionGenerationSummary = {
  activePopulationSize: number;
  bestFitness: number;
  eliminatedCount: number;
  generation: Generation;
  meanFitness: number;
  mutationCount: number;
  survivorCount: number;
};

export type StoredEvolutionResult = {
  best: CandidateEvaluationSummary;
  championDecision: ChampionDecision;
  completedAt: string;
  estimatedProviderCalls: number;
  experiment: Experiment;
  finalPopulationSize: 1;
  generations: readonly EvolutionGenerationSummary[];
  hallOfFameSnapshotIds: readonly EntityId[];
  lineageCount: number;
  providerSnapshots: readonly ProviderSnapshot[];
  recentMutations: readonly EvolutionMutationSummary[];
  run: Run;
  totalDuels: number;
  usage: EvolutionUsage;
  winner: AgentSnapshot;
};

const GenomeDiffSchema = z
  .object({
    communicationPolicyChanged: z.boolean(),
    objectiveChanges: z.array(z.string()),
    parentIds: z.array(z.string()),
    riskDelta: z.number(),
    soulAppendix: z.string(),
  })
  .strict();

const NormalizedUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    requestCount: z.number().int().positive().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
  })
  .strict();

export const EvolutionMutationSchema = z
  .object({
    child: AgentSnapshotSchema,
    diff: GenomeDiffSchema,
    evidenceMatchIds: z.array(z.string()).min(1).max(20),
    lineage: LineageEdgeSchema,
    memoryWrites: z.array(MemoryItemSchema).max(8),
    mutationModelSnapshot: ProviderSnapshotSchema,
    parentSnapshotIds: z.array(z.string()).min(1).max(2),
    selfModelSnapshot: ProviderSnapshotSchema,
    selfProposal: MutationProposalSchema,
    stepId: z.string().min(1).max(200),
    summary: z.string().min(1).max(1_000),
    usage: NormalizedUsageSchema,
  })
  .strict();

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

function summarizeMutation(mutation: EvolutionMutation): EvolutionMutationSummary {
  return {
    changedFiles: mutation.child.genome.mutation?.changedFiles ?? [],
    childAgentId: mutation.child.agentId,
    childSnapshotId: mutation.child.id,
    evidenceMatchIds: mutation.evidenceMatchIds,
    lineageId: mutation.lineage.id,
    memoryWriteCount: mutation.memoryWrites.length,
    mutationOperator: mutation.lineage.mutationOperator,
    parentSnapshotIds: mutation.parentSnapshotIds,
    selfReflectionSummary: mutation.selfProposal.summary,
    stepId: mutation.stepId,
    summary: mutation.summary,
  };
}

export function compactEvolutionResult(result: EvolutionResult): StoredEvolutionResult {
  return {
    best: summarizeCandidate(result.best),
    championDecision: result.championDecision,
    completedAt: result.completedAt,
    estimatedProviderCalls: result.estimatedProviderCalls,
    experiment: result.experiment,
    finalPopulationSize: 1,
    generations: result.generations.map(
      ({
        activePopulationSize,
        bestFitness,
        eliminatedSnapshotIds,
        generation,
        meanFitness,
        mutations,
        survivorSnapshotIds,
      }) => ({
        activePopulationSize,
        bestFitness,
        eliminatedCount: eliminatedSnapshotIds.length,
        generation,
        meanFitness,
        mutationCount: mutations.length,
        survivorCount: survivorSnapshotIds.length,
      }),
    ),
    hallOfFameSnapshotIds: result.hallOfFame.map(({ agent }) => agent.id),
    lineageCount: result.lineage.length,
    providerSnapshots: result.providerSnapshots,
    recentMutations: result.generations
      .flatMap(({ mutations }) => mutations)
      .slice(-24)
      .map(summarizeMutation),
    run: result.run,
    totalDuels: result.totalDuels,
    usage: result.usage,
    winner: result.winner,
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

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason instanceof Error ? signal.reason : new Error("Evolution-kjøringen ble avbrutt");
  }
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
        ...(payload.trace.memoryWrite === undefined
          ? {}
          : { memoryWrite: payload.trace.memoryWrite }),
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

function evaluateFitness(margins: readonly number[], wins: number, losses: number) {
  const sampleCount = margins.length;
  const averageMargin = margins.reduce((sum, margin) => sum + margin, 0) / sampleCount;
  const variance =
    margins.reduce((sum, margin) => sum + (margin - averageMargin) ** 2, 0) / sampleCount;
  const consistency = 1 / (1 + Math.sqrt(variance));
  const winRate = wins / sampleCount;
  const lossRate = losses / sampleCount;
  const vector: FitnessVector = {
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

function duelStepId(input: {
  candidateSnapshotId: EntityId;
  generationNumber: number;
  phase: "evaluation" | "holdout";
  runId: EntityId;
  trial: number;
}): string {
  return `${input.phase}-${compactHash(
    `${input.runId}-${input.generationNumber}-${input.candidateSnapshotId}-${input.trial}`,
  )}`;
}

async function runStoredDuel(input: {
  context: EvolutionDuelContext;
  evolution: EvolutionInput;
  request: Parameters<typeof runDuel>[0];
  runId: EntityId;
}): Promise<DuelResult> {
  throwIfAborted(input.evolution.signal);
  const stored = await input.evolution.resumeStore?.loadDuel(input.context.stepId);
  const result =
    stored === null || stored === undefined
      ? await runDuel(input.request, input.evolution.registry, {
          matchId: createDeterministicId(
            "match",
            compactHash(`${input.runId}-${input.context.stepId}`),
          ),
          ...(input.evolution.onDuelEvent === undefined
            ? {}
            : {
                onEvent: (event: EventEnvelope) =>
                  input.evolution.onDuelEvent?.(event, input.context),
              }),
          ...(input.evolution.signal === undefined ? {} : { signal: input.evolution.signal }),
        })
      : DuelResultSchema.parse(stored);
  if (stored === null || stored === undefined) {
    await input.evolution.resumeStore?.saveDuel(input.context.stepId, result);
  } else if (input.evolution.onDuelEvent !== undefined) {
    await Promise.all(
      result.events.map((event) => input.evolution.onDuelEvent?.(event, input.context)),
    );
  }
  await input.evolution.onDuel?.(result, input.context);
  return result;
}

async function evaluateCandidate(input: {
  arenaVersion: string;
  candidate: AgentSnapshot;
  candidateIndex: number;
  evolution: EvolutionInput;
  generationNumber: number;
  population: readonly AgentSnapshot[];
  runId: EntityId;
}): Promise<CandidateEvaluation> {
  const margins: number[] = [];
  const evidence: MutationEvidence[] = [];
  const seeds: string[] = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (let trial = 0; trial < input.evolution.trialsPerCandidate; trial += 1) {
    throwIfAborted(input.evolution.signal);
    const opponents = input.population.filter(({ agentId }) => agentId !== input.candidate.agentId);
    const opponent =
      opponents[
        seededIndex(
          `${input.evolution.seed}-g${input.generationNumber}-c${input.candidateIndex}-pair${Math.floor(trial / 2)}`,
          opponents.length,
        )
      ];
    if (opponent === undefined) throw new Error("Evolusjonen mangler en gyldig motstander");
    const swapSides = trial % 2 === 1;
    const trialSeed = `${input.evolution.seed}-g${input.generationNumber}-c${input.candidateIndex}-t${trial}`;
    const stepId = duelStepId({
      candidateSnapshotId: input.candidate.id,
      generationNumber: input.generationNumber,
      phase: "evaluation",
      runId: input.runId,
      trial,
    });
    seeds.push(trialSeed);
    const result = await runStoredDuel({
      context: {
        generationNumber: input.generationNumber,
        phase: "evaluation",
        stepId,
      },
      evolution: input.evolution,
      request: {
        agentA: agentConfigurationFromSnapshot(input.candidate),
        agentB: agentConfigurationFromSnapshot(opponent),
        arenaId: input.evolution.arenaId,
        seed: trialSeed,
        swapSides,
      },
      runId: input.runId,
    });
    const scoreFor = result.scores[swapSides ? "b" : "a"];
    const scoreAgainst = result.scores[swapSides ? "a" : "b"];
    margins.push(scoreFor - scoreAgainst);
    if (scoreFor > scoreAgainst) wins += 1;
    else if (scoreFor < scoreAgainst) losses += 1;
    else draws += 1;
    evidence.push(
      evidenceFromDuel({ candidate: input.candidate, opponent, result, scoreAgainst, scoreFor }),
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
    sampleCount: input.evolution.trialsPerCandidate,
    winRate: vector.winRate,
    winRateInterval: wilsonInterval(wins, input.evolution.trialsPerCandidate),
    wins,
  };
}

function operatorFor(seed: string, generation: number, childIndex: number): MutationOperator {
  const operator =
    mutationOperators[
      seededIndex(`${seed}-g${generation}-survivor${childIndex}`, mutationOperators.length)
    ];
  if (operator === undefined) throw new Error("Evolusjonen mangler mutasjonsoperator");
  return operator;
}

function addUsage(target: EvolutionUsage, usage: NormalizedUsage, defaultCalls = 1): void {
  target.providerCalls += usage.requestCount ?? defaultCalls;
  target.inputTokens += usage.inputTokens ?? 0;
  target.outputTokens += usage.outputTokens ?? 0;
  target.totalTokens += usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}

function combineUsage(...usages: readonly NormalizedUsage[]): NormalizedUsage {
  return usages.reduce<NormalizedUsage>(
    (combined, usage) => ({
      inputTokens: (combined.inputTokens ?? 0) + (usage.inputTokens ?? 0),
      outputTokens: (combined.outputTokens ?? 0) + (usage.outputTokens ?? 0),
      requestCount: (combined.requestCount ?? 0) + (usage.requestCount ?? 1),
      totalTokens:
        (combined.totalTokens ?? 0) +
        (usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)),
    }),
    {},
  );
}

async function generateMutationProposal(input: {
  model: EvolutionInput["mutationModel"];
  operator: MutationOperator;
  prompt: ReturnType<typeof buildMutationPrompt>;
  registry: ProviderRegistry;
  role: "agent" | "main";
  signal?: AbortSignal;
}): Promise<{ proposal: MutationProposal; response: TextGenerationResult; usage: NormalizedUsage }> {
  const provider = input.registry.get(input.model.providerId);
  if (provider.generateText === undefined) {
    throw new Error(`Provideren ${provider.id} støtter ikke tekstbasert agentmutasjon`);
  }
  const aggregate: NormalizedUsage = {};
  let repairContext = "";
  let lastError: unknown;
  let lastResponse: TextGenerationResult | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await provider.generateText({
      modelId: input.model.modelId,
      prompt: `${input.prompt.prompt}${repairContext}`,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      system: input.prompt.system,
      temperature: input.operator === "randomized" ? 0.65 : 0.2,
    });
    lastResponse = response;
    aggregate.inputTokens = (aggregate.inputTokens ?? 0) + (response.usage.inputTokens ?? 0);
    aggregate.outputTokens = (aggregate.outputTokens ?? 0) + (response.usage.outputTokens ?? 0);
    aggregate.totalTokens = (aggregate.totalTokens ?? 0) + (response.usage.totalTokens ?? 0);
    aggregate.requestCount = (aggregate.requestCount ?? 0) + (response.usage.requestCount ?? 1);
    try {
      return { proposal: parseMutationProposal(response.content), response, usage: aggregate };
    } catch (error) {
      lastError = error;
      repairContext = [
        "\n\nFORRIGE SVAR VAR UGYLDIG.",
        error instanceof Error ? error.message : "Skjemavalidering feilet.",
        `Ugyldig svar (avkortet): ${response.content.slice(0, 4_000)}`,
        "Returner hele, korrigerte JSON-objektet og ingenting annet.",
      ].join("\n");
    }
  }
  throw new Error(
    `${input.role === "agent" ? "Agentmodellen" : "Hovedmodellen"} klarte ikke å returnere en gyldig agentmutasjon etter tre forsøk`,
    { cause: lastError ?? lastResponse },
  );
}

async function mutateCandidate(input: {
  childIndex: number;
  clock: () => Date;
  evolution: EvolutionInput;
  generation: number;
  mutationModelSnapshot: ProviderSnapshot;
  parent: CandidateEvaluation;
  runId: EntityId;
  secondaryParent?: CandidateEvaluation;
  selfModelSnapshot: ProviderSnapshot;
}): Promise<EvolutionMutation> {
  throwIfAborted(input.evolution.signal);
  const operator = operatorFor(input.evolution.seed, input.generation, input.childIndex);
  const secondaryParent = operator === "crossover" ? input.secondaryParent : undefined;
  const stepId = `mutation-${compactHash(
    `${input.runId}-${input.generation}-${input.parent.agent.id}-${input.childIndex}`,
  )}`;
  const stored = await input.evolution.resumeStore?.loadMutation(stepId);
  if (stored !== null && stored !== undefined) {
    const mutation = EvolutionMutationSchema.parse(stored) as EvolutionMutation;
    await input.evolution.onMutation?.(mutation, {
      generationNumber: input.generation,
      runId: input.runId,
      stepId,
    });
    return mutation;
  }
  const selfProviderId = input.parent.agent.providerId;
  if (selfProviderId === "mock") {
    throw new Error("Scripted mock-agent kan ikke utføre selvrefleksjon i Evolution");
  }
  const selfPromptBase = buildMutationPrompt({
    evidence: input.parent.evidence,
    mutationModel: {
      modelId: input.parent.agent.modelId,
      providerId: selfProviderId,
    },
    operator,
    parentGenome: input.parent.agent.genome,
    parentMemory: input.parent.agent.memory,
    ...(secondaryParent === undefined ? {} : { secondaryParent: secondaryParent.agent.genome }),
  });
  const selfGenerated = await generateMutationProposal({
    model: {
      modelId: input.parent.agent.modelId,
      providerId: selfProviderId,
    },
    operator,
    prompt: {
      prompt: [
        `Du er ${input.parent.agent.name}. Foreslå selv konkrete endringer i din egen SOUL.md, minne og taktikk etter kampene.`,
        selfPromptBase.prompt,
      ].join("\n\n"),
      system:
        "Du er agentens avgrensede selvrefleksjonssteg. Bruk bare egen gjeldende agenttilstand og observerbare kamper. Returner bare ett validert JSON-forslag; du avgjør ikke selv om forslaget blir godkjent.",
    },
    registry: input.evolution.registry,
    role: "agent",
    ...(input.evolution.signal === undefined ? {} : { signal: input.evolution.signal }),
  });
  const mainPrompt = buildMutationPrompt({
    evidence: input.parent.evidence,
    mutationModel: input.evolution.mutationModel,
    operator,
    parentGenome: input.parent.agent.genome,
    parentMemory: input.parent.agent.memory,
    ...(secondaryParent === undefined ? {} : { secondaryParent: secondaryParent.agent.genome }),
    selfProposal: selfGenerated.proposal,
  });
  const generated = await generateMutationProposal({
    model: input.evolution.mutationModel,
    operator,
    prompt: mainPrompt,
    registry: input.evolution.registry,
    role: "main",
    ...(input.evolution.signal === undefined ? {} : { signal: input.evolution.signal }),
  });
  const evidenceMatchIds = input.parent.evidence.map(({ matchId }) => matchId).slice(-20);
  const applied = applyMutationProposal({
    agentId: input.parent.agent.agentId,
    clock: input.clock,
    generation: input.generation,
    mutationModel: input.evolution.mutationModel,
    operator,
    parentGenome: input.parent.agent.genome,
    parentMemory: input.parent.agent.memory,
    proposal: generated.proposal,
    ...(secondaryParent === undefined ? {} : { secondaryParent: secondaryParent.agent.genome }),
    sourceMatchIds: evidenceMatchIds,
  });
  const parentSnapshotIds = [
    input.parent.agent.id,
    ...(secondaryParent === undefined ? [] : [secondaryParent.agent.id]),
  ];
  const child = createAgentSnapshot({
    agentId: input.parent.agent.agentId,
    clock: input.clock,
    genome: applied.genome,
    memory: applied.memory,
    modelId: input.parent.agent.modelId,
    name: input.parent.agent.name,
    parentSnapshotIds,
    providerId: input.parent.agent.providerId,
    status: "active",
    strategy: generated.proposal.strategy ?? input.parent.agent.strategy,
  });
  const lineage = LineageEdgeSchema.parse({
    childGenomeId: child.genome.id,
    id: createDeterministicId(
      "lineage",
      compactHash(`${input.runId}-${stepId}-${parentSnapshotIds.join("-")}-${child.genome.id}`),
    ),
    mutationOperator: operator,
    parentGenomeIds: [
      input.parent.agent.genome.id,
      ...(secondaryParent === undefined ? [] : [secondaryParent.agent.genome.id]),
    ],
  });
  const mutation: EvolutionMutation = {
    child,
    diff: applied.diff,
    evidenceMatchIds,
    lineage,
    memoryWrites: applied.memoryWrites,
    mutationModelSnapshot: input.mutationModelSnapshot,
    parentSnapshotIds,
    selfModelSnapshot: input.selfModelSnapshot,
    selfProposal: selfGenerated.proposal,
    stepId,
    summary: applied.summary,
    usage: combineUsage(selfGenerated.usage, generated.usage),
  };
  EvolutionMutationSchema.parse(mutation);
  await input.evolution.resumeStore?.saveMutation(stepId, mutation);
  await input.evolution.onMutation?.(mutation, {
    generationNumber: input.generation,
    runId: input.runId,
    stepId,
  });
  return mutation;
}

async function evaluateHoldout(input: {
  challenger: AgentSnapshot;
  evolution: EvolutionInput;
  incumbent: AgentSnapshot;
  runId: EntityId;
  arenaVersion: string;
}): Promise<ChampionDecision> {
  let wins = 0;
  let totalMargin = 0;
  const seeds: string[] = [];
  for (let trial = 0; trial < input.evolution.holdoutTrials; trial += 1) {
    throwIfAborted(input.evolution.signal);
    const swapSides = trial % 2 === 1;
    const trialSeed = `${input.evolution.seed}-sealed-holdout-${trial}`;
    const stepId = duelStepId({
      candidateSnapshotId: input.challenger.id,
      generationNumber: input.evolution.generationCount,
      phase: "holdout",
      runId: input.runId,
      trial,
    });
    seeds.push(trialSeed);
    const result = await runStoredDuel({
      context: {
        generationNumber: input.evolution.generationCount,
        phase: "holdout",
        stepId,
      },
      evolution: input.evolution,
      request: {
        agentA: agentConfigurationFromSnapshot(input.challenger),
        agentB: agentConfigurationFromSnapshot(input.incumbent),
        arenaId: input.evolution.arenaId,
        seed: trialSeed,
        swapSides,
      },
      runId: input.runId,
    });
    const scoreFor = result.scores[swapSides ? "b" : "a"];
    const scoreAgainst = result.scores[swapSides ? "a" : "b"];
    totalMargin += scoreFor - scoreAgainst;
    if (scoreFor > scoreAgainst) wins += 1;
  }
  const interval = wilsonInterval(wins, input.evolution.holdoutTrials);
  const averageMargin = totalMargin / input.evolution.holdoutTrials;
  const reasons: string[] = [];
  if (averageMargin <= 0) reasons.push("Holdout-marginen er ikke positiv.");
  if (interval.lower <= 0.5) reasons.push("95 %-intervallets nedre grense er ikke over 50 %.");
  return {
    arenaVersion: input.arenaVersion,
    challengerSnapshotId: input.challenger.id,
    holdoutAverageMargin: Number(averageMargin.toFixed(4)),
    holdoutSampleCount: input.evolution.holdoutTrials,
    holdoutWinRate: Number((wins / input.evolution.holdoutTrials).toFixed(4)),
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
  assertIntegerRange(input.generationCount, 1, 100, "Antall evolusjonsrunder");
  assertIntegerRange(input.population.length, 2, 100, "Populasjonen");
  assertIntegerRange(input.trialsPerCandidate, 2, 20, "Antall forsøk per kandidat");
  assertIntegerRange(input.holdoutTrials, 4, 40, "Antall holdout-forsøk");
  if (input.trialsPerCandidate % 2 !== 0 || input.holdoutTrials % 2 !== 0) {
    throw new Error("Evalueringsdueller må komme i sidebyttede par");
  }
  assertIntegerRange(input.concurrency ?? 2, 1, 8, "Parallellitet");
  const agentIds = new Set(input.population.map(({ agentId }) => agentId));
  const snapshotIds = new Set(input.population.map(({ id }) => id));
  if (agentIds.size !== input.population.length || snapshotIds.size !== input.population.length) {
    throw new Error("Hver evolusjonsplass må ha en unik agent og et unikt snapshot");
  }
  if (input.population.some(({ providerId }) => providerId === "mock")) {
    throw new Error("Scripted mock-agenter kan bare brukes som kontroller, ikke i Evolution");
  }
  if (input.incumbent?.providerId === "mock") {
    throw new Error("Historisk champion i Evolution må bruke en ekte modellprovider");
  }
  if (input.runNonce.trim().length === 0 || input.runNonce.length > 128) {
    throw new Error("Evolution-run krever en unik runNonce på maksimalt 128 tegn");
  }
}

export async function runEvolution(input: EvolutionInput): Promise<EvolutionResult> {
  validateInput(input);
  throwIfAborted(input.signal);
  const arena = getBuiltInArena(input.arenaId);
  if (arena === undefined) throw new Error(`Ukjent evolusjonsarena: ${input.arenaId}`);
  const concurrency = input.concurrency ?? 2;
  const now = input.clock ?? (() => new Date());
  const initialPopulationSize = input.population.length;
  const estimatedProviderCalls = estimateProviderCalls(
    {
      generationCount: input.generationCount,
      holdoutTrials: input.holdoutTrials,
      populationSize: initialPopulationSize,
      trialsPerCandidate: input.trialsPerCandidate,
    },
    arena.rounds,
  );
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

  const providerSnapshotsByKey = new Map<string, ProviderSnapshot>();
  for (const snapshot of [
    ...input.population,
    ...(input.incumbent === undefined ? [] : [input.incumbent]),
  ]) {
    const key = `${snapshot.providerId}:${snapshot.modelId}`;
    if (providerSnapshotsByKey.has(key)) continue;
    const providerSnapshot = await input.registry.get(snapshot.providerId).captureSnapshot(snapshot.modelId);
    providerSnapshotsByKey.set(key, providerSnapshot);
    await input.onProviderSnapshot?.(providerSnapshot, { runId });
  }
  const mutationProvider = input.registry.get(input.mutationModel.providerId);
  if (mutationProvider.generateText === undefined) {
    throw new Error(`Provideren ${mutationProvider.id} støtter ikke tekstbasert agentmutasjon`);
  }
  const mutationModelSnapshot = await mutationProvider.captureSnapshot(input.mutationModel.modelId);
  providerSnapshotsByKey.set(
    `${mutationModelSnapshot.providerId}:${mutationModelSnapshot.modelId}`,
    mutationModelSnapshot,
  );
  await input.onProviderSnapshot?.(mutationModelSnapshot, { runId });

  let population = [...input.population];
  const generations: EvolutionGeneration[] = [];
  const hallOfFame: CandidateEvaluation[] = [];
  const lineage: LineageEdge[] = [];
  const usage: EvolutionUsage = { inputTokens: 0, outputTokens: 0, providerCalls: 0, totalTokens: 0 };
  const executionInput: EvolutionInput = {
    ...input,
    onDuel: async (duel, context) => {
      addUsage(usage, {
        inputTokens: duel.usage.inputTokens,
        outputTokens: duel.usage.outputTokens,
        requestCount: duel.usage.providerCalls,
        totalTokens: duel.usage.totalTokens,
      }, 0);
      await input.onDuel?.(duel, context);
    },
  };
  const schedule = evolutionPopulationSchedule(initialPopulationSize, input.generationCount);
  const totalWork =
    schedule.reduce((sum, size) => sum + size, 0) +
    schedule.reduce(
      (sum, _size, generationNumber) =>
        sum +
        survivorCountAfterGeneration(
          initialPopulationSize,
          input.generationCount,
          generationNumber,
        ),
      0,
    ) +
    input.holdoutTrials;
  let completedWork = 0;
  let finalRunnerUp: AgentSnapshot | undefined;

  for (let generationNumber = 0; generationNumber < input.generationCount; generationNumber += 1) {
    throwIfAborted(input.signal);
    await input.onProgress?.({
      activeAgents: population.length,
      completedWork,
      generation: generationNumber + 1,
      generationCount: input.generationCount,
      message: `Runde ${generationNumber + 1}: ${population.length} agenter spiller ekte modelldueller`,
      phase: "evaluating",
      totalWork,
    });
    const candidates = await mapConcurrent(population, concurrency, async (candidate, index) => {
      const evaluated = await evaluateCandidate({
        arenaVersion: arena.version,
        candidate,
        candidateIndex: index,
        evolution: executionInput,
        generationNumber,
        population,
        runId,
      });
      completedWork += 1;
      await input.onProgress?.({
        activeAgents: population.length,
        completedWork,
        generation: generationNumber + 1,
        generationCount: input.generationCount,
        message: `Evaluerte ${completedWork} arbeidssteg; ${population.length} agenter er aktive`,
        phase: "evaluating",
        totalWork,
      });
      return evaluated;
    });
    const ranked = candidates.toSorted(
      (left, right) => right.fitness - left.fitness || left.agent.id.localeCompare(right.agent.id),
    );
    const best = ranked[0];
    if (best === undefined) throw new Error("Evolusjonen produserte ingen kandidat");
    if (!hallOfFame.some(({ agent }) => agent.id === best.agent.id)) hallOfFame.push(best);
    const survivorCount = survivorCountAfterGeneration(
      initialPopulationSize,
      input.generationCount,
      generationNumber,
    );
    const survivors = ranked.slice(0, survivorCount);
    const eliminated = ranked.slice(survivorCount);
    if (generationNumber === input.generationCount - 1) finalRunnerUp = ranked[1]?.agent;
    for (const candidate of eliminated) await input.onRetired?.(candidate.agent);

    await input.onProgress?.({
      activeAgents: population.length,
      completedWork,
      generation: generationNumber + 1,
      generationCount: input.generationCount,
      message: `Hoved-AI muterer SOUL.md, minne og taktikk for ${survivors.length} overlevende`,
      phase: "mutating",
      totalWork,
    });
    const mutations = await mapConcurrent(survivors, concurrency, async (parent, childIndex) => {
      const secondaryParent = ranked.find(({ agent }) => agent.id !== parent.agent.id);
      const selfModelSnapshot = providerSnapshotsByKey.get(
        `${parent.agent.providerId}:${parent.agent.modelId}`,
      );
      if (selfModelSnapshot === undefined) {
        throw new Error(`Mangler provider-snapshot for selvrefleksjonen til ${parent.agent.name}`);
      }
      const mutation = await mutateCandidate({
        childIndex,
        clock: now,
        evolution: executionInput,
        generation: generationNumber + 1,
        mutationModelSnapshot,
        parent,
        runId,
        selfModelSnapshot,
        ...(secondaryParent === undefined ? {} : { secondaryParent }),
      });
      addUsage(usage, mutation.usage);
      completedWork += 1;
      await input.onProgress?.({
        activeAgents: survivors.length,
        completedWork,
        generation: generationNumber + 1,
        generationCount: input.generationCount,
        message: `Hoved-AI har versjonert ${childIndex + 1} av ${survivors.length} overlevende`,
        phase: "mutating",
        totalWork,
      });
      return mutation;
    });
    lineage.push(...mutations.map(({ lineage: edge }) => edge));
    const generation = GenerationSchema.parse({
      activeAgentIds: population.map(({ agentId }) => agentId),
      id: createDeterministicId("generation", compactHash(`${runId}-${generationNumber}`)),
      number: generationNumber,
      runId,
    });
    generations.push({
      activePopulationSize: population.length,
      bestFitness: best.fitness,
      candidates: ranked,
      eliminatedSnapshotIds: eliminated.map(({ agent }) => agent.id),
      generation,
      meanFitness: Number(
        (ranked.reduce((sum, candidate) => sum + candidate.fitness, 0) / ranked.length).toFixed(4),
      ),
      mutations,
      survivorSnapshotIds: mutations.map(({ child }) => child.id),
    });
    population = mutations.map(({ child }) => child);
  }

  const winner = population[0];
  const best = generations.at(-1)?.candidates[0];
  const incumbent =
    input.incumbent ??
    finalRunnerUp ??
    hallOfFame
      .filter(({ agent }) => agent.agentId !== winner?.agentId)
      .toSorted((left, right) => right.fitness - left.fitness)[0]?.agent;
  if (winner === undefined || best === undefined || incumbent === undefined) {
    throw new Error("Evolusjonen fullførte uten en vinner og en holdout-motstander");
  }
  await input.onProgress?.({
    activeAgents: 1,
    completedWork,
    generation: input.generationCount,
    generationCount: input.generationCount,
    message: "Én agent gjenstår; sluttmutasjonen testes på forseglede holdouts",
    phase: "holdout",
    totalWork,
  });
  const championDecision = await evaluateHoldout({
    arenaVersion: arena.version,
    challenger: winner,
    evolution: executionInput,
    incumbent,
    runId,
  });
  completedWork += input.holdoutTrials;
  await input.onProgress?.({
    activeAgents: 1,
    completedWork,
    generation: input.generationCount,
    generationCount: input.generationCount,
    message: championDecision.promoted
      ? "Én vinner står igjen og champion-kriteriene er oppfylt"
      : "Én vinner står igjen; holdout fullført uten champion-promotering",
    phase: "completed",
    totalWork,
  });
  return {
    best,
    championDecision,
    completedAt: now().toISOString(),
    estimatedProviderCalls,
    experiment,
    finalPopulationSize: 1,
    generations,
    hallOfFame,
    lineage,
    providerSnapshots: [...providerSnapshotsByKey.values()],
    run,
    totalDuels:
      schedule.reduce(
        (sum, activeAgents) => sum + activeAgents * input.trialsPerCandidate,
        0,
      ) + input.holdoutTrials,
    usage,
    winner,
  };
}
