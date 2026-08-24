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
    mutationModel: RemoteModelSelectionSchema,
    populationSize: z.number().int().min(10).max(100),
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

/**
 * Antall aktive agenter som evalueres i hver valgte evolusjonsrunde.
 * Planen reduserer alltid populasjonen til én etter siste runde, også når
 * brukeren velger flere runder enn det finnes agenter å eliminere.
 */
export function evolutionPopulationSchedule(
  populationSize: number,
  generationCount: number,
): readonly number[] {
  const population = Math.max(2, Math.trunc(populationSize));
  const generations = Math.max(1, Math.trunc(generationCount));
  const schedule = [population];
  for (let generation = 0; generation < generations - 1; generation += 1) {
    const remainingRounds = generations - generation - 1;
    schedule.push(
      Math.max(2, 1 + Math.floor(((population - 1) * remainingRounds) / generations)),
    );
  }
  return schedule;
}

export function survivorCountAfterGeneration(
  populationSize: number,
  generationCount: number,
  generationNumber: number,
): number {
  if (generationNumber >= generationCount - 1) return 1;
  const remainingRounds = generationCount - generationNumber - 1;
  return Math.max(
    2,
    1 + Math.floor(((populationSize - 1) * remainingRounds) / generationCount),
  );
}

export function estimateProviderCalls(
  request: Pick<
    EvolutionRequest,
    "generationCount" | "holdoutTrials" | "populationSize" | "trialsPerCandidate"
  >,
  arenaRounds: number,
): number {
  const schedule = evolutionPopulationSchedule(
    request.populationSize,
    request.generationCount,
  );
  const trainingDecisions =
    schedule.reduce((sum, activeAgents) => sum + activeAgents, 0) *
    request.trialsPerCandidate *
    arenaRounds *
    2;
  const mutationStages =
    2 *
    schedule.reduce(
      (sum, _activeAgents, generationNumber) =>
        sum +
        survivorCountAfterGeneration(
          request.populationSize,
          request.generationCount,
          generationNumber,
        ),
      0,
    );
  const holdoutDecisions = request.holdoutTrials * arenaRounds * 2;
  return trainingDecisions + mutationStages + holdoutDecisions;
}
