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

function compactHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function createMemorySnapshot(
  agentId: EntityId,
  budgetCharacters = 4_000,
  options: { clock?: () => Date; generation?: number; parentId?: EntityId } = {},
): MemorySnapshot {
  const generation = options.generation ?? 0;
  return Object.freeze(
    MemorySnapshotSchema.parse({
      agentId,
      budgetCharacters,
      createdAt: (options.clock ?? (() => new Date()))().toISOString(),
      generation,
      id: createDeterministicId("memory", `${agentId}-${generation}-0`),
      items: [],
      ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
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
    if (retained.length >= 200) continue;
    const candidateSize = itemSize(candidate);
    if (size + candidateSize <= snapshot.budgetCharacters) {
      retained.unshift(candidate);
      size += candidateSize;
    }
  }
  const next = MemorySnapshotSchema.parse({
    ...snapshot,
    createdAt: item.createdAt,
    id: createDeterministicId(
      "memory",
      `${snapshot.agentId}-${compactHash(JSON.stringify({ parentId: snapshot.id, retained }))}`,
    ),
    items: retained,
    parentId: snapshot.id,
  });
  Object.freeze(next.items);
  return Object.freeze(next);
}
