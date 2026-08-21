import {
  GenomeSnapshotSchema,
  createDeterministicId,
  type GenomeSnapshot,
  type LineageEdge,
} from "@ai-lab/domain";

export type MutationOperator = LineageEdge["mutationOperator"];

export type GenomeDraft = Omit<GenomeSnapshot, "id"> & { id?: GenomeSnapshot["id"] };

function compactHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function freezeGenome(genome: GenomeSnapshot): GenomeSnapshot {
  Object.freeze(genome.objectives);
  Object.freeze(genome.parentIds);
  return Object.freeze(genome);
}

export function createGenome(draft: GenomeDraft): GenomeSnapshot {
  const identity = [
    draft.soul,
    draft.communicationPolicy,
    draft.objectives.join("|"),
    draft.riskProfile,
    draft.generation,
    draft.parentIds.join("|"),
  ].join("::");
  return freezeGenome(
    GenomeSnapshotSchema.parse({
      ...draft,
      id: draft.id ?? createDeterministicId("genome", compactHash(identity)),
    }),
  );
}

const operatorText: Record<MutationOperator, string> = {
  compression: "Prioriter færre prinsipper og gjør hvert valg tydelig etterprøvbart.",
  crossover: "Kombiner langsiktig samarbeid med kontrollert opportunisme.",
  reflection: "Kontroller siste feil før du velger, og beskriv hva som endret vurderingen.",
  specialization: "Spiss strategien mot arenaens eksplisitte poengregler og motpartens mønster.",
};

export function mutateGenome(
  parent: GenomeSnapshot,
  operator: MutationOperator,
  options: { generation?: number; nonce?: string } = {},
): GenomeSnapshot {
  const generation = options.generation ?? parent.generation + 1;
  const adjustment = operator === "specialization" ? -0.08 : operator === "crossover" ? 0.04 : 0;
  const riskProfile = Math.max(0, Math.min(1, parent.riskProfile + adjustment));
  const directive = operatorText[operator];
  const soul = `${parent.soul.trim()}\n\nMutasjon ${generation}: ${directive}`.slice(-16000);
  const communicationPolicy = `${parent.communicationPolicy.trim()} ${directive}`.slice(-4000);
  const objectives = [...parent.objectives];
  if (!objectives.includes(directive) && objectives.length < 12) {
    objectives.push(directive);
  }
  const nonce = options.nonce ?? "0";
  return createGenome({
    communicationPolicy,
    generation,
    objectives,
    parentIds: [parent.id],
    riskProfile,
    soul,
    id: createDeterministicId(
      "genome",
      compactHash(`${parent.id}:${operator}:${generation}:${nonce}:${soul}`),
    ),
  });
}

export type GenomeDiff = {
  communicationPolicyChanged: boolean;
  objectiveChanges: readonly string[];
  parentIds: readonly string[];
  riskDelta: number;
  soulAppendix: string;
};

export function diffGenomes(parent: GenomeSnapshot, child: GenomeSnapshot): GenomeDiff {
  return {
    communicationPolicyChanged: parent.communicationPolicy !== child.communicationPolicy,
    objectiveChanges: child.objectives.filter((objective) => !parent.objectives.includes(objective)),
    parentIds: child.parentIds,
    riskDelta: Number((child.riskProfile - parent.riskProfile).toFixed(4)),
    soulAppendix: child.soul.startsWith(parent.soul)
      ? child.soul.slice(parent.soul.length).trim()
      : child.soul,
  };
}
