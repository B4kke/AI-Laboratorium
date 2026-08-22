import {
  createEnvironmentProviders,
  ProviderRegistry,
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

const providers = createEnvironmentProviders(process.env);

const registry = new ProviderRegistry(providers);
const freeOnly = process.env.PROVIDER_FREE_ONLY !== "false";

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
            ({ freeClassification }) =>
              !freeOnly || freeClassification === "confirmed-free",
          );
        } catch {
          models = [];
        }
      }
      return { health, id: provider.id, models, name: providerNames[provider.id] };
    }),
  );
}
