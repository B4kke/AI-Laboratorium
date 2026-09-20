import {
  GenomeSnapshotSchema,
  createDeterministicId,
  type GenomeSnapshot,
  type LineageEdge,
  type VirtualAgentFile,
} from "@ai-lab/domain";

export type MutationOperator = LineageEdge["mutationOperator"];

export type GenomeDraft = Omit<GenomeSnapshot, "files" | "id"> & {
  files?: readonly VirtualAgentFile[];
  id?: GenomeSnapshot["id"];
};

function compactHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function freezeGenome(genome: GenomeSnapshot): GenomeSnapshot {
  for (const file of genome.files) Object.freeze(file);
  Object.freeze(genome.files);
  Object.freeze(genome.objectives);
  Object.freeze(genome.parentIds);
  return Object.freeze(genome);
}

function markdownList(values: readonly string[]): string {
  return `${values.map((value) => `- ${value}`).join("\n")}\n`;
}

function canonicalFiles(draft: GenomeDraft): VirtualAgentFile[] {
  const supplied = new Map(draft.files?.map((file) => [file.path, file]) ?? []);
  const derived: VirtualAgentFile[] = [
    { content: draft.soul, mediaType: "text/markdown", path: "SOUL.md" },
    {
      content: markdownList(draft.objectives),
      mediaType: "text/markdown",
      path: "objectives.md",
    },
    {
      content:
        supplied.get("policy.md")?.content ??
        "Følg arenaens regler, velg bare validerte handlinger og oppgi en kort beslutningsbegrunnelse.\n",
      mediaType: "text/markdown",
      path: "policy.md",
    },
    {
      content: `${JSON.stringify({ riskProfile: draft.riskProfile }, null, 2)}\n`,
      mediaType: "application/json",
      path: "risk-profile.json",
    },
    {
      content: draft.communicationPolicy,
      mediaType: "text/markdown",
      path: "communication-policy.md",
    },
    {
      content:
        supplied.get("memory-policy.md")?.content ??
        "Behold korte, etterprøvbare erfaringer med kilde og forkast duplikater.\n",
      mediaType: "text/markdown",
      path: "memory-policy.md",
    },
    ...(supplied.get("tools.md") === undefined ? [] : [supplied.get("tools.md")!]),
  ];
  return derived;
}

export function createGenome(draft: GenomeDraft): GenomeSnapshot {
  const files = canonicalFiles(draft);
  const identity = [
    draft.soul,
    draft.communicationPolicy,
    draft.objectives.join("|"),
    draft.riskProfile,
    draft.generation,
    draft.parentIds.join("|"),
    JSON.stringify(draft.mutation ?? null),
    files.map(({ content, path }) => `${path}:${content}`).join("|"),
  ].join("::");
  return freezeGenome(
    GenomeSnapshotSchema.parse({
      ...draft,
      files,
      id: draft.id ?? createDeterministicId("genome", compactHash(identity)),
    }),
  );
}

const operatorText: Record<MutationOperator, string> = {
  compression: "Prioriter færre prinsipper og gjør hvert valg tydelig etterprøvbart.",
  counter_strategy: "Tilpass strategien mot observerte motstandermønstre uten å overtilpasse.",
  crossover: "Kombiner langsiktig samarbeid med kontrollert opportunisme.",
  randomized: "Endre ett avgrenset strategiprinsipp og behold resten uendret.",
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
