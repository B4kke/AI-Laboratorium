import type { ModelProvider, ProviderId } from "./types";

export class ProviderRegistry {
  readonly #providers: ReadonlyMap<ProviderId, ModelProvider>;

  constructor(providers: readonly ModelProvider[]) {
    const map = new Map<ProviderId, ModelProvider>();
    for (const provider of providers) {
      if (map.has(provider.id)) {
        throw new Error(`Provideren ${provider.id} er registrert flere ganger`);
      }
      map.set(provider.id, provider);
    }
    this.#providers = map;
  }

  get(id: ProviderId): ModelProvider {
    const provider = this.#providers.get(id);
    if (provider === undefined) {
      throw new Error(`Provideren ${id} er ikke registrert`);
    }
    return provider;
  }

  all(): readonly ModelProvider[] {
    return [...this.#providers.values()];
  }
}
