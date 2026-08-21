import { getProviderCatalog } from "@/lib/server/providers";
import { assertRateLimit, handleApiRequest, withConcurrencyLimit } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleApiRequest(request, "/api/providers", async () => {
    assertRateLimit(request, "provider-katalog", {
      globalLimit: 120,
      limit: 30,
      windowMs: 60_000,
    });
    const providers = await withConcurrencyLimit("provider-operasjoner", 2, () =>
      getProviderCatalog(request),
    );
    return Response.json({ providers }, { headers: { "Cache-Control": "no-store" } });
  });
}
