import {
  createAgentSnapshot,
  createGenome,
  createMemorySnapshot,
} from "@ai-lab/agents";
import {
  createLaboratoryRepository,
  ensureRepositorySchema,
  type EvolutionJob,
  type LaboratoryRepository,
} from "@ai-lab/db";
import {
  MemorySnapshotSchema,
  createDeterministicId,
  type AgentSnapshot,
} from "@ai-lab/domain";
import {
  compactEvolutionResult,
  EvolutionRequestSchema,
  runEvolution,
  type EvolutionRequest,
} from "@ai-lab/evolution";
import { createEnvironmentProviderRegistry } from "@ai-lab/providers";

const workerId = `runner-${process.pid}-${crypto.randomUUID()}`;
let stopping = false;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error("Evolution-worker krever DATABASE_URL");
  }
  return value;
}

function compactHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

const seedSouls = [
  "Bygg tillit med konkrete løfter, men gjengjeld dokumentert svik proporsjonalt.",
  "Vær direkte og skeptisk. Krev at motpartens ord stemmer med observerbare handlinger.",
  "Prioriter langsiktig felles gevinst og forklar kort hva som kreves for fortsatt samarbeid.",
  "Beskytt nedsiden først, men åpne raskt for samarbeid når motparten viser troverdighet.",
  "Utforsk alternative trekk kontrollert og gjør kommunikasjonen tydelig nok til å koordinere.",
  "Utnytt kortsiktige muligheter bare når det ikke ødelegger en mer verdifull stabil relasjon.",
] as const;

function createFreshSnapshot(input: {
  index: number;
  jobId: string;
  model: EvolutionRequest["defaultModel"];
}): AgentSnapshot {
  const agentId = createDeterministicId(
    "agent",
    compactHash(`${input.jobId}-initial-slot-${input.index}`),
  );
  const soul = seedSouls[input.index % seedSouls.length] ?? seedSouls[0];
  const genome = createGenome({
    communicationPolicy:
      "Snakk i førsteperson, reager på siste faktiske replikk og unngå standardfraser.",
    generation: 0,
    objectives: ["Maksimer robust poengsum på tvers av motstandere og forseglede seeds."],
    parentIds: [],
    riskProfile: 0.15 + ((input.index * 17) % 70) / 100,
    soul: `# SOUL.md\n\n${soul}\n`,
  });
  return createAgentSnapshot({
    agentId,
    genome,
    memory: createMemorySnapshot(agentId, 8_000),
    modelId: input.model.modelId,
    name: `Evolution-kandidat ${input.index + 1}`,
    providerId: input.model.providerId,
    status: "active",
    strategy: "adaptive",
  });
}

function cloneSnapshotForSlot(input: {
  index: number;
  jobId: string;
  model: EvolutionRequest["defaultModel"];
  source: AgentSnapshot;
}): AgentSnapshot {
  const agentId = createDeterministicId(
    "agent",
    compactHash(`${input.jobId}-clone-${input.index}-${input.source.id}`),
  );
  const memory = MemorySnapshotSchema.parse({
    ...input.source.memory,
    agentId,
    id: createDeterministicId(
      "memory",
      compactHash(`${input.source.memory.id}-${agentId}`),
    ),
    parentId: input.source.memory.id,
  });
  return createAgentSnapshot({
    agentId,
    genome: input.source.genome,
    memory,
    modelId: input.model.modelId,
    name: `${input.source.name} · variant ${input.index + 1}`.slice(0, 60),
    parentSnapshotIds: [input.source.id],
    providerId: input.model.providerId,
    status: "active",
    strategy: input.source.strategy,
  });
}

async function resolvePopulation(
  repository: LaboratoryRepository,
  jobId: string,
  request: EvolutionRequest,
): Promise<AgentSnapshot[]> {
  const overrides = new Map(request.slotOverrides.map((override) => [override.index, override]));
  const usedSnapshotIds = new Set<string>();
  const population: AgentSnapshot[] = [];
  for (let index = 0; index < request.populationSize; index += 1) {
    const override = overrides.get(index);
    const requestedModel = override?.model ?? request.defaultModel;
    if (override?.agentId === undefined) {
      population.push(createFreshSnapshot({ index, jobId, model: requestedModel }));
      continue;
    }
    const source = await repository.getAgentSnapshot(override.agentId, override.snapshotId);
    if (source === null) {
      throw new Error(`Lagret agent ${override.agentId} finnes ikke for plass ${index + 1}`);
    }
    if (source.providerId === "mock" && override.model === undefined) {
      throw new Error(`Agentplassen ${index + 1} bruker en scripted baseline; velg en ekte modell`);
    }
    const model = override.model ?? {
      modelId: source.modelId,
      providerId: source.providerId as "nvidia-nim" | "opencode-zen",
    };
    const mustClone =
      usedSnapshotIds.has(source.id) ||
      model.modelId !== source.modelId ||
      model.providerId !== source.providerId;
    const snapshot = mustClone
      ? cloneSnapshotForSlot({ index, jobId, model, source })
      : source;
    usedSnapshotIds.add(source.id);
    population.push(snapshot);
  }
  return population;
}

async function runJob(
  repository: LaboratoryRepository,
  job: EvolutionJob<unknown>,
): Promise<void> {
  const startedAt = Date.now();
  let heartbeatPromise: Promise<void> | null = null;
  let leaseError: Error | null = null;
  const heartbeat = (): Promise<void> => {
    if (leaseError !== null) return Promise.resolve();
    if (heartbeatPromise !== null) return heartbeatPromise;
    heartbeatPromise = (async () => {
      try {
        if (!(await repository.heartbeatEvolution(job.id, workerId))) {
          leaseError = new Error(`Worker-leasen for ${job.id} tilhører ikke lenger ${workerId}`);
        }
      } catch (error) {
        leaseError =
          error instanceof Error ? error : new Error("Heartbeat til Evolution-køen feilet");
      }
    })().finally(() => {
      heartbeatPromise = null;
    });
    return heartbeatPromise;
  };
  const assertLease = async () => {
    if (leaseError !== null) throw leaseError;
    await heartbeat();
    if (leaseError !== null) throw leaseError;
  };
  const heartbeatTimer = setInterval(() => void heartbeat(), 20_000);
  console.log(
    JSON.stringify({ jobId: job.id, level: "info", message: "evolution-job-start", workerId }),
  );
  try {
    await assertLease();
    const request = EvolutionRequestSchema.parse(job.input);
    const population = await resolvePopulation(repository, job.id, request);
    for (const snapshot of population) await repository.saveAgentSnapshot(snapshot);
    const registry = createEnvironmentProviderRegistry(process.env, { includeMock: false });
    const configuredConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);
    const workerConcurrency = Number.isInteger(configuredConcurrency)
      ? Math.max(1, Math.min(8, configuredConcurrency))
      : 2;
    const result = await runEvolution({
      arenaId: request.arenaId,
      concurrency: Math.min(request.concurrency, workerConcurrency),
      generationCount: request.generationCount,
      holdoutTrials: request.holdoutTrials,
      maxProviderCalls: request.maxProviderCalls,
      mutationModel: request.mutationModel,
      onDuel: async (duel) => {
        await assertLease();
        await repository.saveDuel(duel);
      },
      onMutation: async (mutation, { runId }) => {
        await assertLease();
        await repository.saveAgentSnapshot(mutation.child);
        await repository.saveLineage(runId, [mutation.lineage]);
      },
      onProgress: async (progress) => {
        if (!(await repository.updateEvolutionProgress(job.id, workerId, progress))) {
          throw new Error(`Worker-leasen for ${job.id} gikk tapt under fremdriftslagring`);
        }
      },
      onRetired: async (agent) => {
        await assertLease();
        await repository.updateAgentStatus(agent.agentId, "retired");
      },
      population,
      registry,
      runNonce: job.id,
      seed: request.seed,
      trialsPerCandidate: request.trialsPerCandidate,
    });
    await assertLease();
    if (result.championDecision.promoted) {
      await repository.updateAgentStatus(result.best.agent.agentId, "champion");
    }
    if (!(await repository.completeEvolution(job.id, workerId, compactEvolutionResult(result)))) {
      throw new Error(`Worker-leasen for ${job.id} gikk tapt før fullføring`);
    }
    console.log(
      JSON.stringify({
        durationMs: Date.now() - startedAt,
        jobId: job.id,
        level: "info",
        message: "evolution-job-complete",
        promoted: result.championDecision.promoted,
        totalDuels: result.totalDuels,
        workerId,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent Evolution-feil";
    const failureRecorded = await repository.failEvolution(job.id, workerId, message);
    console.error(
      JSON.stringify({
        durationMs: Date.now() - startedAt,
        error: message,
        failureRecorded,
        jobId: job.id,
        level: "error",
        message: "evolution-job-failed",
        workerId,
      }),
    );
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const repository = await createLaboratoryRepository(databaseUrl()).then(ensureRepositorySchema);
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(JSON.stringify({ level: "info", message: "worker-ready", workerId }));
  try {
    while (!stopping) {
      const job = await repository.claimEvolutionJob(workerId);
      if (job === null) {
        await pause(2_000);
        continue;
      }
      await runJob(repository, job);
    }
  } finally {
    await repository.close();
  }
}

await main();
