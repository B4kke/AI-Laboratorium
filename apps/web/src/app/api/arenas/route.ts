import { builtInArenas } from "@ai-lab/arena";

import { handleApiRequest } from "@/lib/server/http";

export function GET(request: Request) {
  return handleApiRequest(request, "/api/arenas", () =>
    Response.json(
      { arenas: builtInArenas },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
    ),
  );
}
