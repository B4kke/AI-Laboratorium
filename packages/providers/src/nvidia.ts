import { OpenAICompatibleProvider } from "./openai-compatible";

export type NvidiaNimProviderOptions = {
  apiKey?: string;
  confirmedFreeModelIds?: ReadonlySet<string>;
  fetcher?: typeof fetch;
  freeOnly?: boolean;
  requestTimeoutMs?: number;
};

export function createNvidiaNimProvider(options: NvidiaNimProviderOptions = {}) {
  return new OpenAICompatibleProvider({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    id: "nvidia-nim",
    policy: { freeOnly: options.freeOnly ?? true },
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.confirmedFreeModelIds === undefined
      ? {}
      : { confirmedFreeModelIds: options.confirmedFreeModelIds }),
    ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
    ...(options.requestTimeoutMs === undefined
      ? {}
      : { requestTimeoutMs: options.requestTimeoutMs }),
  });
}
