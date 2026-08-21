import {
  MemoryItemSchema,
  MemorySnapshotSchema,
  createDeterministicId,
  type EntityId,
  type MemoryItem,
  type MemorySnapshot,
} from "@ai-lab/domain";

function itemSize(item: MemoryItem): number {
  return item.content.length;
}

export function createMemorySnapshot(
  agentId: EntityId,
  budgetCharacters = 4_000,
): MemorySnapshot {
  return Object.freeze(
    MemorySnapshotSchema.parse({
      agentId,
      budgetCharacters,
      id: createDeterministicId("memory", `${agentId}-0`),
      items: [],
    }),
  );
}

export function appendMemory(
  snapshot: MemorySnapshot,
  itemInput: MemoryItem,
): MemorySnapshot {
  const item = MemoryItemSchema.parse(itemInput);
  const candidates = [...snapshot.items, item];
  const retained: MemoryItem[] = [];
  let size = 0;
  for (const candidate of candidates.toReversed()) {
    const candidateSize = itemSize(candidate);
    if (size + candidateSize <= snapshot.budgetCharacters) {
      retained.unshift(candidate);
      size += candidateSize;
    }
  }
  const idSuffix = `${snapshot.agentId}-${retained.length}-${item.createdAt.replace(/\W/g, "")}`;
  const next = MemorySnapshotSchema.parse({
    ...snapshot,
    id: createDeterministicId("memory", idSuffix.slice(0, 90)),
    items: retained,
  });
  Object.freeze(next.items);
  return Object.freeze(next);
}
