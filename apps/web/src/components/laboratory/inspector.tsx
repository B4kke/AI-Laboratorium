"use client";

import type { ArenaSpec, DuelResult, EventEnvelope } from "@ai-lab/domain";
import { parseEventPayload, toReadableEvent } from "@ai-lab/events";
import { Download, Fingerprint, Gauge, ListTree, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type InspectorProps = {
  arena: ArenaSpec;
  exporting: string | null;
  onExport: (format: "html" | "json" | "pdf") => void;
  result: DuelResult | null;
  selectedEvent: EventEnvelope | null;
};

const freeClassificationNames: Record<
  DuelResult["providerSnapshots"][number]["freeClassification"],
  string
> = {
  "confirmed-free": "bekreftet gratis",
  "not-free": "ikke gratis",
  unknown: "ukjent prisstatus",
};

const providerNames: Record<DuelResult["providerSnapshots"][number]["providerId"], string> = {
  mock: "Lokal modellkilde",
  "nvidia-nim": "NVIDIA NIM",
  "opencode-zen": "OpenCode Zen",
};

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="grid gap-1 border-b border-white/6 py-3 last:border-0">
      <dt className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="m-0 text-xs leading-5 text-foreground/90">{value}</dd>
    </div>
  );
}

function EventDetails({ event }: { event: EventEnvelope | null }) {
  if (event === null) {
    return (
      <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-white/10 p-6 text-center">
        <div>
          <ListTree className="mx-auto mb-3 size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Velg en hendelse</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Trykk i hendelsesstrømmen for å inspisere et observerbart spor.</p>
        </div>
      </div>
    );
  }
  const readable = toReadableEvent(event);
  return (
    <div>
      <div className="mb-4 rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Badge variant="outline" className="border-white/10 font-mono text-[9px]">#{event.sequence + 1}</Badge>
          <span className="font-mono text-[9px] text-muted-foreground">{event.type}</span>
        </div>
        <p className="text-sm font-semibold leading-5">{readable.title}</p>
        {readable.description !== undefined && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{readable.description}</p>
        )}
      </div>

      {event.type === "agent.decided" && (() => {
        const payload = parseEventPayload(event.type, event.payload);
        return (
          <dl>
            <DetailRow label="Valgt handling" value={payload.trace.actionId} />
            <div className="border-b border-white/6 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <dt className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Sikkerhet</dt>
                <dd className="m-0 font-mono text-xs">{Math.round(payload.trace.confidence * 100)} %</dd>
              </div>
              <Progress value={payload.trace.confidence * 100} className="h-1" />
            </div>
            <DetailRow label="Mål" value={payload.trace.goal} />
            <DetailRow label="Kort begrunnelse" value={payload.trace.rationale} />
            <DetailRow label="Observasjon" value={payload.trace.observation} />
          </dl>
        );
      })()}

      {event.type === "round.resolved" && (() => {
        const payload = parseEventPayload(event.type, event.payload);
        return (
          <dl>
            <DetailRow label="Runde" value={payload.round} />
            <DetailRow label="Poengendring A" value={payload.aDelta} />
            <DetailRow label="Poengendring B" value={payload.bDelta} />
            <DetailRow label="Ny stilling" value={`${payload.aScore}–${payload.bScore}`} />
          </dl>
        );
      })()}
    </div>
  );
}

function ArenaDetails({ arena }: { arena: ArenaSpec }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold">{arena.title}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{arena.description}</p>
      </div>
      <div>
        <p className="mb-2 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Regler</p>
        <ol className="space-y-2 text-xs leading-5">
          {arena.rules.map((rule, index) => (
            <li className="flex gap-2" key={rule}>
              <span className="font-mono text-cyan-200">{String(index + 1).padStart(2, "0")}</span>{rule}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="mb-2 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Poengmatrise A / B</p>
        <div className="overflow-x-auto rounded-lg border border-white/8">
          <table className="w-full min-w-72 border-collapse text-left text-[10px]">
            <thead className="bg-white/[0.035] text-muted-foreground">
              <tr><th className="p-2">A</th><th className="p-2">B</th><th className="p-2">Poeng</th></tr>
            </thead>
            <tbody>
              {arena.payoffMatrix.map((entry) => (
                <tr className="border-t border-white/6" key={`${entry.aAction}-${entry.bAction}`}>
                  <td className="p-2">{entry.aAction}</td><td className="p-2">{entry.bAction}</td>
                  <td className="p-2 font-mono text-cyan-100">{entry.aDelta} / {entry.bDelta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReplayDetails({ result }: { result: DuelResult | null }) {
  if (result === null) {
    return <p className="py-8 text-center text-xs text-muted-foreground">Kjør en duell for å opprette en avspilling.</p>;
  }
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-300/12 bg-emerald-300/[0.045] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
          <ShieldCheck className="size-4" /> Reproduserbart spor
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Startverdi, arenaversjon, modelløyeblikksbilder og ordnet hendelseslogg følger resultatet.</p>
      </div>
      <dl>
        <DetailRow label="Startverdi" value={result.seed} />
        <DetailRow label="Avspillingsfingeravtrykk" value={result.replayFingerprint} />
        <DetailRow label="Hendelser" value={result.events.length} />
        <DetailRow label="Fullført" value={new Date(result.completedAt).toLocaleString("nb-NO")} />
      </dl>
      <div>
        <p className="mb-2 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Modelløyeblikksbilder</p>
        <div className="space-y-2">
          {result.providerSnapshots.map((snapshot) => (
            <div className="rounded-lg border border-white/8 bg-black/15 p-3" key={snapshot.id}>
              <p className="truncate font-mono text-[10px] text-foreground">{snapshot.modelId}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{providerNames[snapshot.providerId]} · {freeClassificationNames[snapshot.freeClassification]}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Inspector({ arena, exporting, onExport, result, selectedEvent }: InspectorProps) {
  return (
    <aside className="glass-panel overflow-hidden rounded-2xl border border-white/8 xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between border-b border-white/7 px-4 py-4">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-cyan-200" />
          <p className="text-xs font-semibold tracking-[0.12em] uppercase">Inspektør</p>
        </div>
        <Fingerprint className="size-4 text-muted-foreground" />
      </div>
      <Tabs defaultValue="event" className="h-[calc(100%-57px)] gap-0">
        <TabsList variant="line" className="w-full justify-start border-b border-white/7 px-3">
          <TabsTrigger value="event">Hendelse</TabsTrigger>
          <TabsTrigger value="arena">Arena</TabsTrigger>
          <TabsTrigger value="replay">Avspilling</TabsTrigger>
        </TabsList>
        <ScrollArea className="h-[calc(100%-46px)]">
          <TabsContent value="event" className="p-4"><EventDetails event={selectedEvent} /></TabsContent>
          <TabsContent value="arena" className="p-4"><ArenaDetails arena={arena} /></TabsContent>
          <TabsContent value="replay" className="p-4">
            <ReplayDetails result={result} />
            {result !== null && (
              <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/7 pt-4">
                {(["pdf", "html", "json"] as const).map((format) => (
                  <Button
                    className="px-2 text-[10px] uppercase"
                    disabled={exporting !== null}
                    key={format}
                    onClick={() => onExport(format)}
                    size="sm"
                    variant={format === "pdf" ? "default" : "outline"}
                  >
                    <Download /> {exporting === format ? "…" : format}
                  </Button>
                ))}
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
