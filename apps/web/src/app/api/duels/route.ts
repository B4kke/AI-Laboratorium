import { getBuiltInArena, runDuel } from "@ai-lab/arena";
import { DuelRequestSchema } from "@ai-lab/domain";

import {
  ApiInputError,
  assertRateLimit,
  handleApiRequest,
  readJsonBody,
  withConcurrencyLimit,
} from "@/lib/server/http";
import { assertRemoteProviderAccess } from "@/lib/server/provider-access";
import { getProviderRegistry } from "@/lib/server/providers";
import { createReportToken } from "@/lib/server/report-token";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleApiRequest(request, "/api/duels", async () => {
    assertRateLimit(request, "duell-forespørsler", {
      globalLimit: 80,
      limit: 20,
      windowMs: 60_000,
    });
    const input = DuelRequestSchema.parse(await readJsonBody(request));
    const arena = input.arenaSpec ?? getBuiltInArena(input.arenaId ?? "");
    if (arena === undefined) throw new ApiInputError("Ukjent innebygd arena");

    const remoteProviders = [input.agentA.providerId, input.agentB.providerId].filter(
      (providerId) => providerId !== "mock",
    );
    for (const providerId of new Set(remoteProviders)) {
      assertRemoteProviderAccess(request, providerId);
    }
    const providerCallBudget = arena.rounds * remoteProviders.length;
    if (providerCallBudget > 16) {
      throw new ApiInputError(
        "Eksterne modeller er begrenset til totalt 16 beslutninger per duell",
      );
    }
    assertRateLimit(request, "duell-arbeid", {
      cost: Math.max(1, providerCallBudget || Math.ceil(arena.rounds / 2)),
      globalLimit: 256,
      limit: 64,
      windowMs: 60_000,
    });

    const result = await withConcurrencyLimit(
      remoteProviders.length > 0 ? "provider-operasjoner" : "lokale-dueller",
      remoteProviders.length > 0 ? 2 : 4,
      () => runDuel(input, getProviderRegistry()),
    );
    return Response.json(
      { ...result, reportToken: createReportToken(result) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
