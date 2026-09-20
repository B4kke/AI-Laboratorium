import { AgentSnapshotSchema } from "@ai-lab/domain";

import {
  ApiInputError,
  assertRateLimit,
  handleApiRequest,
  readJsonBody,
} from "@/lib/server/http";
import {
  getLaboratoryRepository,
  isDatabaseConfigured,
} from "@/lib/server/database";
import {
  CreateSavedAgentSchema,
  createInitialAgentSnapshot,
} from "@/lib/server/saved-agents";
import { assertLaboratoryAccess } from "@/lib/server/provider-access";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleApiRequest(request, "/api/agents", async () => {
    assertRateLimit(request, "agentbibliotek", {
      globalLimit: 240,
      limit: 60,
      windowMs: 60_000,
    });
    assertLaboratoryAccess(request);
    if (!isDatabaseConfigured()) {
      return Response.json(
        { agents: [], persistence: "not-configured" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const repository = await getLaboratoryRepository();
    const serialNumberValue = new URL(request.url).searchParams.get("serialNumber");
    if (serialNumberValue !== null) {
      const serialNumber = Number(serialNumberValue);
      if (!Number.isSafeInteger(serialNumber) || serialNumber < 1) {
        throw new ApiInputError("Agentnummer må være et positivt heltall");
      }
      const agent = await repository.getAgentListItemBySerialNumber(serialNumber);
      return Response.json(
        { agents: agent === null ? [] : [agent], persistence: "postgres" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { agents: await repository.listAgents(), persistence: "postgres" },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

export function POST(request: Request) {
  return handleApiRequest(request, "/api/agents", async () => {
    assertRateLimit(request, "agentopprettelse", {
      globalLimit: 40,
      limit: 10,
      windowMs: 60_000,
    });
    assertLaboratoryAccess(request);
    const input = CreateSavedAgentSchema.parse(await readJsonBody(request, 128_000));
    const snapshot = AgentSnapshotSchema.parse(createInitialAgentSnapshot(input));
    const repository = await getLaboratoryRepository();
    const agent = await repository.saveAgentSnapshot(snapshot);
    return Response.json(
      { agent, snapshot },
      { headers: { "Cache-Control": "no-store" }, status: 201 },
    );
  });
}
