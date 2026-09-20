import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  EvolutionRequestSchema,
  estimateProviderCalls,
  evolutionPopulationSchedule,
  survivorCountAfterGeneration,
} from "./config";

const baseRequest = {
  arenaId: "fangens-dilemma",
  concurrency: 4,
  defaultModel: { modelId: "default-free", providerId: "opencode-zen" as const },
  generationCount: 3,
  holdoutTrials: 6,
  mutationModel: { modelId: "mutator-free", providerId: "opencode-zen" as const },
  populationSize: 100,
  seed: "hundre-agenter",
  trialsPerCandidate: 2,
};

describe("evolusjonskonfigurasjon", () => {
  it("støtter hundre ulike modelloverstyringer uten dupliserte API-nøkler", () => {
    const parsed = EvolutionRequestSchema.parse({
      ...baseRequest,
      slotOverrides: Array.from({ length: 100 }, (_, index) => ({
        index,
        model: {
          modelId: `modell-${index + 1}`,
          providerId: index % 2 === 0 ? "opencode-zen" : "nvidia-nim",
        },
      })),
    });
    expect(parsed.slotOverrides).toHaveLength(100);
    expect(new Set(parsed.slotOverrides.map(({ model }) => model?.modelId)).size).toBe(100);
  });

  it("avviser dupliserte eller ugyldige agentplasser", () => {
    expect(() =>
      EvolutionRequestSchema.parse({
        ...baseRequest,
        populationSize: 10,
        slotOverrides: [{ index: 1 }, { index: 1 }],
      }),
    ).toThrow();
    expect(() =>
      EvolutionRequestSchema.parse({
        ...baseRequest,
        populationSize: 10,
        slotOverrides: [{ index: 10 }],
      }),
    ).toThrow();
  });

  it("viser et informativt kallestimat uten å gjøre det til et budsjett", () => {
    expect(estimateProviderCalls({ ...baseRequest, populationSize: 10 }, 8)).toBe(792);
  });

  it("lager en eliminasjonsplan som ender med én vinner", () => {
    expect(evolutionPopulationSchedule(10, 3)).toEqual([10, 7, 4]);
    expect(survivorCountAfterGeneration(10, 3, 0)).toBe(7);
    expect(survivorCountAfterGeneration(10, 3, 1)).toBe(4);
    expect(survivorCountAfterGeneration(10, 3, 2)).toBe(1);
  });

  it("bevarer eliminasjonsinvariantene for alle tillatte størrelser", () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 100, min: 10 }),
        fc.integer({ max: 100, min: 1 }),
        (populationSize, generationCount) => {
          const schedule = evolutionPopulationSchedule(populationSize, generationCount);
          expect(schedule).toHaveLength(generationCount);
          expect(schedule[0]).toBe(populationSize);
          for (const [index, activeAgents] of schedule.entries()) {
            expect(activeAgents).toBeGreaterThanOrEqual(2);
            expect(activeAgents).toBeLessThanOrEqual(populationSize);
            if (index > 0) expect(activeAgents).toBeLessThanOrEqual(schedule[index - 1] ?? 0);
          }

          const survivors = Array.from({ length: generationCount }, (_, generationNumber) =>
            survivorCountAfterGeneration(populationSize, generationCount, generationNumber),
          );
          expect(survivors.at(-1)).toBe(1);
          for (let index = 1; index < survivors.length; index += 1) {
            expect(survivors[index]).toBeLessThanOrEqual(survivors[index - 1] ?? 0);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("krever sidebyttede evalueringspar", () => {
    expect(() => EvolutionRequestSchema.parse({ ...baseRequest, trialsPerCandidate: 3 })).toThrow();
    expect(() => EvolutionRequestSchema.parse({ ...baseRequest, holdoutTrials: 5 })).toThrow();
  });
});
