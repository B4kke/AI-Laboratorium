import { OpenAICompatibleProvider } from "./openai-compatible";

export type OpenCodeZenProviderOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
  freeOnly?: boolean;
  requestTimeoutMs?: number;
};

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
