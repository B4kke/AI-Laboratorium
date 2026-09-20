import type { DuelResult, EventEnvelope } from "@ai-lab/domain";
import { toReadableEvent } from "@ai-lab/events";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function eventSummary(event: EventEnvelope): string {
  const readable = toReadableEvent(event);
  return readable.description === undefined
    ? readable.title
    : `${readable.title} – ${readable.description}`;
}

export function createDuelReportHtml(result: DuelResult): string {
  const winner = result.winner === "draw" ? "Uavgjort" : `Rolle ${result.winner.toUpperCase()}`;
  const timeline = result.events
    .map(
      (event) =>
        `<li><strong>${event.sequence + 1}.</strong> ${escapeHtml(eventSummary(event))}</li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><title>Duellrapport – ${escapeHtml(result.arena.title)}</title>
<style>body{font:16px/1.55 system-ui;max-width:780px;margin:40px auto;padding:0 24px;color:#18181b}h1{font-size:32px}dl{display:grid;grid-template-columns:auto 1fr;gap:8px 20px}dt{font-weight:700}li{margin:.45rem 0}</style></head>
<body><p>AI-Laboratorium · etterprøvbar duellrapport</p><h1>${escapeHtml(result.arena.title)}</h1>
<dl><dt>Resultat</dt><dd>${winner}</dd><dt>Poeng</dt><dd>${result.scores.a}–${result.scores.b}</dd><dt>Seed</dt><dd>${escapeHtml(result.seed)}</dd><dt>Replay</dt><dd>${result.replayFingerprint}</dd><dt>Arenaversjon</dt><dd>${escapeHtml(result.arena.version)}</dd></dl>
<h2>Hendelsesforløp</h2><ol>${timeline}</ol></body></html>`;
}

export function createDuelReportJson(result: DuelResult): string {
  return JSON.stringify(result, null, 2);
}

function asciiSafe(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll("ø", "o")
    .replaceAll("Ø", "O")
    .replace(/[^\x20-\x7E]/g, "");
}

export async function createDuelReportPdf(result: DuelResult): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595, 842]);
  let y = 790;
  const drawLine = (text: string, size = 10, isBold = false) => {
    if (y < 55) {
      page = document.addPage([595, 842]);
      y = 790;
    }
    page.drawText(asciiSafe(text).slice(0, 95), {
      color: rgb(0.1, 0.1, 0.12),
      font: isBold ? bold : font,
      size,
      x: 48,
      y,
    });
    y -= size + 8;
  };
  drawLine("AI-Laboratorium", 10, true);
  drawLine(`Duellrapport: ${result.arena.title}`, 20, true);
  y -= 6;
  drawLine(`Poeng: ${result.scores.a}-${result.scores.b}`);
  drawLine(`Vinner: ${result.winner === "draw" ? "Uavgjort" : result.winner.toUpperCase()}`);
  drawLine(`Seed: ${result.seed}`);
  drawLine(`Replay: ${result.replayFingerprint}`);
  y -= 10;
  drawLine("Hendelsesforlop", 14, true);
  for (const event of result.events) {
    drawLine(`${event.sequence + 1}. ${eventSummary(event)}`);
  }
  document.setTitle(`Duellrapport - ${result.arena.title}`);
  document.setSubject("Etterprovbar rapport fra AI-Laboratorium");
  document.setCreator("AI-Laboratorium");
  return document.save();
}
