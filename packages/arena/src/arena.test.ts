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
    expect(first.matchId).not.toBe(second.matchId);
    expect(first.replayFingerprint).toBe(second.replayFingerprint);
    expect(first.scores).toEqual(second.scores);
    expect(projectDuel(first.events)).toEqual(projectDuel(second.events));
  });

  it("emitterer hver hendelse live via onEvent i samme rekkefølge som resultatet", async () => {
    const emitted: string[] = [];
    const result = await runDuel(request, registry, {
      onEvent: (event) => {
        emitted.push(`${event.sequence}:${event.type}`);
      },
    });
    expect(emitted.length).toBe(result.events.length);
    expect(emitted[0]).toBe("0:duel.created");
    expect(emitted.at(-1)).toBe(`${result.events.length - 1}:duel.finished`);
    expect(emitted).toEqual(result.events.map((event) => `${event.sequence}:${event.type}`));
  });

  it("leverer agentens sjel og navn inn i beslutningsforespørselen", async () => {
    const completeSoul = `SOUL-START\n${"s".repeat(9_000)}\nSOUL-END`;
    const completeToolFile = `TOOLS-START\n${"f".repeat(3_000)}\nTOOLS-END`;
    const completeMemory = Array.from({ length: 7 }, (_, index) => ({
      category: "principle" as const,
      content: `${index === 0 ? "MEMORY-START " : ""}${"m".repeat(980)}${index === 6 ? " MEMORY-END" : ""}`,
    }));
    const captured: Array<{ prompt: string; soul?: string | undefined }> = [];
    const capturingProvider = {
      captureSnapshot: async (modelId: string) => ({
        capturedAt: new Date().toISOString(),
        endpointFamily: "chat-completions" as const,
        freeClassification: "confirmed-free" as const,
        id: `provider_test_${modelId}`,
        modelId,
        providerId: "opencode-zen" as const,
        supportsStructuredOutput: false,
        supportsTools: false,
      }),
      generateDecision: async (decisionRequest: {
        allowedActions: ReadonlyArray<{ id: string }>;
        observation: string;
        prompt: string;
        soul?: string;
      }) => {
        captured.push({ prompt: decisionRequest.prompt, soul: decisionRequest.soul });
        return {
          finishReason: "stop",
          latencyMs: 1,
          modelId: "test-free",
          trace: {
            actionId: decisionRequest.allowedActions[0]?.id ?? "",
            confidence: 0.7,
            goal: "teste",
            message: "ok",
            observation: decisionRequest.observation,
            rationale: "sjeletest",
          },
          providerId: "opencode-zen" as const,
          usage: {},
        };
      },
      id: "opencode-zen",
    } as unknown as ModelProvider;
    await runDuel(
      {
        ...request,
        agentA: {
          ...request.agentA,
          files: [
            { content: completeToolFile, mediaType: "text/markdown" as const, path: "tools.md" as const },
          ],
          memoryContext: completeMemory,
          name: "Miranda",
          providerId: "opencode-zen" as const,
          soul: completeSoul,
        },
        agentB: { ...request.agentB, providerId: "opencode-zen" as const },
      },
      new ProviderRegistry([capturingProvider]),
    );
    expect(captured.length).toBeGreaterThan(0);
    const mirandaCalls = captured.filter((call) =>
      call.prompt.includes("IDENTITET: Du er agenten «Miranda»"),
    );
    expect(mirandaCalls.length).toBeGreaterThan(0);
    expect(
      mirandaCalls.every((call) => call.soul === completeSoul),
    ).toBe(true);
    const firstMiranda = mirandaCalls[0];
    expect(firstMiranda).toBeDefined();
    expect(firstMiranda?.prompt).toContain("Du er agenten «Miranda»");
    expect(firstMiranda?.prompt).toContain("SOUL-START");
    expect(firstMiranda?.prompt).toContain("SOUL-END");
    expect(firstMiranda?.prompt).toContain("TOOLS-START");
    expect(firstMiranda?.prompt).toContain("TOOLS-END");
    expect(firstMiranda?.prompt).toContain("MEMORY-START");
    expect(firstMiranda?.prompt).toContain("MEMORY-END");
  });

  it("lar modellagentene svare på hverandres faktiske meldinger", async () => {
    const seenConversations: string[][] = [];
    const conversationalProvider = {
      captureSnapshot: async (modelId: string) => ({
        capturedAt: new Date().toISOString(),
        endpointFamily: "chat-completions" as const,
        freeClassification: "confirmed-free" as const,
        id: `provider_conversation-${modelId}`,
        modelId,
        providerId: "opencode-zen" as const,
        supportsStructuredOutput: false,
        supportsTools: false,
      }),
      generateDecision: async (decisionRequest: {
        actorName: string;
        allowedActions: ReadonlyArray<{ id: string }>;
        conversationHistory: ReadonlyArray<{ message: string }>;
        observation: string;
      }) => {
        seenConversations.push(decisionRequest.conversationHistory.map(({ message }) => message));
        const previous = decisionRequest.conversationHistory.at(-1)?.message ?? "ingen melding";
        return {
          finishReason: "stop",
          latencyMs: 1,
          modelId: "conversation-free",
          providerId: "opencode-zen" as const,
          trace: {
            actionId: decisionRequest.allowedActions[0]?.id ?? "",
            confidence: 0.8,
            goal: "Besvar motparten konkret.",
            message: `${decisionRequest.actorName} svarer på: ${previous}`,
            observation: decisionRequest.observation,
            rationale: `Jeg reagerte på den faktiske meldingen «${previous}».`,
          },
          usage: {},
        };
      },
      id: "opencode-zen",
    } as unknown as ModelProvider;
    const result = await runDuel(
      {
        ...request,
        agentA: { ...request.agentA, modelId: "conversation-free", providerId: "opencode-zen" as const },
        agentB: { ...request.agentB, modelId: "conversation-free", providerId: "opencode-zen" as const },
      },
      new ProviderRegistry([conversationalProvider]),
    );

    expect(seenConversations.some((messages) => messages.length > 0)).toBe(true);
    const decisions = result.events.filter((event) => event.type === "agent.decided");
    expect(JSON.stringify(decisions)).toContain("svarer på:");
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
