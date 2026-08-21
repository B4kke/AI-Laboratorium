import { projectDuel } from "@ai-lab/events";
import { MockProvider, ProviderRegistry, type ModelProvider } from "@ai-lab/providers";
import { describe, expect, it } from "vitest";

import { builtInArenas } from "./builtins";
import { designArenaWithModel, draftArenaFromIdea } from "./designer";
import { runDuel } from "./engine";
import { lintArenaSpec, validateArenaSpec } from "./validation";

const registry = new ProviderRegistry([new MockProvider()]);
const request = {
  agentA: {
    id: "agent_astra",
    modelId: "scripted-cooperative",
    name: "Astra",
    providerId: "mock" as const,
    strategy: "cooperative" as const,
  },
  agentB: {
    id: "agent_nova",
    modelId: "scripted-opportunist",
    name: "Nova",
    providerId: "mock" as const,
    strategy: "opportunist" as const,
  },
  arenaId: "fangens-dilemma",
  seed: "norsk-seed-42",
  swapSides: false,
};

describe("innebygde arenaer", () => {
  it("har komplett og kjørbar payoff-matrise", () => {
    for (const arena of builtInArenas) {
      expect(validateArenaSpec(arena).valid, arena.id).toBe(true);
      expect(lintArenaSpec(arena).issues, arena.id).toHaveLength(0);
    }
  });

  it("avviser en manglende transition", () => {
    const arena = builtInArenas[0];
    expect(
      validateArenaSpec({ ...arena, payoffMatrix: arena.payoffMatrix.slice(1) }).issues,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: "incomplete-payoff" })]));
  });
});

describe("Arena Designer", () => {
  it("velger en sikker, validert mal fra norsk fritekst", () => {
    const draft = draftArenaFromIdea(
      "Lag en lek hvor to AI-er må forhandle om en knapp energireserve.",
    );
    expect(draft.source).toBe("local-safe-designer");
    expect(draft.spec.id).toContain("ressursforhandling");
    expect(validateArenaSpec(draft.spec).valid).toBe(true);
  });

  it("validerer modellforslaget gjennom samme sikre kontrakt", async () => {
    const template = builtInArenas[0];
    const provider = {
      generateText: async () => ({
        content: `\`\`\`json\n${JSON.stringify({ ...template, id: "modell-arena" })}\n\`\`\``,
        finishReason: "stop",
        latencyMs: 1,
        modelId: "test-free",
        providerId: "opencode-zen",
        usage: {},
      }),
    } as unknown as ModelProvider;
    const draft = await designArenaWithModel({
      idea: "Lag et strategisk samarbeidsspill for to modeller.",
      modelId: "test-free",
      provider,
    });
    expect(draft.source).toBe("model");
    expect(draft.spec.id).toBe("modell-arena");
  });
});

describe("runDuel", () => {
  it("gir samme replayfingeravtrykk for samme seed", async () => {
    const clock = () => new Date("2026-08-21T20:00:00.000Z");
    const first = await runDuel(request, registry, { clock });
    const second = await runDuel(request, registry, { clock });
    expect(first.replayFingerprint).toBe(second.replayFingerprint);
    expect(first.scores).toEqual(second.scores);
    expect(projectDuel(first.events)).toEqual(projectDuel(second.events));
  });

  it("lekker ikke motstanderens private informasjon i observasjonen", async () => {
    const arena = {
      ...builtInArenas[0],
      id: "privat-test",
      players: [
        { description: "A", id: "a" as const, name: "A", privateInformation: "A-HEMMELIG" },
        { description: "B", id: "b" as const, name: "B", privateInformation: "B-HEMMELIG" },
      ],
    };
    const result = await runDuel(
      { ...request, arenaId: undefined, arenaSpec: arena },
      registry,
      { clock: () => new Date("2026-08-21T20:00:00.000Z") },
    );
    const aDecision = result.events.find(
      (event) => event.type === "agent.decided" && event.actorId === request.agentA.id,
    );
    expect(JSON.stringify(aDecision?.payload)).toContain("A-HEMMELIG");
    expect(JSON.stringify(aDecision?.payload)).not.toContain("B-HEMMELIG");
  });
});
