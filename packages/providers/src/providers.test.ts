import { describe, expect, it, vi } from "vitest";

import { MockProvider } from "./mock";
import { createNvidiaNimProvider } from "./nvidia";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { parseDecisionTrace } from "./utils";
import { createOpenCodeZenProvider } from "./zen";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("providerpolicy", () => {
  it("klassifiserer bare eksplisitt merkede Zen-modeller som gratis", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "deepseek-v4-flash" },
          { id: "deepseek-v4-flash-free" },
        ],
        object: "list",
      }),
    );
    const provider = createOpenCodeZenProvider({ fetcher });
    const models = await provider.listModels();

    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "deepseek-v4-flash", freeClassification: "unknown" }),
        expect.objectContaining({
          id: "deepseek-v4-flash-free",
          freeClassification: "confirmed-free",
        }),
      ]),
    );
    await expect(provider.captureSnapshot("deepseek-v4-flash")).rejects.toThrow(/ikke eksplisitt/);
  });

  it("bruker samme gratispolicy for fritekstgenerering", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (request) => {
      const url = request.toString();
      if (url.endsWith("/models")) {
        return jsonResponse({ data: [{ id: "designer-free" }], object: "list" });
      }
      return jsonResponse({
        choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
        model: "designer-free",
      });
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });
    await expect(
      provider.generateText?.({
        modelId: "designer-free",
        prompt: "Lag arena",
        system: "Returner JSON",
      }),
    ).resolves.toMatchObject({ content: "{\"ok\":true}" });
    const generationBody = JSON.parse(
      String((fetcher.mock.calls.at(-1)?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;
    expect(generationBody).not.toHaveProperty("max_tokens");
  });

  it("krever runtime-bekreftelse før NIM brukes i free-only-modus", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse({ data: [{ id: "nvidia/nemotron-test" }], object: "list" }),
      );
    const blocked = createNvidiaNimProvider({ fetcher });
    await expect(blocked.captureSnapshot("nvidia/nemotron-test")).rejects.toThrow(/ikke eksplisitt/);

    const allowed = createNvidiaNimProvider({
      confirmedFreeModelIds: new Set(["nvidia/nemotron-test"]),
      fetcher,
    });
    await expect(allowed.captureSnapshot("nvidia/nemotron-test")).resolves.toMatchObject({
      freeClassification: "confirmed-free",
    });
  });

  it("fjerner utdaterte NIM-modellfamilier fra katalogen", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "deepseek-r1" },
          { id: "nvidia/nemotron-test" },
          { id: "qwen3-coder-480b" },
        ],
        object: "list",
      }),
    );
    const provider = createNvidiaNimProvider({ fetcher });
    const models = await provider.listModels();

    expect(models.map(({ id }) => id)).toEqual(["nvidia/nemotron-test"]);
  });

  it("halverer max_tokens og prøver igjen når provideren avviser token-grensen", async () => {
    const requestedTokens: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (request, init) => {
      if (request.toString().endsWith("/models")) {
        return jsonResponse({ data: [{ id: "liten-free" }], object: "list" });
      }
      const parsed = JSON.parse(String(init?.body)) as { max_tokens: number };
      requestedTokens.push(parsed.max_tokens);
      if (parsed.max_tokens > 512) {
        return new Response(
          JSON.stringify({ error: { message: "This model supports up to 512 max_tokens." } }),
          { status: 400 },
        );
      }
      return jsonResponse({
        choices: [{ finish_reason: "stop", message: { content: "ok" } }],
        model: "liten-free",
      });
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });

    await expect(
      provider.generateText?.({
        maxTokens: 800,
        modelId: "liten-free",
        prompt: "Svar kort.",
        system: "System",
      }),
    ).resolves.toMatchObject({ content: "ok" });
    expect(requestedTokens).toEqual([800, 400]);
  });

  it("viser providerens feiltekst når en ikke-retrybar HTTP-feil oppstår", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (request) => {
      if (request.toString().endsWith("/models")) {
        return jsonResponse({ data: [{ id: "designer-free" }], object: "list" });
      }
      return new Response(
        JSON.stringify({ error: { message: "Ugyldig temperatur for denne modellen" } }),
        { status: 422 },
      );
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });

    await expect(
      provider.generateText?.({
        modelId: "designer-free",
        prompt: "Lag arena",
        system: "Returner JSON",
      }),
    ).rejects.toThrow(/HTTP 422.*Ugyldig temperatur/s);
  });

  it("dobler max_tokens når svaret blir avskåret på token-grensen", async () => {
    const requestedTokens: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (request, init) => {
      if (request.toString().endsWith("/models")) {
        return jsonResponse({ data: [{ id: "pratsom-free" }], object: "list" });
      }
      const parsed = JSON.parse(String(init?.body)) as { max_tokens: number };
      requestedTokens.push(parsed.max_tokens);
      const finish = parsed.max_tokens >= 6_000 ? "stop" : "length";
      const content =
        finish === "stop"
          ? JSON.stringify({
              actionId: "a",
              confidence: 0.8,
              goal: "vinne",
              message: "Jeg velger.",
              observation: "obs",
              rationale: "klar",
            })
          : "{\"actionId\":\"a\",\"message\":\"Viser du ti";
      return jsonResponse({
        choices: [{ finish_reason: finish, message: { content } }],
        model: "pratsom-free",
      });
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });

    await expect(
      provider.generateDecision?.({
        actorName: "Nova",
        allowedActions: [{ description: "d", id: "a", label: "l" }],
        conversationHistory: [],
        modelId: "pratsom-free",
        observation: "obs",
        prompt: "Velg",
        round: 1,
        seed: "s",
        strategy: "adaptive",
      }),
    ).resolves.toMatchObject({ finishReason: "stop" });
    expect(requestedTokens).toEqual([3_000, 6_000]);
  });

  it("kaster tydelig feil når svaret forblir avskåret ved maksimalt budsjett", async () => {
    const requestedTokens: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (request, init) => {
      if (request.toString().endsWith("/models")) {
        return jsonResponse({ data: [{ id: "endeløs-free" }], object: "list" });
      }
      const parsed = JSON.parse(String(init?.body)) as { max_tokens: number };
      requestedTokens.push(parsed.max_tokens);
      return jsonResponse({
        choices: [{ finish_reason: "length", message: { content: "{\"actionId\":\"a" } }],
        model: "endeløs-free",
      });
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });

    await expect(
      provider.generateDecision?.({
        actorName: "Nova",
        allowedActions: [{ description: "d", id: "a", label: "l" }],
        conversationHistory: [],
        modelId: "endeløs-free",
        observation: "obs",
        prompt: "Velg",
        round: 1,
        seed: "s",
        strategy: "adaptive",
      }),
    ).rejects.toThrow(/avkortet/);
    expect(requestedTokens.at(-1)).toBe(8_192);
  });

  it("blokkerer redirects ved providergrensen", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: [{ id: "sikker-free" }] }));
    const provider = createOpenCodeZenProvider({ fetcher });
    await provider.listModels();
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("avviser et providersvar før en oppgitt bytegrense overskrides", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        headers: { "Content-Length": "600000", "Content-Type": "application/json" },
      }),
    );
    const provider = createOpenCodeZenProvider({ fetcher });
    await expect(provider.listModels()).rejects.toThrow(/for stort/);
  });

  it("lar én total timeout dekke en body som aldri fullfører", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // Bevisst åpen strøm simulerer en provider som bare sender 200-headere.
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = createOpenCodeZenProvider({ fetcher, requestTimeoutMs: 20 });
    await expect(provider.listModels()).rejects.toThrow(/tidsavbrudd/);
  });

  it("samler samtidige katalogoppdateringer i ett upstream-kall", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse({ data: [{ id: "samlet-free" }] });
    });
    const provider = createOpenCodeZenProvider({ fetcher });
    const [first, second] = await Promise.all([provider.listModels(), provider.listModels()]);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("avviser modellidentitet som avviker fra den validerte snapshoten", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (request) =>
      request.toString().endsWith("/models")
        ? jsonResponse({ data: [{ id: "designer-free" }] })
        : jsonResponse({
            choices: [{ finish_reason: "stop", message: { content: "{}" } }],
            model: "annen-free",
          }),
    );
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });
    await expect(
      provider.generateText?.({ modelId: "designer-free", prompt: "Lag", system: "JSON" }),
    ).rejects.toThrow(/annen modell/);
  });

  it("prøver midlertidige providerfeil på nytt med eksponentiell jitter", async () => {
    const delays: number[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "retry-free" }] }));
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://provider.example/v1",
      fetcher,
      id: "opencode-zen",
      modelClassifier: () => "confirmed-free",
      policy: { freeOnly: true },
      random: () => 0.5,
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    });

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({ id: "retry-free" }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([62, 125]);
  });
});

describe("beslutningsproveniens", () => {
  it("beholder motorens observasjon fremfor modellens påstand", () => {
    const request = {
      actorName: "Astra",
      allowedActions: [
        { description: "Del", id: "share", label: "Del" },
        { description: "Behold", id: "hoard", label: "Behold" },
      ],
      conversationHistory: [],
      modelId: "scripted-adaptive",
      observation: "Motorens faktiske observasjon",
      prompt: "Velg",
      round: 1,
      seed: "proveniens",
      strategy: "adaptive" as const,
    };
    const trace = parseDecisionTrace(
      JSON.stringify({
        actionId: "share",
        confidence: 0.8,
        goal: "Samarbeid",
        message: "Jeg deler.",
        observation: "Modellens falske observasjon",
        rationale: "Gjensidig gevinst.",
      }),
      request,
    );
    expect(trace.observation).toBe(request.observation);
  });

  it("ber samme ekte modell reparere ugyldig beslutnings-JSON uten fabrikkert fallback", async () => {
    let completionCalls = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (request) => {
      if (request.toString().endsWith("/models")) {
        return jsonResponse({ data: [{ id: "repair-free" }] });
      }
      completionCalls += 1;
      return jsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content:
                completionCalls === 1
                  ? "dette er ikke json"
                  : JSON.stringify({
                      actionId: "share",
                      confidence: 0.77,
                      goal: "Bygg etterprøvbar tillit.",
                      message: "Jeg deler fordi avtalen kan kontrolleres.",
                      observation: "modellpåstand",
                      rationale: "Deling gir et testbart samarbeidssignal.",
                    }),
            },
          },
        ],
        model: "repair-free",
        usage: { completion_tokens: 10, prompt_tokens: 20, total_tokens: 30 },
      });
    });
    const provider = createOpenCodeZenProvider({ apiKey: "test", fetcher });
    const decision = await provider.generateDecision({
      actorName: "Agent 382",
      allowedActions: [
        { description: "Del", id: "share", label: "Del" },
        { description: "Behold", id: "hoard", label: "Behold" },
      ],
      conversationHistory: [],
      modelId: "repair-free",
      observation: "Motorens observasjon",
      prompt: "Velg én handling.",
      round: 1,
      seed: "repair",
      strategy: "adaptive",
    });

    expect(completionCalls).toBe(2);
    expect(decision.trace.message).toContain("Jeg deler");
    expect(decision.trace.observation).toBe("Motorens observasjon");
    expect(decision.usage).toMatchObject({ requestCount: 2, totalTokens: 60 });
    const secondBody = JSON.parse(
      String((fetcher.mock.calls.at(-1)?.[1] as RequestInit | undefined)?.body),
    ) as { messages: Array<{ content: string }> };
    expect(secondBody.messages.at(-1)?.content).toContain("korrigerte JSON-objektet");
  });
});

describe("MockProvider", () => {
  it("gir samme handling for samme seed og observasjon", async () => {
    const provider = new MockProvider();
    const request = {
      actorName: "Astra",
      allowedActions: [
        { description: "Del", id: "share", label: "Del" },
        { description: "Behold", id: "hoard", label: "Behold" },
      ],
      conversationHistory: [],
      modelId: "scripted-unpredictable",
      observation: "Runde 1, stillingen er 0–0.",
      prompt: "Velg handling.",
      round: 1,
      seed: "fast-seed",
      strategy: "unpredictable" as const,
    };

    const first = await provider.generateDecision(request);
    const second = await provider.generateDecision(request);
    expect(first.trace).toEqual(second.trace);
  });
});
