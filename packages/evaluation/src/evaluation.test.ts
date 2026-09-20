import { describe, expect, it } from "vitest";

import { evaluateDuels, updateElo, wilsonInterval } from "./index";

describe("statistisk evaluering", () => {
  it("gir kjent Wilson-intervall for 50 av 100", () => {
    const interval = wilsonInterval(50, 100);
    expect(interval.lower).toBeCloseTo(0.4038, 3);
    expect(interval.upper).toBeCloseTo(0.5962, 3);
  });

  it("oppdaterer lik Elo symmetrisk", () => {
    expect(updateElo(1_500, 1_500, 1)).toEqual({ a: 1_512, b: 1_488 });
  });

  it("oppsummerer dueller uten å skjule utvalgsstørrelsen", () => {
    const results = [
      { scores: { a: 5, b: 3 }, winner: "a" },
      { scores: { a: 2, b: 2 }, winner: "draw" },
      { scores: { a: 1, b: 4 }, winner: "b" },
    ] as never;
    const evaluation = evaluateDuels(results, "a");
    expect(evaluation).toMatchObject({ draws: 1, losses: 1, sampleCount: 3, wins: 1 });
    expect(evaluation.averageMargin).toBeCloseTo(-1 / 3);
  });
});
