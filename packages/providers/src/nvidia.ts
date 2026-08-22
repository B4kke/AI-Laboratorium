import { OpenAICompatibleProvider } from "./openai-compatible";

export type NvidiaNimProviderOptions = {
  apiKey?: string;
  confirmedFreeModelIds?: ReadonlySet<string>;
  fetcher?: typeof fetch;
  freeOnly?: boolean;
  modelFilter?: (modelId: string) => boolean;
  requestTimeoutMs?: number;
};

const deprecatedModelFamilies = /deepseek|qwen/i;

export function createNvidiaNimProvider(options: NvidiaNimProviderOptions = {}) {
  const modelFilter =
    options.modelFilter ?? ((modelId: string) => !deprecatedModelFamilies.test(modelId));
  return new OpenAICompatibleProvider({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    id: "nvidia-nim",
    modelFilter,
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
