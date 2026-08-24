import {
  AgentStrategySchema,
  MemoryCategorySchema,
  MemorySnapshotSchema,
  VirtualAgentFileSchema,
  createDeterministicId,
  type EntityId,
  type AgentFilePath,
  type GenomeSnapshot,
  type MemoryItem,
  type MemorySnapshot,
} from "@ai-lab/domain";
import { z } from "zod";

import { createGenome, diffGenomes, type GenomeDiff, type MutationOperator } from "./genome";

const AuxiliaryMutationFileSchema = VirtualAgentFileSchema.refine(
  ({ path }) => ["memory-policy.md", "policy.md", "tools.md"].includes(path),
  "files-feltet kan bare endre policy.md, memory-policy.md eller tools.md",
);

export const MutationProposalSchema = z
  .object({
    communicationPolicy: z.string().trim().min(1).max(4_000),
    files: z
      .array(AuxiliaryMutationFileSchema)
      .max(3)
      .default([])
      .superRefine((files, context) => {
        const paths = new Set<string>();
        for (const [index, file] of files.entries()) {
          if (paths.has(file.path)) {
            context.addIssue({
              code: "custom",
              message: `Filen ${file.path} kan bare endres én gang`,
              path: [index, "path"],
            });
          }
          paths.add(file.path);
        }
      }),
    memoryWrites: z
      .array(
        z
          .object({
            category: MemoryCategorySchema,
            content: z.string().trim().min(1).max(1_000),
          })
          .strict(),
      )
      .max(8),
    objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
    riskProfile: z.number().min(0).max(1),
    soul: z.string().trim().min(1).max(16_000),
    strategy: AgentStrategySchema.optional(),
    summary: z.string().trim().min(1).max(1_000),
  })
  .strict();

export type MutationProposal = z.infer<typeof MutationProposalSchema>;

export type MutationEvidence = {
  arenaTitle: string;
  decisions: readonly {
    actionId: string;
    message: string;
    memoryWrite?: {
      category: MemoryItem["category"];
      content: string;
    };
    outcome: string;
    rationale: string;
    round: number;
  }[];
  matchId: EntityId;
  opponentName: string;
  scoreFor: number;
  scoreAgainst: number;
  seed: string;
};

export type AppliedMutation = {
  diff: GenomeDiff;
  genome: GenomeSnapshot;
  memory: MemorySnapshot;
  memoryWrites: readonly MemoryItem[];
  summary: string;
};

function compactHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function extractJson(content: string): string {
  const trimmed = content
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace
    ? trimmed.slice(firstBrace, lastBrace + 1)
    : trimmed;
}

export function parseMutationProposal(content: string): MutationProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch (error) {
    throw new Error("Mutasjonsmodellen returnerte ikke gyldig JSON", { cause: error });
  }
  return MutationProposalSchema.parse(parsed);
}

function renderEvidence(evidence: readonly MutationEvidence[]): string {
  return evidence
    .map(
      ({ arenaTitle, decisions, matchId, opponentName, scoreAgainst, scoreFor, seed }) =>
        [
          `Kamp ${matchId} · ${arenaTitle} · seed ${seed}`,
          `Motstander: ${opponentName}. Resultat: ${scoreFor}–${scoreAgainst}.`,
          ...decisions.map(
            ({ actionId, memoryWrite, message, outcome, rationale, round }) =>
              `R${round}: handling=${actionId}; melding=${JSON.stringify(message)}; begrunnelse=${JSON.stringify(rationale)}; minnekandidat=${memoryWrite === undefined ? "ingen" : JSON.stringify(memoryWrite)}; utfall=${outcome}`,
          ),
        ].join("\n"),
    )
    .join("\n\n");
}

export function buildMutationPrompt(input: {
  evidence: readonly MutationEvidence[];
  operator: MutationOperator;
  mutationModel: {
    modelId: string;
    providerId: "nvidia-nim" | "opencode-zen";
  };
  parentGenome: GenomeSnapshot;
  parentMemory: MemorySnapshot;
  secondaryParent?: GenomeSnapshot;
  selfProposal?: MutationProposal;
}): { prompt: string; system: string } {
  const memory = input.parentMemory.items
    .map(({ category, content, sourceMatchId }) => `- [${category}] ${content} (${sourceMatchId})`)
    .join("\n");
  const files = input.parentGenome.files
    .map(({ content, path }) => `--- ${path} ---\n${content}`)
    .join("\n");
  const secondary =
    input.secondaryParent === undefined
      ? "Ingen sekundær forelder."
      : `Sekundær forelder ${input.secondaryParent.id}:\n${input.secondaryParent.files
          .map(({ content, path }) => `--- ${path} ---\n${content}`)
          .join("\n")}`;
  const selfProposal =
    input.selfProposal === undefined
      ? "Agenten har ikke levert et eget forslag i dette steget."
      : [
          "AGENTENS EGET MUTASJONSFORSLAG (rådgivende, ikke automatisk godkjent):",
          JSON.stringify(input.selfProposal, null, 2),
          "Vurder forslaget mot kampdataene. Behold, korriger eller erstatt det før du returnerer den endelige mutasjonen.",
        ].join("\n");
  return {
    system:
      "Du er en avgrenset evolveringsmodell. Foreslå en ny, testbar agentversjon ut fra eksplisitte kampdata. Du skal ikke skrive kode, be om hemmeligheter eller returnere privat tankerekke. Returner bare ett JSON-objekt som følger skjemaet.",
    prompt: [
      `Mutasjonsoperator: ${input.operator}`,
      `Forelder: ${input.parentGenome.id}, generasjon ${input.parentGenome.generation}`,
      `Nåværende filer:\n${files}`,
      `Nåværende minne:\n${memory || "Ingen minner."}`,
      secondary,
      `Observerbare kampdata:\n${renderEvidence(input.evidence)}`,
      selfProposal,
      "Lag en målrettet mutasjon. Behold gode prinsipper, korriger dokumenterte svakheter og unngå å overtilpasse til én seed eller motstander.",
      "JSON-felt: soul, communicationPolicy, objectives (array), riskProfile (0..1), strategy (adaptive/cooperative/opportunist/risk_averse/unpredictable), files (array med bare øvrige filer som skal endres, path/content/mediaType), memoryWrites (array med category/content) og summary. Filer som ikke oppgis, beholdes uendret.",
      "memoryWrites.category skal være nøyaktig én av: \"mistake\", \"opponent_model\", \"principle\", \"successful_pattern\", \"world_model\".",
      "files-feltet kan bare inneholde policy.md, memory-policy.md og tools.md. SOUL.md, objectives.md, risk-profile.json og communication-policy.md styres av de egne JSON-feltene. summary skal være en kort brukerrettet forklaring, ikke en tankerekke.",
    ].join("\n\n"),
  };
}

export function applyMutationProposal(input: {
  agentId: EntityId;
  clock?: () => Date;
  generation: number;
  mutationModel: {
    modelId: string;
    providerId: "nvidia-nim" | "opencode-zen";
  };
  operator: MutationOperator;
  parentGenome: GenomeSnapshot;
  parentMemory: MemorySnapshot;
  proposal: MutationProposal;
  secondaryParent?: GenomeSnapshot;
  sourceMatchIds: readonly EntityId[];
}): AppliedMutation {
  const proposal = MutationProposalSchema.parse(input.proposal);
  const parentIds = [
    input.parentGenome.id,
    ...(input.secondaryParent === undefined ? [] : [input.secondaryParent.id]),
  ];
  const mergedFiles = new Map(
    input.parentGenome.files.map((file) => [file.path, file]),
  );
  for (const file of proposal.files) mergedFiles.set(file.path, file);
  const genomeDraft = {
    communicationPolicy: proposal.communicationPolicy,
    files: [...mergedFiles.values()],
    generation: input.generation,
    objectives: proposal.objectives,
    parentIds,
    riskProfile: proposal.riskProfile,
    soul: proposal.soul,
  } as const;
  const proposedGenome = createGenome(genomeDraft);
  const parentFiles = new Map(
    input.parentGenome.files.map((file) => [file.path, file]),
  );
  const changedFiles: AgentFilePath[] = proposedGenome.files.flatMap((file) => {
    const parent = parentFiles.get(file.path);
    return parent?.content === file.content && parent.mediaType === file.mediaType
      ? []
      : [file.path];
  });
  if (changedFiles.length === 0 && proposal.memoryWrites.length === 0) {
    throw new Error("Mutasjonsforslaget endrer verken agentfiler eller minne");
  }
  const genome = createGenome({
    ...genomeDraft,
    mutation: {
      changedFiles,
      modelId: input.mutationModel.modelId,
      operator: input.operator,
      promptVersion: "mutation-v1",
      providerId: input.mutationModel.providerId,
      summary: proposal.summary,
      validationStatus: "accepted",
    },
  });
  const createdAt = (input.clock ?? (() => new Date()))().toISOString();
  const sourceMatchIds = [...new Set(input.sourceMatchIds)].slice(-20);
  const sourceMatchId = sourceMatchIds[0];
  if (sourceMatchId === undefined) {
    throw new Error("Mutasjonen mangler observerbar kamp-proveniens");
  }
  const memoryWrites: MemoryItem[] = proposal.memoryWrites.map((write) => ({
    ...write,
    createdAt,
    sourceMatchId,
    sourceMatchIds,
  }));
  const candidates = [...input.parentMemory.items, ...memoryWrites];
  const retained: MemoryItem[] = [];
  let size = 0;
  for (const item of candidates.toReversed()) {
    if (retained.length >= 200) continue;
    if (retained.some((existing) => existing.category === item.category && existing.content === item.content)) {
      continue;
    }
    if (size + item.content.length <= input.parentMemory.budgetCharacters) {
      retained.unshift(item);
      size += item.content.length;
    }
  }
  const memory = MemorySnapshotSchema.parse({
    agentId: input.agentId,
    budgetCharacters: input.parentMemory.budgetCharacters,
    createdAt,
    generation: input.generation,
    id: createDeterministicId(
      "memory",
      `${input.agentId}-${input.generation}-${compactHash(JSON.stringify(retained))}`,
    ),
    items: retained,
    parentId: input.parentMemory.id,
  });
  Object.freeze(memory.items);
  Object.freeze(memory);
  return {
    diff: diffGenomes(input.parentGenome, genome),
    genome,
    memory,
    memoryWrites,
    summary: proposal.summary,
  };
}
