"use client";

import type { AgentConfiguration, ArenaSpec, DuelResult, EventEnvelope } from "@ai-lab/domain";
import { AlertTriangle, Beaker, CodeXml, Plus, ShieldCheck, Sparkles, Swords, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { AgentConfig } from "@/components/laboratory/agent-config";
import { DuelStage } from "@/components/laboratory/duel-stage";
import { Inspector } from "@/components/laboratory/inspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  readApiResponse,
  type ProviderCatalogEntry,
  type ProviderCatalogResponse,
} from "@/lib/laboratory-types";
import { cn } from "@/lib/utils";

const EvolutionPanel = dynamic(
  () => import("@/components/laboratory/evolution-panel").then((module) => module.EvolutionPanel),
  {
    loading: () => (
      <div className="grid min-h-[680px] place-items-center rounded-2xl border border-white/8 bg-[#0d111b]/88 text-sm text-muted-foreground">
        Laster evolusjonslaboratoriet…
      </div>
    ),
    ssr: false,
  },
);

const localModels = [
  ["scripted-adaptive", "Adaptiv baseline"],
  ["scripted-cooperative", "Samarbeidende baseline"],
  ["scripted-opportunist", "Opportunistisk baseline"],
  ["scripted-risk-averse", "Forsiktig baseline"],
  ["scripted-unpredictable", "Uforutsigbar baseline"],
] as const;

const initialProviders: readonly ProviderCatalogEntry[] = [
  {
    health: { message: "Deterministisk lokal modellkilde er klar", status: "available" },
    id: "mock",
    models: localModels.map(([id, displayName]) => ({
      displayName,
      endpointFamily: "local-scripted",
      freeClassification: "confirmed-free",
      id,
      providerId: "mock",
      supportsStructuredOutput: true,
      supportsTools: false,
    })),
    name: "Lokale baselines",
  },
];

const initialAgentA: AgentConfiguration = {
  id: "agent_astra",
  modelId: "scripted-cooperative",
  name: "Astra",
  providerId: "mock",
  strategy: "cooperative",
};

const initialAgentB: AgentConfiguration = {
  id: "agent_nova",
  modelId: "scripted-opportunist",
  name: "Nova",
  providerId: "mock",
  strategy: "opportunist",
};

type ArenaDraftResponse = {
  lintWarnings: readonly string[];
  source: "local-safe-designer" | "model";
  spec: ArenaSpec;
};

type DuelApiResponse = DuelResult & { reportToken: string };

type PlaygroundProps = { initialArenas: readonly ArenaSpec[] };

export function Playground({ initialArenas }: PlaygroundProps) {
  const [mode, setMode] = useState<"duel" | "evolution">("duel");
  const [arenas, setArenas] = useState<readonly ArenaSpec[]>(initialArenas);
  const [arenaId, setArenaId] = useState(initialArenas[0]?.id ?? "fangens-dilemma");
  const [agentA, setAgentA] = useState<AgentConfiguration>(initialAgentA);
  const [agentB, setAgentB] = useState<AgentConfiguration>(initialAgentB);
  const [providers, setProviders] = useState<readonly ProviderCatalogEntry[]>(initialProviders);
  const [seed, setSeed] = useState("norsk-duell-42");
  const [result, setResult] = useState<DuelResult | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [designerIdea, setDesignerIdea] = useState("");
  const [designerMode, setDesignerMode] = useState<"local" | "model">("local");
  const [designing, setDesigning] = useState(false);
  const [designNotice, setDesignNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [runSerial, setRunSerial] = useState(0);
  const [providerAccessToken, setProviderAccessToken] = useState("");
  const [connectedAccessToken, setConnectedAccessToken] = useState("");
  const [reportToken, setReportToken] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProviders() {
      try {
        const response = await fetch("/api/providers", {
          headers:
            connectedAccessToken.length === 0
              ? {}
              : { Authorization: `Bearer ${connectedAccessToken}` },
          signal: controller.signal,
        });
        const catalog = await readApiResponse<ProviderCatalogResponse>(response);
        if (catalog.providers.some(({ id }) => id === "mock")) setProviders(catalog.providers);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setProviders(initialProviders);
        }
      }
    }
    void loadProviders();
    return () => controller.abort();
  }, [connectedAccessToken]);

  const arena = useMemo(
    () => arenas.find(({ id }) => id === arenaId) ?? arenas[0],
    [arenaId, arenas],
  );
  const remoteDesignerAvailable = agentA.providerId !== "mock";
  const configuredCount = providers.filter(({ models }) => models.length > 0).length;

  function invalidateReplay() {
    setResult(null);
    setReportToken(null);
    setSelectedEvent(null);
    setError(null);
  }

  async function runQuickDuel() {
    if (arena === undefined) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedEvent(null);
    try {
      const response = await fetch("/api/duels", {
        body: JSON.stringify({ agentA, agentB, arenaId: arena.id, seed, swapSides: false }),
        headers: {
          ...(connectedAccessToken.length === 0
            ? {}
            : { Authorization: `Bearer ${connectedAccessToken}` }),
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const duel = await readApiResponse<DuelApiResponse>(response);
      const { reportToken: issuedReportToken, ...duelResult } = duel;
      setResult(duelResult);
      setReportToken(issuedReportToken);
      setSelectedEvent(duelResult.events[0] ?? null);
      setRunSerial((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Duellen kunne ikke kjøres");
    } finally {
      setLoading(false);
    }
  }

  async function createArena() {
    setDesigning(true);
    setError(null);
    setDesignNotice(null);
    try {
      const useModel = designerMode === "model" && remoteDesignerAvailable;
      const response = await fetch("/api/arena/design", {
        body: JSON.stringify({
          idea: designerIdea,
          ...(useModel ? { modelId: agentA.modelId, providerId: agentA.providerId } : {}),
        }),
        headers: {
          ...(connectedAccessToken.length === 0
            ? {}
            : { Authorization: `Bearer ${connectedAccessToken}` }),
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const draft = await readApiResponse<ArenaDraftResponse>(response);
      setArenas((current) => [draft.spec, ...current.filter(({ id }) => id !== draft.spec.id)]);
      setArenaId(draft.spec.id);
      invalidateReplay();
      setDesignNotice(
        `${draft.source === "model" ? "Modellforslaget" : "Den sikre malen"} er validert og klar.${draft.lintWarnings.length > 0 ? ` ${draft.lintWarnings[0]}` : ""}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Arenaen kunne ikke opprettes");
    } finally {
      setDesigning(false);
    }
  }

  async function exportReport(format: "html" | "json" | "pdf") {
    if (result === null || reportToken === null) return;
    setExporting(format);
    setError(null);
    try {
      const response = await fetch(`/api/reports/duel?format=${format}`, {
        body: JSON.stringify({ reportToken, result }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        await readApiResponse<never>(response);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `duellrapport-${result.matchId}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rapporten kunne ikke lastes ned");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/7 bg-[#080a10]/82 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1720px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
              <Beaker className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight sm:text-base">AI-Laboratorium</p>
              <p className="hidden text-[10px] tracking-[0.16em] text-muted-foreground uppercase sm:block">Reproduserbare agenteksperimenter</p>
            </div>
          </div>

          <nav aria-label="Hovedvisning" className="flex rounded-lg border border-white/8 bg-white/[0.025] p-1">
            <button
              aria-pressed={mode === "duel"}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === "duel" ? "bg-white/9 text-white" : "text-muted-foreground hover:text-white")}
              onClick={() => setMode("duel")}
              type="button"
            >Duell</button>
            <button
              aria-pressed={mode === "evolution"}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === "evolution" ? "bg-white/9 text-white" : "text-muted-foreground hover:text-white")}
              onClick={() => setMode("evolution")}
              type="button"
            >Evolusjon</button>
          </nav>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden gap-1.5 border-emerald-300/15 text-[10px] text-emerald-200 md:flex">
              <span className="size-1.5 rounded-full bg-emerald-300" /> {configuredCount} modellkilde{configuredCount === 1 ? "" : "r"}
            </Badge>
            <Button asChild size="icon-sm" variant="ghost">
              <a aria-label="Åpne prosjektet på GitHub" href="https://github.com/B4kke/AI-Laboratorium" rel="noreferrer" target="_blank"><CodeXml /></a>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1720px] px-4 py-5 sm:px-6 sm:py-7">
        {error !== null && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-red-300/15 bg-red-400/[0.06] p-4 text-sm text-red-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /><p className="flex-1">{error}</p>
            <button aria-label="Lukk feilmelding" onClick={() => setError(null)} type="button"><X className="size-4" /></button>
          </div>
        )}

        {mode === "evolution" ? (
          <EvolutionPanel arenas={initialArenas} />
        ) : arena === undefined ? (
          <p>Ingen arenaer er tilgjengelige.</p>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)_300px]">
            <aside className="glass-panel h-fit rounded-2xl border border-white/8 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
              <div className="border-b border-white/7 p-5">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold">Eksperimentoppsett</p><p className="mt-1 text-xs text-muted-foreground">Hurtigduell · deterministisk</p></div>
                  <Swords className="size-4 text-cyan-200" />
                </div>
              </div>
              <div className="space-y-5 p-4">
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  Arena
                  <Select
                    value={arena.id}
                    onValueChange={(value) => { setArenaId(value); invalidateReplay(); }}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {arenas.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>

                <button
                  className="flex w-full items-center justify-between rounded-xl border border-dashed border-cyan-300/16 bg-cyan-300/[0.035] p-3 text-left transition-colors hover:bg-cyan-300/[0.065]"
                  onClick={() => setDesignerOpen((value) => !value)}
                  type="button"
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-cyan-100"><Sparkles className="size-4" /> Arenadesigner</span>
                  <Plus className={cn("size-4 transition-transform", designerOpen && "rotate-45")} />
                </button>

                {designerOpen && (
                  <div className="space-y-3 rounded-xl border border-white/7 bg-black/15 p-3">
                    <Textarea
                      aria-label="Beskriv en ny arena"
                      className="min-h-24 resize-none text-xs"
                      maxLength={2_000}
                      onChange={(event) => setDesignerIdea(event.target.value)}
                      placeholder="Eksempel: To AI-er forhandler om en knapp energireserve…"
                      value={designerIdea}
                    />
                    <Select value={designerMode} onValueChange={(value: "local" | "model") => setDesignerMode(value)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Sikker lokal mal</SelectItem>
                        <SelectItem value="model" disabled={!remoteDesignerAvailable}>Agent As modell</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button className="w-full" disabled={designing || designerIdea.trim().length < 12} onClick={createArena} size="sm" variant="secondary">
                      <Sparkles /> {designing ? "Validerer…" : "Lag validert arena"}
                    </Button>
                    {designNotice !== null && <p className="text-[10px] leading-4 text-emerald-200">{designNotice}</p>}
                  </div>
                )}

                <div className="space-y-2 rounded-xl border border-white/7 bg-black/15 p-3">
                  <label className="grid gap-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                    Tilgang til eksterne modeller
                    <Input
                      autoComplete="off"
                      onChange={(event) => setProviderAccessToken(event.target.value)}
                      placeholder="AI_LAB_ACCESS_TOKEN"
                      type="password"
                      value={providerAccessToken}
                    />
                  </label>
                  <Button
                    className="w-full"
                    disabled={providerAccessToken.trim().length === 0}
                    onClick={() => setConnectedAccessToken(providerAccessToken.trim())}
                    size="sm"
                    variant="outline"
                  >
                    <ShieldCheck /> Koble til modellkildene
                  </Button>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Nøkkelen holdes kun i denne fanens minne og sendes som Bearer-header.
                  </p>
                </div>

                <Separator />
                <AgentConfig accent="cyan" agent={agentA} label="Agent A" onChange={(value) => { setAgentA(value); invalidateReplay(); }} providers={providers} />
                <AgentConfig accent="violet" agent={agentB} label="Agent B" onChange={(value) => { setAgentB(value); invalidateReplay(); }} providers={providers} />

                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  Startverdi
                  <Input maxLength={128} value={seed} onChange={(event) => { setSeed(event.target.value); invalidateReplay(); }} />
                </label>
                <Button className="h-11 w-full" disabled={loading || seed.trim().length === 0 || agentA.name.trim().length === 0 || agentB.name.trim().length === 0} onClick={runQuickDuel}>
                  <Swords /> {loading ? "Kjører duell…" : "Start hurtigduell"}
                </Button>
                <div className="flex gap-2 rounded-lg border border-emerald-300/10 bg-emerald-300/[0.035] p-3 text-[10px] leading-4 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-200" />
                  Bare eksplisitt bekreftede gratis-modeller vises. Ingen API-nøkler sendes til nettleseren.
                </div>
              </div>
            </aside>

            <DuelStage
              agentA={agentA}
              agentB={agentB}
              arena={arena}
              key={`${result?.matchId ?? "preview"}-${runSerial}`}
              loading={loading}
              onSelectEvent={setSelectedEvent}
              result={result}
            />

            <Inspector
              arena={arena}
              exporting={exporting}
              onExport={exportReport}
              result={result}
              selectedEvent={selectedEvent}
            />
          </div>
        )}
      </div>

      <footer className="mx-auto flex max-w-[1720px] flex-col gap-2 border-t border-white/6 px-4 py-6 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>AI-Laboratorium · bygget for etterprøvbare, norske AI-eksperimenter.</p>
        <p>Ingen skjult tankerekke · hendelser kan bare legges til · versjonerte arenaer</p>
      </footer>
    </div>
  );
}
