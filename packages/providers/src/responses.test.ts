import { describe, expect, it, vi } from "vitest";

import {
  inferModelCapabilities,
  isResponsesOnlyModel,
  normalizeModelIdForComparison,
  stripProviderPrefix,
} from "./capabilities";
import { createOpenCodeZenProvider } from "./zen";
import { createNvidiaNimProvider } from "./nvidia";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function responsesBody(text: string, model: string) {
  return {
    created_at: 1_786_000_000,
    id: "resp_test123",
    model,
    object: "response",
    output: [
      {
        content: [{ text, type: "output_text" }],
        id: "msg_1",
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ],
    status: "completed",
    usage: { input_tokens: 120, output_tokens: 45, total_tokens: 165 },
  };
}

describe("capabilities", () => {
  it("klassifiserer Muse Spark som Responses med strukturert output og tools", () => {
    expect(inferModelCapabilities("muse-spark-1.3-contributor-free")).toEqual({
      endpointFamily: "responses",
      supportsStructuredOutput: true,
      supportsTools: true,
    });
    expect(inferModelCapabilities("opencode/muse-spark-1.3-contributor-free")).toEqual({
      endpointFamily: "responses",
      supportsStructuredOutput: true,
      supportsTools: true,
    });
    expect(isResponsesOnlyModel("opencode/muse-spark-1.3")).toBe(true);
  });

  it("klassifiserer Nemotron chat-modeller som kapable", () => {
    expect(
      inferModelCapabilities("nvidia/nemotron-3.5-lightning-30b-a3b"),
    ).toMatchObject({
      endpointFamily: "chat-completions",
      supportsStructuredOutput: true,
      supportsTools: true,
    });
    expect(inferModelCapabilities("opencode/nemotron-3.5-lightning-free")).toMatchObject({
      endpointFamily: "chat-completions",
      supportsStructuredOutput: true,
    });
  });

  it("klassifiserer safety/embed/parse som ikke-kapable", () => {
    expect(
      inferModelCapabilities("nvidia/llama-3.1-nemotron-safety-guard-8b-v3").supportsTools,
    ).toBe(false);
    expect(inferModelCapabilities("nvidia/nemotron-3-embed-1b").supportsStructuredOutput).toBe(
      false,
    );
  });

  it("normaliserer opencode-prefiks ved sammenligning", () => {
    expect(stripProviderPrefix("opencode/muse-spark-1.3-contributor-free")).toBe(
      "muse-spark-1.3-contributor-free",
    );
    expect(
      normalizeModelIdForComparison("opencode/Muse-Spark-1.3-Contributor-Free"),
    ).toBe(normalizeModelIdForComparison("muse-spark-1.3-contributor-free"));
  });
});

describe("zen responses", () => {
  it("eksponerer Muse Free med responses-endpoint i katalogen", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "muse-spark-1.3-contributor-free" },
          { id: "muse-spark-1.3" },
          { id: "nemotron-3.5-lightning-free" },
        ],
        object: "list",
      }),
    );
    const provider = createOpenCodeZenProvider({ fetcher });
    const models = await provider.listModels();
    const museFree = models.find(({ id }) => id === "muse-spark-1.3-contributor-free");
    expect(museFree).toMatchObject({
      endpointFamily: "responses",
      freeClassification: "confirmed-free",
      supportsStructuredOutput: true,
      supportsTools: true,
    });
    // Betalt Muse skal ikke være confirmed-free og blokkeres i free-only.
    await expect(provider.captureSnapshot("muse-spark-1.3")).rejects.toThrow(/ikke eksplisitt/);
  });

  it("ruter Muse-beslutninger til /responses med input/output-usage", async () => {
    const seenUrls: string[] = [];
    const seenBodies: Array<Record<string, unknown>> = [];
    const decisionJson = JSON.stringify({
      actionId: "share",
      confidence: 0.81,
      goal: "Bygg etterprøvbar tillit.",
      message: "Jeg deler fordi avtalen kan kontrolleres.",
      observation: "ignoreres av motoren",
      rationale: "Deling gir et testbart signal.",
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = input.toString();
      seenUrls.push(url);
      if (url.endsWith("/models")) {
        return jsonResponse({ data: [{ id: "muse-spark-1.3-contributor-free" }] });
      }
      seenBodies.push(JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")));
      return jsonResponse(responsesBody(decisionJson, "muse-spark-1.3-contributor-free"));
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });
    const decision = await provider.generateDecision({
      actorName: "Nova",
      allowedActions: [
        { description: "Del", id: "share", label: "Del" },
        { description: "Behold", id: "hoard", label: "Behold" },
      ],
      conversationHistory: [],
      modelId: "opencode/muse-spark-1.3-contributor-free",
      observation: "Motorens observasjon",
      prompt: "Velg én handling.",
      round: 1,
      seed: "muse-test",
      strategy: "adaptive",
    });

    expect(seenUrls.some((url) => url.endsWith("/responses"))).toBe(true);
    expect(seenUrls.some((url) => url.includes("/chat/completions"))).toBe(false);
    // Bar modell-ID sendes til API (uten opencode/-prefiks).
    const lastBody = seenBodies.at(-1);
    expect(lastBody?.model).toBe("muse-spark-1.3-contributor-free");
    expect(decision.trace.actionId).toBe("share");
    expect(decision.trace.observation).toBe("Motorens observasjon");
    expect(decision.usage).toMatchObject({
      inputTokens: 120,
      outputTokens: 45,
      requestCount: 1,
      totalTokens: 165,
    });
    expect(decision.finishReason).toBe("stop");
  });

  it("støtter generateText via /responses med usage", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith("/models")) {
        return jsonResponse({ data: [{ id: "muse-spark-1.3-contributor-free" }] });
      }
      return jsonResponse(responsesBody("Hei fra Muse.", "muse-spark-1.3-contributor-free"));
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });
    const result = await provider.generateText?.({
      modelId: "muse-spark-1.3-contributor-free",
      prompt: "Si hei.",
      system: "Du er hjelpsom.",
    });
    expect(result).toMatchObject({
      content: "Hei fra Muse.",
      usage: { inputTokens: 120, outputTokens: 45, totalTokens: 165 },
    });
  });

  it("beholder Nemotron chat-modeller på chat-completions med kapabiliteter", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ data: [{ id: "nvidia/nemotron-3.5-lightning-30b-a3b" }] }),
    );
    const provider = createNvidiaNimProvider({
      confirmedFreeModelIds: new Set(["nvidia/nemotron-3.5-lightning-30b-a3b"]),
      fetcher,
    });
    const models = await provider.listModels();
    expect(models[0]).toMatchObject({
      endpointFamily: "chat-completions",
      freeClassification: "confirmed-free",
      supportsStructuredOutput: true,
      supportsTools: true,
    });
  });
});
