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

/**
 * NVIDIA NIM via https://integrate.api.nvidia.com/v1 (OpenAI-kompatibel).
 *
 * Anbefalte Nemotron-modeller (bekreft gratis-status for egen konto før bruk):
 * - nvidia/nemotron-3.5-lightning-30b-a3b
 * - nvidia/nemotron-nano-3-30b-a3b
 * - nvidia/nemotron-3-super-120b-a12b
 * - nvidia/nemotron-3-ultra-550b-a55b
 * Legg valgte ID-er i NVIDIA_CONFIRMED_FREE_MODELS; katalogen oppgir ikke pris.
 */

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
