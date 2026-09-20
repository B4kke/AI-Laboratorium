import {
  AgentSnapshotSchema,
  createDeterministicId,
  type AgentConfiguration,
  type AgentSnapshot,
  type EntityId,
  type GenomeSnapshot,
  type MemorySnapshot,
} from "@ai-lab/domain";

export type AgentSnapshotDraft = {
  agentId: EntityId;
  clock?: () => Date;
  genome: GenomeSnapshot;
  id?: EntityId;
  memory: MemorySnapshot;
  modelId: string;
  name: string;
  parentSnapshotIds?: readonly EntityId[];
  providerId: AgentConfiguration["providerId"];
  status?: AgentSnapshot["status"];
  strategy: AgentConfiguration["strategy"];
};

function compactHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function createAgentSnapshot(draft: AgentSnapshotDraft): AgentSnapshot {
  const status = draft.status ?? "active";
  const id =
    draft.id ??
    createDeterministicId(
      "agent",
      `snapshot-${compactHash(
        JSON.stringify({
          agentId: draft.agentId,
          genomeId: draft.genome.id,
          memoryId: draft.memory.id,
          modelId: draft.modelId,
          name: draft.name,
          parentSnapshotIds: draft.parentSnapshotIds ?? [],
          providerId: draft.providerId,
          status,
          strategy: draft.strategy,
        }),
      )}`,
    );
  const snapshot = AgentSnapshotSchema.parse({
    agentId: draft.agentId,
    createdAt: (draft.clock ?? (() => new Date()))().toISOString(),
    genome: draft.genome,
    id,
    memory: draft.memory,
    modelId: draft.modelId,
    name: draft.name,
    parentSnapshotIds: [...(draft.parentSnapshotIds ?? [])],
    providerId: draft.providerId,
    status,
    strategy: draft.strategy,
  });
  Object.freeze(snapshot.parentSnapshotIds);
  return Object.freeze(snapshot);
}

export function agentConfigurationFromSnapshot(snapshot: AgentSnapshot): AgentConfiguration {
  return {
    files: snapshot.genome.files,
    genomeId: snapshot.genome.id,
    id: snapshot.agentId,
    memoryContext: snapshot.memory.items.map(({ category, content }) => ({ category, content })),
    memoryId: snapshot.memory.id,
    modelId: snapshot.modelId,
    name: snapshot.name,
    providerId: snapshot.providerId,
    snapshotId: snapshot.id,
    soul: snapshot.genome.soul,
    strategy: snapshot.strategy,
  };
}
