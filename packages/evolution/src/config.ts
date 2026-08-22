import { EntityIdSchema } from "@ai-lab/domain";
import { z } from "zod";

export const RemoteModelSelectionSchema = z
  .object({
    modelId: z.string().trim().min(1).max(200),
    providerId: z.enum(["nvidia-nim", "opencode-zen"]),
  })
  .strict();

export const PopulationModelSelectionSchema = z
  .object({
    modelId: z.string().trim().min(1).max(200),
    providerId: z.enum(["nvidia-nim", "opencode-zen"]),
  })
  .strict();

export const PopulationSlotOverrideSchema = z
  .object({
    agentId: EntityIdSchema.optional(),
    index: z.number().int().min(0).max(99),
    model: PopulationModelSelectionSchema.optional(),
    snapshotId: EntityIdSchema.optional(),
  })
  .strict()
  .superRefine((override, context) => {
    if (override.snapshotId !== undefined && override.agentId === undefined) {
      context.addIssue({
        code: "custom",
        message: "snapshotId krever agentId",
        path: ["snapshotId"],
      });
    }
  });

export const EvolutionRequestSchema = z
  .object({
    arenaId: z.string().trim().min(1).max(64),
    concurrency: z.number().int().min(1).max(8).default(2),
    defaultModel: RemoteModelSelectionSchema,
    generationCount: z.number().int().min(1).max(100),
    holdoutTrials: z.number().int().min(4).max(40).multipleOf(2).default(6),
    maxProviderCalls: z.number().int().min(100).max(1_000_000).default(100_000),
    mutationModel: RemoteModelSelectionSchema,
    populationSize: z.number().int().min(2).max(100),
    seed: z.string().trim().min(1).max(128),
    slotOverrides: z.array(PopulationSlotOverrideSchema).max(100).default([]),
    trialsPerCandidate: z.number().int().min(2).max(20).multipleOf(2),
  })
  .strict()
  .superRefine((request, context) => {
    const seen = new Set<number>();
    for (const [position, override] of request.slotOverrides.entries()) {
      if (override.index >= request.populationSize) {
        context.addIssue({
          code: "custom",
          message: "Modelloverstyringen peker utenfor populasjonen",
          path: ["slotOverrides", position, "index"],
        });
      }
      if (seen.has(override.index)) {
        context.addIssue({
          code: "custom",
          message: "Hver agentplass kan bare overstyres én gang",
          path: ["slotOverrides", position, "index"],
        });
      }
      seen.add(override.index);
    }
  });

export type EvolutionRequest = z.infer<typeof EvolutionRequestSchema>;

export function estimateProviderCalls(
  request: Pick<
    EvolutionRequest,
    "generationCount" | "holdoutTrials" | "populationSize" | "trialsPerCandidate"
  >,
  arenaRounds: number,
): number {
  const trainingDecisions =
    request.generationCount *
    request.populationSize *
    request.trialsPerCandidate *
    arenaRounds *
    2;
  const offspringPerGeneration = Math.max(
    1,
    request.populationSize - Math.ceil(request.populationSize * 0.25),
  );
  const mutations = Math.max(0, request.generationCount - 1) * offspringPerGeneration;
  const holdoutDecisions = request.holdoutTrials * arenaRounds * 2;
  return trainingDecisions + mutations + holdoutDecisions;
}
