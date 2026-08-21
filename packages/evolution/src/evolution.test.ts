import { describe, expect, it } from "vitest";

import { runEvolution } from "./index";

describe("evolusjonsløp", () => {
  it("kjører flere generasjoner med elitisme, mutasjon og lineage", async () => {
    const result = await runEvolution({
      clock: () => new Date("2026-08-21T20:00:00.000Z"),
      generationCount: 3,
      populationSize: 4,
      seed: "test-evolusjon",
      trialsPerCandidate: 2,
    });
    expect(result.generations).toHaveLength(3);
    expect(result.totalDuels).toBe(24);
    expect(result.lineage.length).toBeGreaterThan(0);
    expect(result.best.sampleCount).toBe(2);
    expect(result.best.winRateInterval.confidence).toBe(0.95);
  });

  it("er deterministisk med samme seed", async () => {
    const options = { generationCount: 2, populationSize: 3, seed: "samme", trialsPerCandidate: 2 };
    const first = await runEvolution(options);
    const second = await runEvolution(options);
    expect(first.best.genome.id).toBe(second.best.genome.id);
    expect(first.generations.map(({ bestFitness }) => bestFitness)).toEqual(
      second.generations.map(({ bestFitness }) => bestFitness),
    );
  });
});
