import { getBuiltInArena, runDuel } from "@ai-lab/arena";
import { DuelRequestSchema } from "@ai-lab/domain";

import {
  ApiInputError,
  assertRateLimit,
  handleApiRequest,
  readJsonBody,
  withConcurrencyLimit,
} from "@/lib/server/http";
import {
  assertLaboratoryAccess,
  assertRemoteProviderAccess,
} from "@/lib/server/provider-access";
import { getProviderRegistry } from "@/lib/server/providers";
import { createReportToken } from "@/lib/server/report-token";
import {
  getOptionalLaboratoryRepository,
  isDatabaseConfigured,
} from "@/lib/server/database";
import { resolveDuelAgentSnapshots } from "@/lib/server/saved-agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleApiRequest(request, "/api/duels", async () => {
    assertRateLimit(request, "duell-forespørsler", {
      globalLimit: 80,
      limit: 20,
      windowMs: 60_000,
    });
    if (isDatabaseConfigured()) assertLaboratoryAccess(request);
    const parsedInput = DuelRequestSchema.parse(await readJsonBody(request));
    const input = await resolveDuelAgentSnapshots(parsedInput);
    const arena = input.arenaSpec ?? getBuiltInArena(input.arenaId ?? "");
    if (arena === undefined) throw new ApiInputError("Ukjent innebygd arena");

    const remoteProviders = [input.agentA.providerId, input.agentB.providerId].filter(
      (providerId) => providerId !== "mock",
    );
    for (const providerId of new Set(remoteProviders)) {
      assertRemoteProviderAccess(request, providerId);
    }
    assertRateLimit(request, "duell-arbeid", {
      cost: 1,
      globalLimit: 256,
      limit: 64,
      windowMs: 60_000,
    });

    const result = await withConcurrencyLimit(
      remoteProviders.length > 0 ? "provider-operasjoner" : "lokale-dueller",
      remoteProviders.length > 0 ? 2 : 4,
      () => runDuel(input, getProviderRegistry()),
    );
    await (await getOptionalLaboratoryRepository())?.saveDuel(result);
    return Response.json(
      { ...result, reportToken: createReportToken(result) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
