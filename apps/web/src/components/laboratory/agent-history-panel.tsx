"use client";

import { GitCompareArrows, History, MemoryStick, Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  readApiResponse,
  type AgentDetailResponse,
} from "@/lib/laboratory-types";

function authorizationHeaders(token: string): Record<string, string> {
  return token.length === 0 ? {} : { Authorization: `Bearer ${token}` };
}

export function AgentHistoryPanel({
  accessToken,
  agentId,
}: {
  accessToken: string;
  agentId: string;
}) {
  const [detail, setDetail] = useState<AgentDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [compareSnapshotId, setCompareSnapshotId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError(null);
      try {
        const response = await fetch(`/api/agents/${agentId}`, {
          headers: authorizationHeaders(accessToken),
          signal: controller.signal,
        });
        const next = await readApiResponse<AgentDetailResponse>(response);
        setDetail(next);
        const latest = next.history.at(-1);
        const previous = next.history.at(-2) ?? latest;
        setSelectedSnapshotId(latest?.id ?? "");
        setCompareSnapshotId(previous?.id ?? "");
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Agenthistorikken kunne ikke lastes");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, agentId]);

  const selected = detail?.history.find(({ id }) => id === selectedSnapshotId);
  const compared = detail?.history.find(({ id }) => id === compareSnapshotId);
  const fileComparison = useMemo(() => {
    const paths = new Set([
      ...(compared?.genome.files.map(({ path }) => path) ?? []),
      ...(selected?.genome.files.map(({ path }) => path) ?? []),
    ]);
    return [...paths].map((path) => {
      const before = compared?.genome.files.find((file) => file.path === path);
      const after = selected?.genome.files.find((file) => file.path === path);
      return { after, before, changed: before?.content !== after?.content, path };
    });
  }, [compared, selected]);

  if (error !== null) {
    return <p className="rounded-xl border border-red-300/15 p-4 text-xs text-red-100">{error}</p>;
  }
  if (detail === null || selected === undefined || compared === undefined) {
    return <p className="text-xs text-muted-foreground">Laster komplett Agent N-historikk…</p>;
  }

  return (
    <section className="space-y-4 rounded-xl border border-white/8 bg-black/15 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="size-4 text-cyan-200" />
            <p className="text-sm font-semibold">
              Agent {detail.agent.serialNumber} · full versjonshistorikk
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {detail.history.length} immutable snapshots · {detail.lineage.length} lineage-kanter
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            G{selected.genome.generation} · {selected.providerId}/{selected.modelId} · taktikk: {selected.strategy}
          </p>
        </div>
        <Badge variant="outline">{detail.agent.status}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          Vis versjon
          <Select value={selectedSnapshotId} onValueChange={setSelectedSnapshotId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {detail.history.toReversed().map((snapshot) => (
                <SelectItem key={snapshot.id} value={snapshot.id}>
                  G{snapshot.genome.generation} · {snapshot.id.slice(-10)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          Sammenlign med
          <Select value={compareSnapshotId} onValueChange={setCompareSnapshotId}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {detail.history.toReversed().map((snapshot) => (
                <SelectItem key={snapshot.id} value={snapshot.id}>
                  G{snapshot.genome.generation} · {snapshot.id.slice(-10)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/7 p-3">
          <p className="mb-2 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            SOUL.md · G{selected.genome.generation}
          </p>
          <div className="max-h-80 overflow-auto text-xs">
            <MessageResponse>{selected.genome.soul}</MessageResponse>
          </div>
        </div>
        <div className="rounded-lg border border-white/7 p-3">
          <div className="mb-2 flex items-center gap-2">
            <MemoryStick className="size-3.5 text-violet-200" />
            <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Minne · {selected.memory.items.length} elementer
            </p>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {selected.memory.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ingen beholdte minner.</p>
            ) : (
              selected.memory.items.map((item) => (
                <div className="rounded-md border border-white/6 p-2" key={`${item.sourceMatchId}-${item.content}`}>
                  <Badge className="mb-1 text-[9px]" variant="outline">{item.category}</Badge>
                  <p className="text-xs leading-5 text-muted-foreground">{item.content}</p>
                  <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                    {(item.sourceMatchIds ?? [item.sourceMatchId]).length} kildekamp(er)
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <GitCompareArrows className="size-4 text-cyan-200" />
          <p className="text-sm font-semibold">Filforskjeller mellom valgte snapshots</p>
        </div>
        <div className="space-y-3">
          {fileComparison.map(({ after, before, changed, path }) => (
            <details className="rounded-lg border border-white/7 p-3" key={path} open={changed}>
              <summary className="cursor-pointer text-xs font-medium">
                {path} · {changed ? "endret" : "uendret"}
              </summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {[
                  { content: before?.content ?? "Filen fantes ikke.", label: "Før" },
                  { content: after?.content ?? "Filen finnes ikke.", label: "Etter" },
                ].map(({ label, content }) => (
                  <div className="min-w-0 rounded-md bg-black/20 p-3" key={label}>
                    <p className="mb-2 text-[9px] text-muted-foreground uppercase">{label}</p>
                    <div className="max-h-64 overflow-auto text-xs">
                      <MessageResponse>{content}</MessageResponse>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Network className="size-4 text-violet-200" />
        Foreldre: {selected.parentSnapshotIds.length === 0 ? "startsnapshot" : selected.parentSnapshotIds.join(", ")}
      </div>
    </section>
  );
}
