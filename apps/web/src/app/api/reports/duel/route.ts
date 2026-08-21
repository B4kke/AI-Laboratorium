import { DuelResultSchema } from "@ai-lab/domain";
import {
  createDuelReportHtml,
  createDuelReportJson,
  createDuelReportPdf,
} from "@ai-lab/reports";
import { z } from "zod";

import {
  assertRateLimit,
  handleApiRequest,
  readJsonBody,
  withConcurrencyLimit,
} from "@/lib/server/http";
import { verifyReportToken } from "@/lib/server/report-token";

export const runtime = "nodejs";

const FormatSchema = z.enum(["html", "json", "pdf"]);
const InputSchema = z
  .object({
    reportToken: z.string().min(1).max(128),
    result: DuelResultSchema,
  })
  .strict();

export async function POST(request: Request) {
  return handleApiRequest(request, "/api/reports/duel", async () => {
    assertRateLimit(request, "duellrapporter", {
      globalLimit: 48,
      limit: 12,
      windowMs: 60_000,
    });
    const format = FormatSchema.parse(new URL(request.url).searchParams.get("format") ?? "pdf");
    const { reportToken, result } = InputSchema.parse(await readJsonBody(request, 256_000));
    verifyReportToken(result, reportToken);
    const headers = {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="duellrapport-${result.matchId}.${format}"`,
    };
    return withConcurrencyLimit("rapportgenerering", format === "pdf" ? 2 : 4, async () => {
      if (format === "html") {
        return new Response(createDuelReportHtml(result), {
          headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        });
      }
      if (format === "json") {
        return new Response(createDuelReportJson(result), {
          headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const pdf = Uint8Array.from(await createDuelReportPdf(result));
      return new Response(pdf.buffer, {
        headers: { ...headers, "Content-Type": "application/pdf" },
      });
    });
  });
}
