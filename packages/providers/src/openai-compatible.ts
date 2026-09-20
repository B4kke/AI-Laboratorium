import {
  ProviderSnapshotSchema,
  type ProviderSnapshot,
} from "@ai-lab/domain";
import {
  createOpenAICompatible,
  type OpenAICompatibleProvider as AiSdkOpenAICompatibleProvider,
} from "@ai-sdk/openai-compatible";
import { APICallError, generateText as generateSdkText } from "ai";
import { z } from "zod";

import { ProviderError } from "./errors";
import type {
  DecisionRequest,
  DecisionResult,
  FreeClassification,
  ModelDescriptor,
  ModelProvider,
  ProviderHealth,
  ProviderId,
  ProviderPolicy,
  TextGenerationRequest,
  TextGenerationResult,
} from "./types";
import { assertFreePolicy, parseDecisionTrace, providerSnapshotId } from "./utils";

const ModelsResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(200),
          })
          .passthrough(),
      )
      .max(1_000),
  })
  .passthrough();

export type OpenAICompatibleProviderOptions = {
  apiKey?: string;
  baseUrl: string;
  confirmedFreeModelIds?: ReadonlySet<string>;
  fetcher?: typeof fetch;
  id: Extract<ProviderId, "nvidia-nim" | "opencode-zen">;
  modelClassifier?: (id: string) => FreeClassification;
  modelFilter?: (modelId: string) => boolean;
  policy: ProviderPolicy;
  random?: () => number;
  requestTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const modelResponseLimitBytes = 512_000;
const completionResponseLimitBytes = 128_000;

async function readWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadline: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new ProviderError("timeout", "Providerforespørselen fikk tidsavbrudd", {
      retryable: true,
    });
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new ProviderError("timeout", "Providerforespørselen fikk tidsavbrudd", {
                retryable: true,
              }),
            ),
          remainingMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function readBoundedJsonResponse(
  response: Response,
  maxBytes: number,
  deadline: number,
): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel("Providersvaret er for stort");
      throw new ProviderError("invalid-response", "Providersvaret er for stort");
    }
  }

  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new ProviderError("invalid-response", "Provideren returnerte en tom respons");
  }
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await readWithDeadline(reader, deadline);
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel("Providersvaret er for stort");
        throw new ProviderError("invalid-response", "Providersvaret er for stort");
      }
      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel("Providerresponsen ble avbrutt");
    } catch {
      // Den opprinnelige feilen er mer presis enn en sekundær cancel-feil.
    }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // En allerede kansellert strøm kan ha frigitt låsen.
    }
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderError("invalid-response", "Provideren returnerte ugyldig JSON", {
      cause: error,
    });
  }
}

async function readBoundedErrorBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    const sanitized = text.replace(/\s+/g, " ").trim();
    return sanitized.length === 0 ? undefined : sanitized.slice(0, 300);
  } catch {
    return undefined;
  }
}

function sanitizeErrorDetail(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const sanitized = value.replace(/\s+/g, " ").trim();
  return sanitized.length === 0 ? undefined : sanitized.slice(0, 300);
}

function apiErrorDetail(error: APICallError): string | undefined {
  const data = error.data;
  if (typeof data === "object" && data !== null && "error" in data) {
    const nested = data.error;
    if (typeof nested === "object" && nested !== null && "message" in nested) {
      const message = nested.message;
      if (typeof message === "string") return sanitizeErrorDetail(message);
    }
  }
  return sanitizeErrorDetail(error.message);
}

type SdkCompletion = {
  finishReason: string;
  modelId: string;
  text: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: OpenAICompatibleProviderOptions["id"];
  readonly #apiKey: string | undefined;
  readonly #baseUrl: string;
  readonly #origin: string;
  readonly #sdkProvider: AiSdkOpenAICompatibleProvider<string, string, string, string>;
  readonly #confirmedFreeModelIds: ReadonlySet<string>;
  readonly #fetcher: typeof fetch;
  readonly #modelClassifier: ((id: string) => FreeClassification) | undefined;
  readonly #modelFilter: ((modelId: string) => boolean) | undefined;
  readonly #policy: ProviderPolicy;
  readonly #random: () => number;
  readonly #requestTimeoutMs: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #consecutiveFailures = 0;
  #circuitOpenUntil = 0;
  #modelCache: { expiresAt: number; models: readonly ModelDescriptor[] } | undefined;
  #modelFailure: { error: unknown; retryAt: number } | undefined;
  #modelRefresh: Promise<readonly ModelDescriptor[]> | undefined;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.id;
    this.#apiKey = options.apiKey;
    const baseUrl = new URL(options.baseUrl);
    if (baseUrl.protocol !== "https:") throw new Error("Provider-origin må bruke HTTPS");
    this.#baseUrl = baseUrl.toString().replace(/\/$/, "");
    this.#origin = baseUrl.origin;
    this.#confirmedFreeModelIds = options.confirmedFreeModelIds ?? new Set();
    this.#fetcher = options.fetcher ?? fetch;
    this.#modelClassifier = options.modelClassifier;
    this.#modelFilter = options.modelFilter;
    this.#policy = options.policy;
    this.#random = options.random ?? Math.random;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 45_000;
    this.#sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#sdkProvider = createOpenAICompatible({
      ...(this.#apiKey === undefined ? {} : { apiKey: this.#apiKey }),
      baseURL: this.#baseUrl,
      fetch: (input, init) => this.#sdkFetch(input, init),
      name: this.id,
      supportsStructuredOutputs: false,
    });
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    if (this.#modelCache !== undefined && this.#modelCache.expiresAt > Date.now()) {
      return this.#modelCache.models;
    }
    if (this.#modelRefresh !== undefined) return this.#modelRefresh;
    if (this.#modelFailure !== undefined && this.#modelFailure.retryAt > Date.now()) {
      throw this.#modelFailure.error;
    }

    const staleCache = this.#modelCache;
    const refresh = (async () => {
      try {
        const body = await this.#requestJson(
          "/models",
          { method: "GET" },
          ModelsResponseSchema,
          modelResponseLimitBytes,
          false,
        );
        const models = body.data
          .filter(({ id }) => this.#modelFilter?.(id) ?? true)
          .map(({ id }) => ({
            displayName: id,
            endpointFamily: "chat-completions" as const,
            freeClassification: this.#classifyModel(id),
            id,
            providerId: this.id,
            supportsStructuredOutput: false,
            supportsTools: false,
          }));
        this.#modelCache = { expiresAt: Date.now() + 5 * 60_000, models };
        this.#modelFailure = undefined;
        return models;
      } catch (error) {
        this.#modelFailure = { error, retryAt: Date.now() + 10_000 };
        if (staleCache !== undefined) return staleCache.models;
        throw error;
      } finally {
        this.#modelRefresh = undefined;
      }
    })();
    this.#modelRefresh = refresh;
    return refresh;
  }

  async captureSnapshot(modelId: string): Promise<ProviderSnapshot> {
    const model = await this.#findModel(modelId);
    assertFreePolicy(model, this.#policy.freeOnly);
    return ProviderSnapshotSchema.parse({
      capturedAt: new Date().toISOString(),
      endpointFamily: model.endpointFamily,
      freeClassification: model.freeClassification,
      id: providerSnapshotId(this.id, model.id),
      modelId: model.id,
      providerId: this.id,
      supportsStructuredOutput: model.supportsStructuredOutput,
      supportsTools: model.supportsTools,
    });
  }

  async #chatCompletion(init: {
    defaultMaxTokens?: number | undefined;
    messages: ReadonlyArray<{ content: string; role: "assistant" | "system" | "user" }>;
    modelId: string;
    onAttempt?: () => void;
    requestedMaxTokens?: number | undefined;
    signal?: AbortSignal | undefined;
    temperature?: number | undefined;
  }): Promise<SdkCompletion> {
    const initialMaxTokens = init.requestedMaxTokens ?? init.defaultMaxTokens;
    let maxTokens =
      initialMaxTokens === undefined
        ? undefined
        : Math.max(64, Math.min(8_192, initialMaxTokens));
    for (;;) {
      let response: SdkCompletion;
      try {
        response = await this.#generateSdkCompletion({
          maxTokens,
          messages: init.messages,
          modelId: init.modelId,
          ...(init.onAttempt === undefined ? {} : { onAttempt: init.onAttempt }),
          ...(init.signal === undefined ? {} : { signal: init.signal }),
          ...(init.temperature === undefined ? {} : { temperature: init.temperature }),
        });
      } catch (error) {
        const tokenLimitRejection =
          error instanceof ProviderError &&
          error.status === 400 &&
          /max[_ ]?tokens|maximum context|context length/i.test(error.message);
        if (!tokenLimitRejection || (maxTokens ?? 0) <= 512) throw error;
        maxTokens = Math.floor((maxTokens ?? 1024) / 2);
        continue;
      }
      if (response.finishReason !== "length" || (maxTokens ?? 0) >= 8_192) return response;
      maxTokens = Math.min(8_192, (maxTokens ?? 1024) * 2);
    }
  }

  async #generateSdkCompletion(init: {
    maxTokens: number | undefined;
    messages: ReadonlyArray<{ content: string; role: "assistant" | "system" | "user" }>;
    modelId: string;
    onAttempt?: () => void;
    signal?: AbortSignal;
    temperature?: number;
  }): Promise<SdkCompletion> {
    let lastError: ProviderError | undefined;
    const deadline = Date.now() + this.#requestTimeoutMs;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        lastError = new ProviderError("timeout", "Providerforespørselen fikk tidsavbrudd", {
          retryable: true,
        });
        break;
      }
      init.onAttempt?.();
      try {
        const result = await generateSdkText({
          allowSystemInMessages: true,
          ...(init.signal === undefined ? {} : { abortSignal: init.signal }),
          ...(init.maxTokens === undefined ? {} : { maxOutputTokens: init.maxTokens }),
          maxRetries: 0,
          messages: init.messages.map(({ content, role }) => ({ content, role })),
          model: this.#sdkProvider.chatModel(init.modelId),
          ...(init.temperature === undefined ? {} : { temperature: init.temperature }),
          timeout: remainingMs,
        });
        this.#consecutiveFailures = 0;
        return {
          finishReason: result.rawFinishReason ?? result.finishReason,
          modelId: result.response.modelId,
          text: result.text,
          usage: {
            ...(result.usage.inputTokens === undefined
              ? {}
              : { inputTokens: result.usage.inputTokens }),
            ...(result.usage.outputTokens === undefined
              ? {}
              : { outputTokens: result.usage.outputTokens }),
            ...(result.usage.totalTokens === undefined
              ? {}
              : { totalTokens: result.usage.totalTokens }),
          },
        };
      } catch (error) {
        lastError = this.#normalizeSdkError(error, init.signal);
        if (!lastError.retryable) {
          this.#recordFailure();
          throw lastError;
        }
      }

      if (attempt < 2) {
        const baseBackoffMs = 50 * 2 ** attempt;
        const jitterMs = Math.floor(baseBackoffMs * 0.5 * this.#random());
        const backoffMs = Math.min(
          baseBackoffMs + jitterMs,
          Math.max(0, deadline - Date.now()),
        );
        if (backoffMs > 0) await this.#sleep(backoffMs);
      }
    }

    this.#recordFailure();
    throw lastError ?? new ProviderError("request-failed", "Providerforespørselen feilet", {
      retryable: true,
    });
  }

  async generateDecision(request: DecisionRequest): Promise<DecisionResult> {
    if (this.#apiKey === undefined || this.#apiKey.length === 0) {
      throw new ProviderError("not-configured", `${this.id} mangler API-nøkkel`);
    }
    const model = await this.#findModel(request.modelId);
    assertFreePolicy(model, this.#policy.freeOnly);

    const startedAt = performance.now();
    const system =
      "Du er en arena-agent som spiller i egen karakter. Svar alltid som agenten selv, i førsteperson. Reager konkret på motpartens faktiske melding og la ordvalg, mål og handling følge din SOUL.md, ditt minne og situasjonen. Vær konkret og personlig, aldri generisk, og begrens meldingen til maks to setninger. Returner BARE ett JSON-objekt med feltene actionId, message, observation, goal, rationale, confidence og valgfritt memoryWrite {category, content}. Returner aldri privat tankerekke eller tekst utenfor objektet.";
    let repairMessages: Array<{ content: string; role: "assistant" | "user" }> = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let requestCount = 0;
    let lastError: unknown;
    for (let semanticAttempt = 0; semanticAttempt < 3; semanticAttempt += 1) {
      const body = await this.#chatCompletion({
        defaultMaxTokens: 3_000,
        messages: [
          { content: system, role: "system" },
          { content: request.prompt, role: "user" },
          ...repairMessages,
        ],
        modelId: request.modelId,
        onAttempt: () => {
          requestCount += 1;
        },
        signal: request.signal,
        temperature: semanticAttempt === 0 ? 0.2 : 0,
      });
      this.#assertModelIdentity(body.modelId, request.modelId);
      if (body.finishReason === "length") {
        throw new ProviderError(
          "invalid-response",
          "Provideren avkortet beslutningen midt i svaret selv ved maksimal token-budsjett",
        );
      }
      inputTokens += body.usage.inputTokens ?? 0;
      outputTokens += body.usage.outputTokens ?? 0;
      totalTokens += body.usage.totalTokens ?? 0;
      try {
        return {
          finishReason: body.finishReason,
          latencyMs: performance.now() - startedAt,
          modelId: request.modelId,
          providerId: this.id,
          trace: parseDecisionTrace(body.text, request),
          usage: { inputTokens, outputTokens, requestCount, totalTokens },
        };
      } catch (error) {
        lastError = error;
        repairMessages = [
          { content: body.text.slice(0, 4_000), role: "assistant" },
          {
            content:
              "Svaret var ikke gyldig etter det avtalte JSON-skjemaet eller valgte en ulovlig handling. Returner hele det korrigerte JSON-objektet, med én lovlig actionId, og ingenting annet.",
            role: "user",
          },
        ];
      }
    }
    throw new Error(
      "Kunne ikke generere gyldig beslutning etter tre forsøk",
      { cause: lastError },
    );
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (this.#apiKey === undefined || this.#apiKey.length === 0) {
      throw new ProviderError("not-configured", `${this.id} mangler API-nøkkel`);
    }
    const model = await this.#findModel(request.modelId);
    assertFreePolicy(model, this.#policy.freeOnly);
    const startedAt = performance.now();
    const body = await this.#chatCompletion({
      messages: [
        { content: request.system, role: "system" },
        { content: request.prompt, role: "user" },
      ],
      modelId: request.modelId,
      requestedMaxTokens: request.maxTokens,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      temperature: request.temperature ?? 0.15,
    });
    this.#assertModelIdentity(body.modelId, request.modelId);
    return {
      content: body.text,
      finishReason: body.finishReason,
      latencyMs: performance.now() - startedAt,
      modelId: request.modelId,
      providerId: this.id,
      usage: {
        ...(body.usage.inputTokens === undefined
          ? {}
          : { inputTokens: body.usage.inputTokens }),
        ...(body.usage.outputTokens === undefined
          ? {}
          : { outputTokens: body.usage.outputTokens }),
        requestCount: 1,
        ...(body.usage.totalTokens === undefined ? {} : { totalTokens: body.usage.totalTokens }),
      },
    };
  }

  async health(): Promise<ProviderHealth> {
    if (this.#apiKey === undefined || this.#apiKey.length === 0) {
      return { message: "API-nøkkel er ikke konfigurert", status: "not-configured" };
    }
    try {
      const models = await this.listModels();
      return {
        message: `${models.length} modeller oppdaget`,
        status: models.length > 0 ? "available" : "degraded",
      };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : "Ukjent providerfeil",
        status: "unavailable",
      };
    }
  }

  #classifyModel(id: string): FreeClassification {
    if (this.#confirmedFreeModelIds.has(id)) {
      return "confirmed-free";
    }
    return this.#modelClassifier?.(id) ?? "unknown";
  }

  #recordFailure() {
    this.#consecutiveFailures += 1;
    if (this.#consecutiveFailures >= 3) this.#circuitOpenUntil = Date.now() + 60_000;
  }

  #assertModelIdentity(actual: string | undefined, expected: string) {
    if (actual === undefined || actual === expected) return;
    this.#recordFailure();
    throw new ProviderError(
      "invalid-response",
      "Provideren returnerte en annen modell enn den validerte snapshoten",
    );
  }

  async #findModel(modelId: string) {
    const model = (await this.listModels()).find(({ id }) => id === modelId);
    if (model === undefined) {
      throw new ProviderError("request-failed", `Modellen ${modelId} finnes ikke i dagens katalog`);
    }
    return model;
  }

  #normalizeSdkError(error: unknown, externalSignal: AbortSignal | undefined): ProviderError {
    if (externalSignal?.aborted === true) {
      return new ProviderError("cancelled", "Providerforespørselen ble avbrutt", { cause: error });
    }
    if (error instanceof ProviderError) return error;
    if (error instanceof Error && error.cause instanceof ProviderError) return error.cause;
    if (APICallError.isInstance(error)) {
      const status = error.statusCode;
      const detail = apiErrorDetail(error);
      const retryable = error.isRetryable || status === 429 || (status !== undefined && status >= 500);
      return new ProviderError(
        status === 429 ? "rate-limited" : "request-failed",
        status === undefined
          ? `Providerforespørselen feilet${detail === undefined ? "" : `: ${detail}`}`
          : `Provideren svarte HTTP ${status}${detail === undefined ? "" : `: ${detail}`}`,
        {
          cause: error,
          retryable,
          ...(status === undefined ? {} : { status }),
        },
      );
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return new ProviderError("timeout", "Providerforespørselen fikk tidsavbrudd", {
        cause: error,
        retryable: true,
      });
    }
    return new ProviderError("request-failed", "Providerforespørselen feilet", {
      cause: error,
      retryable: true,
    });
  }

  async #sdkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this.#circuitOpenUntil > Date.now()) {
      throw new ProviderError("circuit-open", "Providerkretsen er midlertidig åpen", {
        retryable: true,
      });
    }
    if (this.#apiKey === undefined || this.#apiKey.length === 0) {
      throw new ProviderError("not-configured", `${this.id} mangler API-nøkkel`);
    }

    const requestUrl = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (
      requestUrl.origin !== this.#origin ||
      !requestUrl.pathname.startsWith(`${new URL(this.#baseUrl).pathname}/`)
    ) {
      throw new ProviderError("invalid-response", "AI SDK forsøkte en uventet provider-URL");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
    const upstreamSignal = init?.signal ?? undefined;
    const signal =
      upstreamSignal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, upstreamSignal]);
    const deadline = Date.now() + this.#requestTimeoutMs;
    try {
      const response = await this.#fetcher(input, {
        ...init,
        redirect: "error",
        signal,
      });
      if (response.url.length > 0 && new URL(response.url).origin !== this.#origin) {
        await response.body?.cancel("Uventet provider-origin");
        throw new ProviderError("invalid-response", "Provideren svarte fra en uventet origin");
      }

      const body = await readBoundedJsonResponse(
        response,
        completionResponseLimitBytes,
        deadline,
      );
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(JSON.stringify(body), {
        headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      if (upstreamSignal?.aborted === true) {
        throw new ProviderError("cancelled", "Providerforespørselen ble avbrutt", {
          cause: error,
        });
      }
      if (controller.signal.aborted) {
        throw new ProviderError("timeout", "Providerforespørselen fikk tidsavbrudd", {
          cause: error,
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #requestJson<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    maxResponseBytes: number,
    requireKey = true,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    if (this.#circuitOpenUntil > Date.now()) {
      throw new ProviderError("circuit-open", "Providerkretsen er midlertidig åpen", {
        retryable: true,
      });
    }
    if (requireKey && (this.#apiKey === undefined || this.#apiKey.length === 0)) {
      throw new ProviderError("not-configured", `${this.id} mangler API-nøkkel`);
    }

    let lastError: unknown;
    const deadline = Date.now() + this.#requestTimeoutMs;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        lastError = new ProviderError("timeout", "Providerforespørselen fikk tidsavbrudd", {
          retryable: true,
        });
        break;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), remainingMs);
      const signal =
        externalSignal === undefined
          ? controller.signal
          : AbortSignal.any([controller.signal, externalSignal]);
      try {
        const response = await this.#fetcher(`${this.#baseUrl}${path}`, {
          ...init,
          headers: {
            ...(this.#apiKey === undefined ? {} : { Authorization: `Bearer ${this.#apiKey}` }),
            ...init.headers,
          },
          redirect: "error",
          signal,
        });
        if (response.url.length > 0 && new URL(response.url).origin !== this.#origin) {
          await response.body?.cancel("Uventet provider-origin");
          throw new ProviderError("invalid-response", "Provideren svarte fra en uventet origin");
        }
        if (response.ok) {
          const parsed = schema.safeParse(
            await readBoundedJsonResponse(response, maxResponseBytes, deadline),
          );
          if (!parsed.success) {
            throw new ProviderError("invalid-response", "Provideren returnerte ugyldige data", {
              cause: parsed.error,
            });
          }
          this.#consecutiveFailures = 0;
          return parsed.data;
        }
        const detail = await readBoundedErrorBody(response);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          throw new ProviderError(
            "request-failed",
            `Provideren svarte HTTP ${response.status}${detail === undefined ? "" : `: ${detail}`}`,
            { status: response.status },
          );
        }
        lastError = new ProviderError(
          response.status === 429 ? "rate-limited" : "request-failed",
          `Midlertidig providerfeil: HTTP ${response.status}`,
          { retryable: true, status: response.status },
        );
      } catch (error) {
        if (error instanceof ProviderError && !error.retryable) {
          this.#recordFailure();
          throw error;
        }
        lastError =
          error instanceof DOMException && error.name === "AbortError"
            ? new ProviderError("timeout", "Providerforespørselen fikk tidsavbrudd", {
                cause: error,
                retryable: true,
              })
            : error;
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < 2) {
        const baseBackoffMs = 50 * 2 ** attempt;
        const jitterMs = Math.floor(baseBackoffMs * 0.5 * this.#random());
        const backoffMs = Math.min(
          baseBackoffMs + jitterMs,
          Math.max(0, deadline - Date.now()),
        );
        if (backoffMs > 0) await this.#sleep(backoffMs);
      }
    }

    this.#recordFailure();
    throw lastError instanceof ProviderError
      ? lastError
      : new ProviderError("request-failed", "Providerforespørselen feilet", {
          cause: lastError,
          retryable: true,
        });
  }
}
