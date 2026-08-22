import {
  ProviderSnapshotSchema,
  type ProviderSnapshot,
} from "@ai-lab/domain";
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

const ChatCompletionSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().max(100).nullable().optional(),
            message: z
              .object({
                content: z.string().max(50_000),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1)
      .max(8),
    model: z.string().trim().min(1).max(200).optional(),
    usage: z
      .object({
        completion_tokens: z.number().int().nonnegative().max(10_000_000).optional(),
        prompt_tokens: z.number().int().nonnegative().max(10_000_000).optional(),
        total_tokens: z.number().int().nonnegative().max(10_000_000).optional(),
      })
      .passthrough()
      .optional(),
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
  requestTimeoutMs?: number;
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

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: OpenAICompatibleProviderOptions["id"];
  readonly #apiKey: string | undefined;
  readonly #baseUrl: string;
  readonly #origin: string;
  readonly #confirmedFreeModelIds: ReadonlySet<string>;
  readonly #fetcher: typeof fetch;
  readonly #modelClassifier: ((id: string) => FreeClassification) | undefined;
  readonly #modelFilter: ((modelId: string) => boolean) | undefined;
  readonly #policy: ProviderPolicy;
  readonly #requestTimeoutMs: number;
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
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 45_000;
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

  async generateDecision(request: DecisionRequest): Promise<DecisionResult> {
    if (this.#apiKey === undefined || this.#apiKey.length === 0) {
      throw new ProviderError("not-configured", `${this.id} mangler API-nøkkel`);
    }
    const model = await this.#findModel(request.modelId);
    assertFreePolicy(model, this.#policy.freeOnly);

    const startedAt = performance.now();
    const body = await this.#requestJson(
      "/chat/completions",
      {
        body: JSON.stringify({
          max_tokens: 1_500,
          messages: [
            {
              content:
                "Du er en arena-agent som spiller i egen karakter. Svar alltid som agenten selv, i førsteperson: la meldingen og begrunnelsen gjenspeile agentens navn, sjel, strategi og situasjonen i observasjonen. Vær konkret og personlig, aldri generisk. Returner likevel BARE ett JSON-objekt med feltene actionId, message, observation, goal, rationale og confidence — ingen tankerekke, forklaring eller tekst utenfor objektet.",
              role: "system",
            },
            { content: request.prompt, role: "user" },
          ],
          model: request.modelId,
          stream: false,
          temperature: 0.2,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      ChatCompletionSchema,
      completionResponseLimitBytes,
    );
    this.#assertModelIdentity(body.model, request.modelId);
    const firstChoice = body.choices[0];
    if (firstChoice === undefined) {
      throw new ProviderError("invalid-response", "Provideren returnerte ingen valg");
    }

    return {
      finishReason: firstChoice.finish_reason ?? "unknown",
      latencyMs: performance.now() - startedAt,
      modelId: request.modelId,
      providerId: this.id,
      trace: parseDecisionTrace(firstChoice.message.content, request),
      usage: {
        ...(body.usage?.prompt_tokens === undefined
          ? {}
          : { inputTokens: body.usage.prompt_tokens }),
        ...(body.usage?.completion_tokens === undefined
          ? {}
          : { outputTokens: body.usage.completion_tokens }),
        ...(body.usage?.total_tokens === undefined ? {} : { totalTokens: body.usage.total_tokens }),
      },
    };
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    if (this.#apiKey === undefined || this.#apiKey.length === 0) {
      throw new ProviderError("not-configured", `${this.id} mangler API-nøkkel`);
    }
    const model = await this.#findModel(request.modelId);
    assertFreePolicy(model, this.#policy.freeOnly);
    const startedAt = performance.now();
    const body = await this.#requestJson(
      "/chat/completions",
      {
        body: JSON.stringify({
          max_tokens: request.maxTokens ?? 2_000,
          messages: [
            { content: request.system, role: "system" },
            { content: request.prompt, role: "user" },
          ],
          model: request.modelId,
          stream: false,
          temperature: request.temperature ?? 0.15,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
      ChatCompletionSchema,
      completionResponseLimitBytes,
    );
    this.#assertModelIdentity(body.model, request.modelId);
    const firstChoice = body.choices[0];
    if (firstChoice === undefined) {
      throw new ProviderError("invalid-response", "Provideren returnerte ingen tekst");
    }
    return {
      content: firstChoice.message.content,
      finishReason: firstChoice.finish_reason ?? "unknown",
      latencyMs: performance.now() - startedAt,
      modelId: request.modelId,
      providerId: this.id,
      usage: {
        ...(body.usage?.prompt_tokens === undefined
          ? {}
          : { inputTokens: body.usage.prompt_tokens }),
        ...(body.usage?.completion_tokens === undefined
          ? {}
          : { outputTokens: body.usage.completion_tokens }),
        ...(body.usage?.total_tokens === undefined ? {} : { totalTokens: body.usage.total_tokens }),
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

  async #requestJson<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    maxResponseBytes: number,
    requireKey = true,
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
      try {
        const response = await this.#fetcher(`${this.#baseUrl}${path}`, {
          ...init,
          headers: {
            ...(this.#apiKey === undefined ? {} : { Authorization: `Bearer ${this.#apiKey}` }),
            ...init.headers,
          },
          redirect: "error",
          signal: controller.signal,
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
        await response.body?.cancel("HTTP-feil fra provider");
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) {
          throw new ProviderError("request-failed", `Provideren svarte HTTP ${response.status}`, {
            status: response.status,
          });
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
        const backoffMs = Math.min(50 * 2 ** attempt, Math.max(0, deadline - Date.now()));
        if (backoffMs > 0) await new Promise((resolve) => setTimeout(resolve, backoffMs));
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
