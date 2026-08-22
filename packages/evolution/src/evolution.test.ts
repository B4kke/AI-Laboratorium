import { createAgentSnapshot, createGenome, createMemorySnapshot } from "@ai-lab/agents";
import {
  ProviderSnapshotSchema,
  createDeterministicId,
  type AgentSnapshot,
  type ProviderSnapshot,
} from "@ai-lab/domain";
import {
  ProviderRegistry,
  type DecisionRequest,
  type DecisionResult,
  type ModelDescriptor,
  type ModelProvider,
  type TextGenerationRequest,
  type TextGenerationResult,
} from "@ai-lab/providers";
import { describe, expect, it } from "vitest";

import { compactEvolutionResult, runEvolution } from "./index";

const fixedClock = () => new Date("2026-08-21T20:00:00.000Z");

class ConversationalEvolutionProvider implements ModelProvider {
  readonly id = "opencode-zen" as const;
  mutationCalls = 0;
  seenDecisionRequests: DecisionRequest[] = [];

  async captureSnapshot(modelId: string): Promise<ProviderSnapshot> {
    return ProviderSnapshotSchema.parse({
      capturedAt: fixedClock().toISOString(),
      endpointFamily: "chat-completions",
      freeClassification: "confirmed-free",
      id: createDeterministicId("provider", `${this.id}-${modelId}`),
      modelId,
      providerId: this.id,
      supportsStructuredOutput: true,
      supportsTools: false,
    });
  }

  async generateDecision(request: DecisionRequest): Promise<DecisionResult> {
    this.seenDecisionRequests.push(request);
    const prefersBetrayal = request.soul?.includes("konfronter") ?? false;
    const action =
      request.allowedActions.find(({ id }) => id === (prefersBetrayal ? "betray" : "cooperate")) ??
      request.allowedActions[0];
    if (action === undefined) throw new Error("Testprovideren mangler handling");
    const reply =
      request.opponentLastMessage === undefined
        ? `Jeg er ${request.actorName}; min SOUL styrer åpningen.`
        : `Du sa «${request.opponentLastMessage}». Jeg svarer som ${request.actorName}.`;
    return {
      finishReason: "stop",
      latencyMs: 1,
      modelId: request.modelId,
      providerId: this.id,
      trace: {
        actionId: action.id,
        confidence: 0.8,
        goal: "Følg lagret SOUL og reager på den faktiske motparten.",
        message: reply,
        observation: request.observation,
        rationale: `Valget følger ${request.soul?.slice(0, 40) ?? "agentprofilen"}.`,
      },
      usage: { totalTokens: 20 },
    };
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    this.mutationCalls += 1;
    return {
      content: JSON.stringify({
        communicationPolicy: "Svar konkret på siste replikk og gjør påstanden etterprøvbar.",
        files: [
          {
            content: `# Verktøy\nMutasjon ${this.mutationCalls} analyserer kun observerbare hendelser.\n`,
            mediaType: "text/markdown",
            path: "tools.md",
          },
        ],
        memoryWrites: [
          {
            category: "successful_pattern",
            content: `Knytt svar til motpartens faktiske replikk, mutasjon ${this.mutationCalls}.`,
          },
        ],
        objectives: ["Maksimer robust poengsum uten å miste agentens identitet."],
        riskProfile: 0.42,
        soul: `# SOUL.md\nJeg er en mutert, evidensstyrt agentversjon ${this.mutationCalls}.`,
        summary: "SOUL.md og minnet ble endret ut fra observerbare dueller.",
      }),
      finishReason: "stop",
      latencyMs: 2,
      modelId: request.modelId,
      providerId: this.id,
      usage: { totalTokens: 50 },
    };
  }

  async health() {
    return { message: "test", status: "available" as const };
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    return ["agent-model-a", "agent-model-b", "mutator-model"].map((id) => ({
      displayName: id,
      endpointFamily: "chat-completions" as const,
      freeClassification: "confirmed-free" as const,
      id,
      providerId: this.id,
      supportsStructuredOutput: true,
      supportsTools: false,
    }));
  }
}

function makePopulation(size = 3): AgentSnapshot[] {
  return Array.from({ length: size }, (_, index) => {
    const agentId = createDeterministicId("agent", `evolution-${index}`);
    const genome = createGenome({
      communicationPolicy: "Svar i egen stemme.",
      generation: 0,
      objectives: ["Test ekte modelladferd."],
      parentIds: [],
      riskProfile: 0.2 + index * 0.2,
      soul:
        index === 1
          ? `# SOUL.md\nAgent ${index} skal konfrontere svik direkte.`
          : `# SOUL.md\nAgent ${index} bygger tillit med tydelige løfter.`,
    });
    return createAgentSnapshot({
      agentId,
      clock: fixedClock,
      genome,
      memory: createMemorySnapshot(agentId, 4_000, { clock: fixedClock }),
      modelId: index % 2 === 0 ? "agent-model-a" : "agent-model-b",
      name: `Agent ${380 + index}`,
      providerId: "opencode-zen",
      strategy: "adaptive",
    });
  });
}

function options(provider: ConversationalEvolutionProvider) {
  return {
    arenaId: "fangens-dilemma",
    clock: fixedClock,
    concurrency: 2,
    generationCount: 2,
    holdoutTrials: 4,
    maxProviderCalls: 10_000,
    mutationModel: { modelId: "mutator-model", providerId: "opencode-zen" as const },
    population: makePopulation(),
    registry: new ProviderRegistry([provider]),
    runNonce: "test-run-2026-08-21",
    seed: "test-evolusjon",
    trialsPerCandidate: 2,
  };
}

describe("ekte evolusjonsløp", () => {
  it("bruker modellgenerert SOUL.md, minne, lineage og forseglede holdouts", async () => {
    const provider = new ConversationalEvolutionProvider();
    const persistedMatches: string[] = [];
    const persistedChildren: string[] = [];
    const retiredAgents: string[] = [];
    const result = await runEvolution({
      ...options(provider),
      onDuel: (duel) => {
        persistedMatches.push(duel.matchId);
      },
      onMutation: (mutation) => {
        persistedChildren.push(mutation.child.id);
      },
      onRetired: (agent) => {
        retiredAgents.push(agent.id);
      },
    });

    expect(result.generations).toHaveLength(2);
    expect(result.hallOfFame.length).toBeGreaterThan(0);
    expect(result.totalDuels).toBe(16);
    expect(result.lineage.length).toBeGreaterThan(0);
    expect(provider.mutationCalls).toBe(result.lineage.length);
    expect(persistedChildren).toHaveLength(result.lineage.length);
    expect(retiredAgents.length).toBeGreaterThan(0);
    expect(persistedMatches).toHaveLength(result.totalDuels);
    const mutation = result.generations[0]?.mutations[0];
    expect(mutation?.child.genome.soul).toContain("mutert, evidensstyrt");
    expect(mutation?.child.genome.files.find(({ path }) => path === "SOUL.md")?.content).toBe(
      mutation?.child.genome.soul,
    );
    expect(mutation?.child.memory.parentId).toBeDefined();
    expect(mutation?.memoryWrites[0]?.sourceMatchId).toMatch(/^match_/);
    expect(mutation?.child.genome.mutation).toMatchObject({
      modelId: "mutator-model",
      providerId: "opencode-zen",
      validationStatus: "accepted",
    });
    expect(result.championDecision.holdoutSampleCount).toBe(4);
    expect(result.best.sampleCount).toBe(2);
    expect(result.best.winRateInterval.confidence).toBe(0.95);
    expect(result.best.provenance).toMatchObject({
      arenaVersion: "1.0.0",
      evaluatorVersion: "fitness-vector-v1",
      genomeId: result.best.genome.id,
      modelId: result.best.agent.modelId,
      providerId: "opencode-zen",
    });
    expect(result.championDecision.evaluatorVersion).toBe("champion-holdout-v1");

    const stored = compactEvolutionResult(result);
    expect(stored.lineageCount).toBe(result.lineage.length);
    expect(stored.generations).toHaveLength(result.generations.length);
    expect(stored.hallOfFameSnapshotIds).toEqual(result.hallOfFame.map(({ agent }) => agent.id));
    expect(stored.recentMutations.at(-1)).toMatchObject({
      changedFiles: expect.arrayContaining(["SOUL.md"]),
      memoryWriteCount: 1,
      mutationOperator: expect.any(String),
    });
    expect(stored.generations[0]).not.toHaveProperty("candidates");
    expect(stored).not.toHaveProperty("lineage");
  });

  it("fører den faktiske motpartsmeldingen inn i neste modellkall", async () => {
    const provider = new ConversationalEvolutionProvider();
    await runEvolution(options(provider));
    const contextualRequest = provider.seenDecisionRequests.find(
      ({ conversationHistory, opponentLastMessage }) =>
        conversationHistory.length > 0 && opponentLastMessage !== undefined,
    );
    expect(contextualRequest?.prompt).toContain(contextualRequest?.opponentLastMessage);
    expect(
      contextualRequest?.conversationHistory
        .toReversed()
        .find(({ speakerName }) => speakerName !== contextualRequest.actorName)?.message,
    ).toBe(contextualRequest?.opponentLastMessage);
  });

  it("isolerer run-, barn- og lineage-identiteter mellom separate jobber", async () => {
    const first = await runEvolution(options(new ConversationalEvolutionProvider()));
    const second = await runEvolution({
      ...options(new ConversationalEvolutionProvider()),
      runNonce: "annen-jobb-med-samme-seed",
    });

    expect(second.run.id).not.toBe(first.run.id);
    expect(second.generations[0]?.mutations[0]?.child.agentId).not.toBe(
      first.generations[0]?.mutations[0]?.child.agentId,
    );
    expect(second.lineage[0]?.id).not.toBe(first.lineage[0]?.id);
  });

  it("avviser scripted agenter som evolusjonskandidater", async () => {
    const provider = new ConversationalEvolutionProvider();
    const population = makePopulation();
    const first = population[0];
    if (first === undefined) throw new Error("Testen mangler agent");
    population[0] = { ...first, modelId: "scripted-adaptive", providerId: "mock" };
    await expect(runEvolution({ ...options(provider), population })).rejects.toThrow(/mock-agenter/);
  });
});
