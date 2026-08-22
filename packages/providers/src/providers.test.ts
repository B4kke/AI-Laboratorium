import { describe, expect, it, vi } from "vitest";

import { MockProvider } from "./mock";
import { createNvidiaNimProvider } from "./nvidia";
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
});

describe("beslutningsproveniens", () => {
  it("beholder motorens observasjon fremfor modellens påstand", () => {
    const request = {
      actorName: "Astra",
      allowedActions: [
        { description: "Del", id: "share", label: "Del" },
        { description: "Behold", id: "hoard", label: "Behold" },
      ],
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
