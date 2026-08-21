import { handleApiRequest } from "@/lib/server/http";
import { isRemoteProviderAccessConfigured } from "@/lib/server/provider-access";
import { isReportSigningConfigured } from "@/lib/server/report-token";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleApiRequest(request, "/api/health", () => {
    const ready = isReportSigningConfigured() && isRemoteProviderAccessConfigured();
    return Response.json(
      {
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "lokal",
        service: "AI-Laboratorium",
        status: ready ? "klar" : "feilkonfigurert",
        time: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" }, status: ready ? 200 : 503 },
    );
  });
}
