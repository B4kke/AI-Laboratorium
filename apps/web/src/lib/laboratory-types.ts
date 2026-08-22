import type { AgentSnapshot } from "@ai-lab/domain";
import type { AgentListItem, EvolutionJob } from "@ai-lab/db";
import type { EvolutionRequest, StoredEvolutionResult } from "@ai-lab/evolution";
import type { ModelDescriptor, ProviderHealth, ProviderId } from "@ai-lab/providers";

export type AgentLibraryResponse = {
  agents: readonly AgentListItem[];
  persistence: "not-configured" | "postgres";
};

export type AgentDetailResponse = {
  agent: AgentListItem;
  snapshot: AgentSnapshot;
};

export type CreateAgentResponse = AgentDetailResponse;

export type EvolutionEnqueueResponse = {
  estimatedProviderCalls: number;
  job: EvolutionJob<EvolutionRequest>;
};

export type EvolutionStatusResponse = {
  job: EvolutionJob<EvolutionRequest, StoredEvolutionResult>;
};

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
