import { describe, expect, it } from "vitest";

import { EvolutionRequestSchema, estimateProviderCalls } from "./config";

const baseRequest = {
  arenaId: "fangens-dilemma",
  concurrency: 4,
  defaultModel: { modelId: "default-free", providerId: "opencode-zen" as const },
  generationCount: 3,
  holdoutTrials: 6,
  maxProviderCalls: 100_000,
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
        populationSize: 3,
        slotOverrides: [{ index: 1 }, { index: 1 }],
      }),
    ).toThrow();
    expect(() =>
      EvolutionRequestSchema.parse({
        ...baseRequest,
        populationSize: 3,
        slotOverrides: [{ index: 3 }],
      }),
    ).toThrow();
  });

  it("beregner eksplisitt leverandørbudsjett før kølegging", () => {
    expect(estimateProviderCalls({ ...baseRequest, populationSize: 4 }, 8)).toBe(486);
  });

  it("krever sidebyttede evalueringspar", () => {
    expect(() => EvolutionRequestSchema.parse({ ...baseRequest, trialsPerCandidate: 3 })).toThrow();
    expect(() => EvolutionRequestSchema.parse({ ...baseRequest, holdoutTrials: 5 })).toThrow();
  });
});
