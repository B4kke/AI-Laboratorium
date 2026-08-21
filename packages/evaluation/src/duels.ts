import type { DuelResult } from "@ai-lab/domain";

import { wilsonInterval, type ConfidenceInterval } from "./statistics";

export type DuelEvaluation = {
  averageMargin: number;
  averageScore: number;
  draws: number;
  losses: number;
  sampleCount: number;
  side: "a" | "b";
  winRate: number;
  winRateInterval: ConfidenceInterval;
  wins: number;
};

export function evaluateDuels(results: readonly DuelResult[], side: "a" | "b"): DuelEvaluation {
  if (results.length === 0) {
    throw new Error("Evalueringen krever minst én fullført duell");
  }
  const opposite = side === "a" ? "b" : "a";
  const wins = results.filter(({ winner }) => winner === side).length;
  const draws = results.filter(({ winner }) => winner === "draw").length;
  const losses = results.length - wins - draws;
  const scoreSum = results.reduce((sum, result) => sum + result.scores[side], 0);
  const marginSum = results.reduce(
    (sum, result) => sum + result.scores[side] - result.scores[opposite],
    0,
  );
  return {
    averageMargin: marginSum / results.length,
    averageScore: scoreSum / results.length,
    draws,
    losses,
    sampleCount: results.length,
    side,
    winRate: wins / results.length,
    winRateInterval: wilsonInterval(wins, results.length),
    wins,
  };
}
