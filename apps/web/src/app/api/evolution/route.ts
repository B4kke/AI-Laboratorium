import { runEvolution } from "@ai-lab/evolution";
import { z } from "zod";

import {
  ApiInputError,
  assertRateLimit,
  handleApiRequest,
  readJsonBody,
  withConcurrencyLimit,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const InputSchema = z
  .object({
    arenaId: z.string().trim().min(1).max(64),
    generationCount: z.number().int().min(1).max(10).default(10),
    populationSize: z.number().int().min(2).max(6).default(6),
    seed: z.string().trim().min(1).max(128),
    trialsPerCandidate: z.number().int().min(2).max(2).default(2),
  })
  .strict();

export async function POST(request: Request) {
  return handleApiRequest(request, "/api/evolution", async () => {
    assertRateLimit(request, "evolusjon-forespørsler", {
      globalLimit: 8,
      limit: 2,
      windowMs: 60_000,
    });
    const input = InputSchema.parse(await readJsonBody(request, 16_000));
    const workUnits = input.generationCount * input.populationSize * input.trialsPerCandidate;
    if (workUnits > 120) throw new ApiInputError("Evolusjonsløpet overstiger 120 dueller");
    const result = await withConcurrencyLimit("evolusjon", 1, () => runEvolution(input));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  });
}
