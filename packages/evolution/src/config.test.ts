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

  it("krever sidebyttede evalueringspar", () => {
    expect(() => EvolutionRequestSchema.parse({ ...baseRequest, trialsPerCandidate: 3 })).toThrow();
    expect(() => EvolutionRequestSchema.parse({ ...baseRequest, holdoutTrials: 5 })).toThrow();
  });
});
