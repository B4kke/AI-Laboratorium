import {
  agentConfigurationFromSnapshot,
  appendMemory,
  createAgentSnapshot,
  createGenome,
  createMemorySnapshot,
} from "@ai-lab/agents";
import {
  AgentConfigurationSchema,
  MemoryWriteCandidateSchema,
  VirtualAgentFileSchema,
  createDeterministicId,
  createEntityId,
  type AgentConfiguration,
  type AgentSnapshot,
  type DuelRequest,
} from "@ai-lab/domain";
import { z } from "zod";

import { ApiInputError, ApiNotFoundError } from "./http";
import { getLaboratoryRepository } from "./database";

export const CreateSavedAgentSchema = z
  .object({
    files: z.array(VirtualAgentFileSchema).max(7).default([]),
    memory: z.array(MemoryWriteCandidateSchema).max(200).default([]),
    modelId: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(60),
    providerId: z.enum(["mock", "nvidia-nim", "opencode-zen"]),
    soul: z.string().trim().min(1).max(16_000),
    strategy: AgentConfigurationSchema.shape.strategy,
  })
  .strict();

export type CreateSavedAgent = z.infer<typeof CreateSavedAgentSchema>;

export function createInitialAgentSnapshot(
  inputValue: CreateSavedAgent,
  options: { agentId?: AgentSnapshot["agentId"]; clock?: () => Date } = {},
): AgentSnapshot {
  const input = CreateSavedAgentSchema.parse(inputValue);
  const clock = options.clock ?? (() => new Date());
  const agentId = options.agentId ?? createEntityId("agent");
  const genome = createGenome({
    communicationPolicy:
      input.files.find(({ path }) => path === "communication-policy.md")?.content ??
      "Svar direkte til motpartens siste reelle melding i agentens egen stemme.",
    files: input.files,
    generation: 0,
    objectives: ["Følg SOUL.md og maksimer robust resultat under arenaens regler."],
    parentIds: [],
    riskProfile: 0.5,
    soul: input.soul,
  });
  let memory = createMemorySnapshot(agentId, 8_000, { clock });
  for (const [index, item] of input.memory.entries()) {
    memory = appendMemory(memory, {
      ...item,
      createdAt: clock().toISOString(),
      sourceMatchId: createDeterministicId("match", `import-${agentId}-${index}`),
    });
  }
  return createAgentSnapshot({
    agentId,
    clock,
    genome,
    memory,
    modelId: input.modelId,
    name: input.name,
    providerId: input.providerId,
    status: input.providerId === "mock" ? "baseline" : "active",
    strategy: input.strategy,
  });
}

export async function resolveSavedAgent(
  configuration: AgentConfiguration,
): Promise<AgentConfiguration> {
  if (configuration.snapshotId === undefined) return configuration;
  const repository = await getLaboratoryRepository();
  const snapshot = await repository.getAgentSnapshot(configuration.id, configuration.snapshotId);
  if (snapshot === null) {
    throw new ApiNotFoundError(
      `Agent-snapshotet ${configuration.snapshotId} finnes ikke for ${configuration.id}`,
    );
  }
  return agentConfigurationFromSnapshot(snapshot);
}

export async function resolveDuelAgentSnapshots(input: DuelRequest): Promise<DuelRequest> {
  const [agentA, agentB] = await Promise.all([
    resolveSavedAgent(input.agentA),
    resolveSavedAgent(input.agentB),
  ]);
  if (agentA.id === agentB.id && agentA.snapshotId === agentB.snapshotId) {
    throw new ApiInputError("Velg to forskjellige agent-snapshots i en duell");
  }
  return { ...input, agentA, agentB };
}
