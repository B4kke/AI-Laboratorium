import { EntityIdSchema } from "@ai-lab/domain";
import type { EvolutionRequest, StoredEvolutionResult } from "@ai-lab/evolution";

import { getLaboratoryRepository } from "@/lib/server/database";
import {
  ApiNotFoundError,
  assertRateLimit,
  handleApiRequest,
} from "@/lib/server/http";
import { assertLaboratoryAccess } from "@/lib/server/provider-access";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  return handleApiRequest(request, "/api/evolution/[jobId]", async () => {
    assertRateLimit(request, "evolusjon-status", {
      globalLimit: 1_200,
      limit: 300,
      windowMs: 60_000,
    });
    assertLaboratoryAccess(request);
    const { jobId: rawJobId } = await context.params;
    const jobId = EntityIdSchema.parse(rawJobId);
    const repository = await getLaboratoryRepository();
    const job = await repository.getEvolutionJob<EvolutionRequest, StoredEvolutionResult>(jobId);
    if (job === null) throw new ApiNotFoundError(`Evolution-jobben ${jobId} finnes ikke`);
    return Response.json(
      { job },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
