import { EntityIdSchema } from "@ai-lab/domain";

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
  context: { params: Promise<{ agentId: string }> },
) {
  return handleApiRequest(request, "/api/agents/[agentId]", async () => {
    assertRateLimit(request, "agentdetalj", {
      globalLimit: 240,
      limit: 60,
      windowMs: 60_000,
    });
    assertLaboratoryAccess(request);
    const { agentId: rawAgentId } = await context.params;
    const agentId = EntityIdSchema.parse(rawAgentId);
    const snapshotId = new URL(request.url).searchParams.get("snapshotId");
    const repository = await getLaboratoryRepository();
    const snapshot = await repository.getAgentSnapshot(
      agentId,
      snapshotId === null ? undefined : EntityIdSchema.parse(snapshotId),
    );
    if (snapshot === null) throw new ApiNotFoundError(`Agenten ${agentId} finnes ikke`);
    const agent = await repository.getAgentListItem(agentId);
    if (agent === null) throw new ApiNotFoundError(`Agenten ${agentId} finnes ikke`);
    const history = await repository.listAgentSnapshots(agentId);
    const lineage = await repository.listLineageForGenomeIds(
      history.map(({ genome }) => genome.id),
    );
    return Response.json(
      { agent, history, lineage, snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
