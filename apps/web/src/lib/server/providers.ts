import {
  MockProvider,
  ProviderRegistry,
  createNvidiaNimProvider,
  createOpenCodeZenProvider,
  type ModelDescriptor,
  type ProviderHealth,
  type ProviderId,
} from "@ai-lab/providers";

import { hasRemoteProviderAccess, providerRequiresAccess } from "./provider-access";

export type ProviderCatalogEntry = {
  health: ProviderHealth;
  id: ProviderId;
  models: readonly ModelDescriptor[];
  name: string;
};

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

const confirmedNvidiaModels = new Set(
  (process.env.NVIDIA_CONFIRMED_FREE_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const nvidiaApiKey = optional(process.env.NVIDIA_API_KEY);
const zenApiKey = optional(process.env.OPENCODE_ZEN_API_KEY);

const providers = [
  new MockProvider(),
  createNvidiaNimProvider({
    confirmedFreeModelIds: confirmedNvidiaModels,
    freeOnly: process.env.PROVIDER_FREE_ONLY !== "false",
    requestTimeoutMs: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 45_000),
    ...(nvidiaApiKey === undefined ? {} : { apiKey: nvidiaApiKey }),
  }),
  createOpenCodeZenProvider({
    freeOnly: process.env.PROVIDER_FREE_ONLY !== "false",
    requestTimeoutMs: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 45_000),
    ...(zenApiKey === undefined ? {} : { apiKey: zenApiKey }),
  }),
] as const;

const registry = new ProviderRegistry(providers);

export function getProviderRegistry(): ProviderRegistry {
  return registry;
}

const providerNames: Record<ProviderId, string> = {
  mock: "Lokale baselines",
  "nvidia-nim": "NVIDIA NIM",
  "opencode-zen": "OpenCode Zen",
};

export async function getProviderCatalog(request: Request): Promise<readonly ProviderCatalogEntry[]> {
  return Promise.all(
    providers.map(async (provider) => {
      if (providerRequiresAccess(provider.id) && !hasRemoteProviderAccess(request)) {
        return {
          health: {
            message: "Tilgangsnøkkel kreves for eksterne modeller",
            status: "unavailable" as const,
          },
          id: provider.id,
          models: [],
          name: providerNames[provider.id],
        };
      }
      const health = await provider.health();
      let models: readonly ModelDescriptor[] = [];
      if (health.status === "available" || provider.id === "mock") {
        try {
          models = (await provider.listModels()).filter(
            ({ freeClassification }) => freeClassification === "confirmed-free",
          );
        } catch {
          models = [];
        }
      }
      return { health, id: provider.id, models, name: providerNames[provider.id] };
    }),
  );
}
