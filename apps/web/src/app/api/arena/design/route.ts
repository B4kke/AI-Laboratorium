import { designArenaWithModel, draftArenaFromIdea } from "@ai-lab/arena";
import { z } from "zod";

import {
  assertRateLimit,
  handleApiRequest,
  readJsonBody,
  withConcurrencyLimit,
} from "@/lib/server/http";
import { assertRemoteProviderAccess } from "@/lib/server/provider-access";
import { getProviderRegistry } from "@/lib/server/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const InputSchema = z
  .object({
    idea: z.string().trim().min(12).max(2_000),
    modelId: z.string().trim().min(1).max(200).optional(),
    providerId: z.enum(["nvidia-nim", "opencode-zen"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.modelId === undefined) !== (value.providerId === undefined)) {
      context.addIssue({ code: "custom", message: "Velg både modellkilde og modell" });
    }
  });

export async function POST(request: Request) {
  return handleApiRequest(request, "/api/arena/design", async () => {
    assertRateLimit(request, "arena-designer", {
      globalLimit: 40,
      limit: 10,
      windowMs: 60_000,
    });
    const input = InputSchema.parse(await readJsonBody(request, 16_000));
    const { modelId, providerId } = input;
    if (modelId !== undefined && providerId !== undefined) {
      assertRemoteProviderAccess(request, providerId);
      assertRateLimit(request, "arena-designer-provider", {
        cost: 6,
        globalLimit: 24,
        limit: 12,
        windowMs: 60_000,
      });
      const draft = await withConcurrencyLimit("provider-operasjoner", 2, () =>
        designArenaWithModel({
          idea: input.idea,
          modelId,
          provider: getProviderRegistry().get(providerId),
        }),
      );
      return Response.json(draft, { headers: { "Cache-Control": "no-store" } });
    }
    const draft = await withConcurrencyLimit("lokal-arena-designer", 4, () =>
      Promise.resolve(draftArenaFromIdea(input.idea)),
    );
    return Response.json(draft, { headers: { "Cache-Control": "no-store" } });
  });
}
