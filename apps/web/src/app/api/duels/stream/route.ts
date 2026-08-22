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
  return handleApiRequest(request, "/api/duels/stream", async () => {
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

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          const result = await withConcurrencyLimit(
            remoteProviders.length > 0 ? "provider-operasjoner" : "lokale-dueller",
            remoteProviders.length > 0 ? 2 : 4,
            () =>
              runDuel(input, getProviderRegistry(), {
                onEvent: (event) => send({ event, kind: "event" }),
              }),
          );
          await (await getOptionalLaboratoryRepository())?.saveDuel(result);
          send({ kind: "result", reportToken: createReportToken(result), result });
        } catch (error) {
          send({
            kind: "error",
            message: error instanceof Error ? error.message : "Duellen feilet under kjøring",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
