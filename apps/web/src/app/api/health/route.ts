import {
  getLaboratoryRepository,
  isDatabaseConfigured,
} from "@/lib/server/database";
import { handleApiRequest } from "@/lib/server/http";
import {
  isLaboratoryAccessConfigured,
  isRemoteProviderAccessConfigured,
} from "@/lib/server/provider-access";
import { isReportSigningConfigured } from "@/lib/server/report-token";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleApiRequest(request, "/api/health", async () => {
    let databaseReady = false;
    if (isDatabaseConfigured()) {
      try {
        await (await getLaboratoryRepository()).ping();
        databaseReady = true;
      } catch {
        databaseReady = false;
      }
    }
    const ready =
      databaseReady && isReportSigningConfigured() && isRemoteProviderAccessConfigured();
    const accessReady = isLaboratoryAccessConfigured();
    return Response.json(
      {
        capabilities: {
          agentLibrary: databaseReady,
          evolutionQueue: databaseReady,
        },
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "lokal",
        service: "AI-Laboratorium",
        status: ready && accessReady ? "klar" : "feilkonfigurert",
        time: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" }, status: ready && accessReady ? 200 : 503 },
    );
  });
}
