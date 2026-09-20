import { describe, expect, it } from "vitest";

import { createDuelReportHtml, createDuelReportPdf } from "./index";

const result = {
  arena: { title: "Tillit <test>", version: "1.0.0" },
  events: [
    {
      payload: { agentAName: "Astra", agentBName: "Nova", arenaTitle: "Tillit", rounds: 1 },
      sequence: 0,
      type: "duel.created",
    },
  ],
  replayFingerprint: "0123456789abcdef",
  scores: { a: 4, b: 2 },
  seed: "rapport-test",
  winner: "a",
} as never;

describe("duellrapporter", () => {
  it("escaper brukerdata i HTML", () => {
    const html = createDuelReportHtml(result);
    expect(html).toContain("Tillit &lt;test&gt;");
    expect(html).not.toContain("<test>");
  });

  it("lager en gyldig PDF", async () => {
    const pdf = await createDuelReportPdf(result);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});
