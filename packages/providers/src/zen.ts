import { OpenAICompatibleProvider } from "./openai-compatible";

export type OpenCodeZenProviderOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
  freeOnly?: boolean;
  requestTimeoutMs?: number;
};

/**
 * OpenCode Zen via https://opencode.ai/zen/v1.
 *
 * - Chat-modeller (f.eks. nemotron-3.5-lightning-free) bruker /chat/completions via AI SDK.
 * - Muse Spark (f.eks. muse-spark-1.3-contributor-free) er Responses-only og rutes
 *   automatisk til /responses med input/output-usage normalisert til samme kontrakt.
 * - Modell-ID-er kan oppgis med eller uten `opencode/`-prefiks; API-kall normaliseres
 *   til bar ID mens snapshot bevarer katalog-ID-en.
 */

export function createOpenCodeZenProvider(options: OpenCodeZenProviderOptions = {}) {
  return new OpenAICompatibleProvider({
    baseUrl: "https://opencode.ai/zen/v1",
    id: "opencode-zen",
    modelClassifier: (id) => (id.endsWith("-free") ? "confirmed-free" : "unknown"),
    policy: { freeOnly: options.freeOnly ?? true },
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
    ...(options.requestTimeoutMs === undefined
      ? {}
      : { requestTimeoutMs: options.requestTimeoutMs }),
  });
}
