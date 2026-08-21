import { builtInArenas, runDuel } from "@ai-lab/arena";
import { MockProvider, ProviderRegistry } from "@ai-lab/providers";
import { beforeAll, describe, expect, it } from "vitest";

import { createReportToken, verifyReportToken } from "./report-token";

const secret = "testhemmelighet-med-minst-trettito-tegn-2026";
const nowMs = Date.parse("2026-08-21T20:00:00.000Z");
let result: Awaited<ReturnType<typeof runDuel>>;

beforeAll(async () => {
  result = await runDuel(
    {
      agentA: {
        id: "agent_token-a",
        modelId: "scripted-cooperative",
        name: "Astra",
        providerId: "mock",
        strategy: "cooperative",
      },
      agentB: {
        id: "agent_token-b",
        modelId: "scripted-opportunist",
        name: "Nova",
        providerId: "mock",
        strategy: "opportunist",
      },
      arenaSpec: builtInArenas[0],
      seed: "rapportbevis-test",
      swapSides: false,
    },
    new ProviderRegistry([new MockProvider()]),
    { clock: () => new Date(nowMs) },
  );
});

describe("serverutstedt rapportbevis", () => {
  it("godtar det eksakte serverresultatet", () => {
    const token = createReportToken(result, { nowMs, secret });
    expect(() => verifyReportToken(result, token, { nowMs, secret })).not.toThrow();
  });

  it("avviser en manipulert score", () => {
    const token = createReportToken(result, { nowMs, secret });
    expect(() =>
      verifyReportToken(
        { ...result, scores: { ...result.scores, a: result.scores.a + 1 } },
        token,
        { nowMs, secret },
      ),
    ).toThrow(/samsvarer ikke/);
  });

  it("avviser utløpte bevis", () => {
    const token = createReportToken(result, { nowMs, secret });
    expect(() =>
      verifyReportToken(result, token, { nowMs: nowMs + 16 * 60_000, secret }),
    ).toThrow(/utløpt/);
  });
});
