import { getBuiltInArena } from "@ai-lab/arena";
import { EvolutionRequestSchema, estimateProviderCalls } from "@ai-lab/evolution";

import { getLaboratoryRepository } from "@/lib/server/database";
import {
  ApiInputError,
  assertRateLimit,
  handleApiRequest,
  readJsonBody,
} from "@/lib/server/http";
import {
  assertLaboratoryAccess,
  assertRemoteProviderAccess,
} from "@/lib/server/provider-access";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleApiRequest(request, "/api/evolution", async () => {
    assertRateLimit(request, "evolusjon-liste", {
      globalLimit: 600,
      limit: 120,
      windowMs: 60_000,
    });
    assertLaboratoryAccess(request);
    const repository = await getLaboratoryRepository();
    return Response.json(
      { jobs: await repository.listEvolutionJobs(30) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

export function POST(request: Request) {
  return handleApiRequest(request, "/api/evolution", async () => {
    assertRateLimit(request, "evolusjon-kølegging", {
      globalLimit: 40,
      limit: 10,
      windowMs: 60_000,
    });
    assertLaboratoryAccess(request);
    const input = EvolutionRequestSchema.parse(await readJsonBody(request, 128_000));
    const arena = getBuiltInArena(input.arenaId);
    if (arena === undefined) throw new ApiInputError("Ukjent innebygd arena");
    const repository = await getLaboratoryRepository();
    const providers = new Set<"nvidia-nim" | "opencode-zen">([
      input.defaultModel.providerId,
      input.mutationModel.providerId,
      ...input.slotOverrides.flatMap(({ model }) =>
        model === undefined ? [] : [model.providerId],
      ),
    ]);
    for (const override of input.slotOverrides) {
      if (override.agentId === undefined || override.model !== undefined) continue;
      const snapshot = await repository.getAgentSnapshot(override.agentId, override.snapshotId);
      if (snapshot === null) {
        throw new ApiInputError(`Lagret agent for plass ${override.index + 1} finnes ikke`);
      }
      if (snapshot.providerId === "mock") {
        throw new ApiInputError(
          `Agentplassen ${override.index + 1} bruker en scripted baseline; velg en ekte modell`,
        );
      }
      providers.add(snapshot.providerId);
    }
    const incumbent = await repository.getLatestChampionSnapshot();
    if (incumbent !== null && incumbent.providerId !== "mock") {
      providers.add(incumbent.providerId);
    }
    for (const providerId of providers) assertRemoteProviderAccess(request, providerId);

    const estimatedCalls = estimateProviderCalls(input, arena.rounds);
    const job = await repository.enqueueEvolution(input);
    return Response.json(
      { estimatedProviderCalls: estimatedCalls, job },
      { headers: { "Cache-Control": "no-store" }, status: 202 },
    );
  });
}
