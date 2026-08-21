import type { ModelDescriptor, ProviderHealth, ProviderId } from "@ai-lab/providers";

export type ProviderCatalogEntry = {
  health: ProviderHealth;
  id: ProviderId;
  models: readonly ModelDescriptor[];
  name: string;
};

export type ProviderCatalogResponse = {
  providers: readonly ProviderCatalogEntry[];
};

export async function readApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body !== null && "error" in body && body.error
        ? body.error
        : `Tjenesten svarte ${response.status}`,
    );
  }
  return body as T;
}
