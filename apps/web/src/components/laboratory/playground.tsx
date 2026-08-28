"use client";

import {
  DuelResultSchema,
  EventEnvelopeSchema,
  type AgentConfiguration,
  type AgentSnapshot,
  type ArenaSpec,
  type DuelResult,
  type EventEnvelope,
} from "@ai-lab/domain";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EventSourceParserStream } from "eventsource-parser/stream";
import {
  AlertTriangle,
  Beaker,
  CodeXml,
  Plus,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
  type AgentDetailResponse,
  type AgentLibraryResponse,
  type CreateAgentResponse,
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
  soul: "Jeg er Astra. Jeg bygger tillit rolig, men krever samsvar mellom ord og handling.",
  strategy: "cooperative",
};

const initialAgentB: AgentConfiguration = {
  id: "agent_nova",
  modelId: "scripted-opportunist",
  name: "Nova",
  providerId: "mock",
  soul: "Jeg er Nova. Jeg er skarp, opportunistisk og utfordrer løfter som ikke kan etterprøves.",
  strategy: "opportunist",
};

type ArenaDraftResponse = {
  lintWarnings: readonly string[];
  source: "local-safe-designer" | "model";
  spec: ArenaSpec;
};

const DuelStreamMessageSchema = z.discriminatedUnion("kind", [
  z.object({ event: EventEnvelopeSchema, kind: z.literal("event") }).strict(),
  z
    .object({
      kind: z.literal("result"),
      reportToken: z.string().min(1).max(4_096),
      result: DuelResultSchema,
    })
    .strict(),
  z.object({ kind: z.literal("error"), message: z.string().min(1).max(1_000) }).strict(),
]);

const ArenaDesignerFormSchema = z.object({
  idea: z
    .string()
    .trim()
    .min(12, "Beskriv arenaen med minst 12 tegn")
    .max(2_000, "Beskrivelsen kan være maks 2 000 tegn"),
});

type ArenaDesignerForm = z.infer<typeof ArenaDesignerFormSchema>;

type PlaygroundProps = { initialArenas: readonly ArenaSpec[] };

function authorizationHeaders(token: string): Record<string, string> {
  return token.length === 0 ? {} : { Authorization: `Bearer ${token}` };
}

function configurationFromSnapshot(snapshot: AgentSnapshot): AgentConfiguration {
  return {
    files: snapshot.genome.files,
    genomeId: snapshot.genome.id,
    id: snapshot.agentId,
    memoryContext: snapshot.memory.items.map(({ category, content }) => ({ category, content })),
    memoryId: snapshot.memory.id,
    modelId: snapshot.modelId,
    name: snapshot.name,
    providerId: snapshot.providerId,
    snapshotId: snapshot.id,
    soul: snapshot.genome.soul,
    strategy: snapshot.strategy,
  };
}

function detachSnapshot(configuration: AgentConfiguration): AgentConfiguration {
  const next = { ...configuration };
  delete next.genomeId;
  delete next.memoryId;
  delete next.snapshotId;
  return next;
}

function buildLiveResult(
  liveArena: ArenaSpec,
  events: readonly EventEnvelope[],
): DuelResult | null {
  const first = events[0];
  if (first === undefined) return null;
  return {
    arena: liveArena,
    completedAt: first.occurredAt,
    events: [...events],
    matchId: first.matchId,
    providerSnapshots: [],
    replayFingerprint: "",
    scores: { a: 0, b: 0 },
    seed: first.seed,
    usage: { inputTokens: 0, outputTokens: 0, providerCalls: 0, totalTokens: 0 },
    winner: "draw",
  };
}

function parseDuelStreamMessage(data: string) {
  try {
    return DuelStreamMessageSchema.parse(JSON.parse(data));
  } catch (error) {
    throw new Error("Duellstrømmen inneholdt ugyldige data", { cause: error });
  }
}

export function Playground({ initialArenas }: PlaygroundProps) {
  const [mode, setMode] = useState<"duel" | "evolution">("duel");
  const [arenas, setArenas] = useState<readonly ArenaSpec[]>(initialArenas);
  const [arenaId, setArenaId] = useState(initialArenas[0]?.id ?? "fangens-dilemma");
  const [agentA, setAgentA] = useState<AgentConfiguration>(initialAgentA);
  const [agentB, setAgentB] = useState<AgentConfiguration>(initialAgentB);
  const [seed, setSeed] = useState("norsk-duell-42");
  const [result, setResult] = useState<DuelResult | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [designerMode, setDesignerMode] = useState<"local" | "model">("local");
  const [designing, setDesigning] = useState(false);
  const [designNotice, setDesignNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [runSerial, setRunSerial] = useState(0);
  const [providerAccessToken, setProviderAccessToken] = useState("");
  const [connectedAccessToken, setConnectedAccessToken] = useState("");
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [reportToken, setReportToken] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<DuelResult | null>(null);
  const [savedAgentOverride, setSavedAgentOverride] = useState<
    AgentLibraryResponse["agents"] | null
  >(null);
  const [savingAgent, setSavingAgent] = useState<"a" | "b" | null>(null);
  const queryClient = useQueryClient();
  const arenaDesignerForm = useForm<ArenaDesignerForm>({
    defaultValues: { idea: "" },
    mode: "onChange",
    resolver: zodResolver(ArenaDesignerFormSchema),
  });
  const providerCatalogQuery = useQuery({
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/providers", {
        headers: authorizationHeaders(connectedAccessToken),
        signal,
      });
      return readApiResponse<ProviderCatalogResponse>(response);
    },
    queryKey: ["provider-catalog", connectionRevision],
  });
  const agentLibraryQuery = useQuery({
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/agents", {
        headers: authorizationHeaders(connectedAccessToken),
        signal,
      });
      return readApiResponse<AgentLibraryResponse>(response);
    },
    queryKey: ["agent-library", connectionRevision],
  });
  const providers = providerCatalogQuery.data?.providers ?? initialProviders;
  const savedAgents = savedAgentOverride ?? agentLibraryQuery.data?.agents ?? [];
  const agentPersistence = agentLibraryQuery.data?.persistence ?? "not-configured";

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
    setLiveResult(null);
  }

  async function refreshAgentLibrary() {
    const { data: library } = await agentLibraryQuery.refetch();
    if (library === undefined) return;
    setSavedAgentOverride(library.agents);
  }

  async function connectModelSources() {
    const token = providerAccessToken.trim();
    const nextRevision = connectionRevision + 1;
    setConnecting(true);
    setError(null);
    try {
      const [providerResult, agentResult] = await Promise.allSettled([
        queryClient.fetchQuery({
          queryFn: async ({ signal }) => {
            const response = await fetch("/api/providers", {
              headers: authorizationHeaders(token),
              signal,
            });
            return readApiResponse<ProviderCatalogResponse>(response);
          },
          queryKey: ["provider-catalog", nextRevision],
        }),
        queryClient.fetchQuery({
          queryFn: async ({ signal }) => {
            const response = await fetch("/api/agents", {
              headers: authorizationHeaders(token),
              signal,
            });
            return readApiResponse<AgentLibraryResponse>(response);
          },
          queryKey: ["agent-library", nextRevision],
        }),
      ]);
      setConnectedAccessToken(token);
      setConnectionRevision(nextRevision);
      if (agentResult.status === "fulfilled") {
        setSavedAgentOverride(agentResult.value.agents);
      }
      if (providerResult.status === "fulfilled") {
        const remoteModel = providerResult.value.providers
          .filter(({ id }) => id !== "mock")
          .flatMap(({ models }) => models)[0];
        if (remoteModel !== undefined) {
          const useRemoteModel = (current: AgentConfiguration): AgentConfiguration =>
            current.providerId !== "mock"
              ? current
              : {
                  ...detachSnapshot(current),
                  modelId: remoteModel.id,
                  providerId: remoteModel.providerId,
                  strategy: "adaptive",
                };
          setAgentA(useRemoteModel);
          setAgentB(useRemoteModel);
        }
      }
      if (providerResult.status === "rejected" && agentResult.status === "rejected") {
        throw providerResult.reason;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Modellkildene kunne ikke kobles til");
    } finally {
      setConnecting(false);
    }
  }

  async function selectSavedAgent(side: "a" | "b", agentId: string | null) {
    if (agentId === null) {
      if (side === "a") setAgentA((current) => detachSnapshot(current));
      else setAgentB((current) => detachSnapshot(current));
      invalidateReplay();
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        headers: authorizationHeaders(connectedAccessToken),
      });
      const detail = await readApiResponse<AgentDetailResponse>(response);
      if (side === "a") setAgentA(configurationFromSnapshot(detail.snapshot));
      else setAgentB(configurationFromSnapshot(detail.snapshot));
      invalidateReplay();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agenten kunne ikke lastes");
    }
  }

  async function selectAgentBySerial(side: "a" | "b", serialNumber: number) {
    setError(null);
    try {
      const response = await fetch(`/api/agents?serialNumber=${serialNumber}`, {
        headers: authorizationHeaders(connectedAccessToken),
      });
      const library = await readApiResponse<AgentLibraryResponse>(response);
      const found = library.agents[0];
      if (found === undefined) throw new Error(`Agent ${serialNumber} finnes ikke`);
      setSavedAgentOverride((current) => [
        found,
        ...(current ?? savedAgents).filter(({ agentId }) => agentId !== found.agentId),
      ]);
      await selectSavedAgent(side, found.agentId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Agent ${serialNumber} kunne ikke lastes`);
    }
  }

  async function saveAgent(side: "a" | "b") {
    const agent = side === "a" ? agentA : agentB;
    setSavingAgent(side);
    setError(null);
    try {
      const response = await fetch("/api/agents", {
        body: JSON.stringify({
          files: agent.files ?? [],
          memory: agent.memoryContext ?? [],
          modelId: agent.modelId,
          name: agent.name,
          providerId: agent.providerId,
          soul: agent.soul,
          strategy: agent.strategy,
        }),
        headers: {
          ...authorizationHeaders(connectedAccessToken),
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const created = await readApiResponse<CreateAgentResponse>(response);
      setSavedAgentOverride((current) => [
        created.agent,
        ...(current ?? savedAgents).filter(({ agentId }) => agentId !== created.agent.agentId),
      ]);
      if (side === "a") setAgentA(configurationFromSnapshot(created.snapshot));
      else setAgentB(configurationFromSnapshot(created.snapshot));
      invalidateReplay();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agenten kunne ikke lagres");
    } finally {
      setSavingAgent(null);
    }
  }

  async function runQuickDuel() {
    if (arena === undefined) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setReportToken(null);
    setSelectedEvent(null);
    setLiveResult(null);
    try {
      const response = await fetch("/api/duels/stream", {
        body: JSON.stringify({ agentA, agentB, arenaId: arena.id, seed, swapSides: false }),
        headers: {
          ...(connectedAccessToken.length === 0
            ? {}
            : { Authorization: `Bearer ${connectedAccessToken}` }),
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      await consumeDuelStream(response, arena);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Duellen kunne ikke kjøres");
    } finally {
      setLoading(false);
      setLiveResult(null);
    }
  }

  async function consumeDuelStream(response: Response, liveArena: ArenaSpec) {
    if (!response.ok || response.body === null) {
      let message = "Duellen kunne ikke kjøres";
      try {
        const data = (await response.json()) as { error?: unknown };
        if (typeof data.error === "string") message = data.error;
      } catch {
        // Behold standardmeldingen når feilresponsen ikke er lesbar JSON.
      }
      throw new Error(message);
    }
    if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
      throw new Error("Duellserveren returnerte ikke en hendelsesstrøm");
    }
    const eventStream = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new EventSourceParserStream({
          maxBufferSize: 4 * 1_024 * 1_024,
          onError: "terminate",
        }),
      );
    const reader = eventStream.getReader();
    const events: EventEnvelope[] = [];
    let completed = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const message = parseDuelStreamMessage(value.data);
        if (message.kind === "event") {
          if (message.event.sequence !== events.length) {
            throw new Error("Duellstrømmen kom i uventet rekkefølge");
          }
          events.push(message.event);
          setLiveResult(buildLiveResult(liveArena, events));
        } else if (message.kind === "result") {
          if (completed) throw new Error("Duellstrømmen inneholdt flere sluttresultater");
          completed = true;
          setResult(message.result);
          setReportToken(message.reportToken);
          setSelectedEvent(message.result.events[0] ?? null);
          setRunSerial((value) => value + 1);
        } else {
          throw new Error(message.message);
        }
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (!completed) throw new Error("Duellstrømmen ble avsluttet før sluttresultatet kom");
  }

  async function createArena({ idea }: ArenaDesignerForm) {
    setDesigning(true);
    setError(null);
    setDesignNotice(null);
    try {
      const useModel = designerMode === "model" && remoteDesignerAvailable;
      const response = await fetch("/api/arena/design", {
        body: JSON.stringify({
          idea,
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
      arenaDesignerForm.reset();
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
          <EvolutionPanel
            accessToken={connectedAccessToken}
            arenas={initialArenas}
            onAgentsChanged={refreshAgentLibrary}
            providers={providers}
            savedAgents={savedAgents}
          />
        ) : arena === undefined ? (
          <p>Ingen arenaer er tilgjengelige.</p>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)_300px]">
            <aside className="glass-panel h-fit rounded-2xl border border-white/8 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
              <div className="border-b border-white/7 p-5">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold">Eksperimentoppsett</p><p className="mt-1 text-xs text-muted-foreground">Ekte modell eller merket kontroll</p></div>
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
                  <form
                    className="space-y-3 rounded-xl border border-white/7 bg-black/15 p-3"
                    onSubmit={arenaDesignerForm.handleSubmit(createArena)}
                  >
                    <Textarea
                      aria-label="Beskriv en ny arena"
                      aria-invalid={arenaDesignerForm.formState.errors.idea !== undefined}
                      className="min-h-24 resize-none text-xs"
                      maxLength={2_000}
                      placeholder="Eksempel: To AI-er forhandler om en knapp energireserve…"
                      {...arenaDesignerForm.register("idea")}
                    />
                    {arenaDesignerForm.formState.errors.idea !== undefined ? (
                      <p className="text-[10px] leading-4 text-red-200">
                        {arenaDesignerForm.formState.errors.idea.message}
                      </p>
                    ) : null}
                    <Select value={designerMode} onValueChange={(value: "local" | "model") => setDesignerMode(value)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Sikker lokal mal</SelectItem>
                        <SelectItem value="model" disabled={!remoteDesignerAvailable}>Agent As modell</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      className="w-full"
                      disabled={designing || !arenaDesignerForm.formState.isValid}
                      size="sm"
                      type="submit"
                      variant="secondary"
                    >
                      <Sparkles /> {designing ? "Validerer…" : "Lag validert arena"}
                    </Button>
                    {designNotice !== null && <p className="text-[10px] leading-4 text-emerald-200">{designNotice}</p>}
                  </form>
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
                    disabled={connecting || providerAccessToken.trim().length === 0}
                    onClick={() => void connectModelSources()}
                    size="sm"
                    variant="outline"
                  >
                    <ShieldCheck /> {connecting ? "Kobler til…" : "Koble til modellkildene"}
                  </Button>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Nøkkelen holdes kun i denne fanens minne og sendes som Bearer-header.
                  </p>
                </div>

                <Separator />
                <AgentConfig
                  accent="cyan"
                  agent={agentA}
                  label="Agent A"
                  onChange={(value) => { setAgentA(value); invalidateReplay(); }}
                  onSave={() => saveAgent("a")}
                  onSelectAgentSerial={(serialNumber) => selectAgentBySerial("a", serialNumber)}
                  onSelectSavedAgent={(agentId) => selectSavedAgent("a", agentId)}
                  persistenceConfigured={agentPersistence === "postgres"}
                  providers={providers}
                  savedAgents={savedAgents}
                  saving={savingAgent === "a"}
                />
                <AgentConfig
                  accent="violet"
                  agent={agentB}
                  label="Agent B"
                  onChange={(value) => { setAgentB(value); invalidateReplay(); }}
                  onSave={() => saveAgent("b")}
                  onSelectAgentSerial={(serialNumber) => selectAgentBySerial("b", serialNumber)}
                  onSelectSavedAgent={(agentId) => selectSavedAgent("b", agentId)}
                  persistenceConfigured={agentPersistence === "postgres"}
                  providers={providers}
                  savedAgents={savedAgents}
                  saving={savingAgent === "b"}
                />

                <label className="grid gap-1.5 text-xs text-muted-foreground">
                  Startverdi
                  <Input maxLength={128} value={seed} onChange={(event) => { setSeed(event.target.value); invalidateReplay(); }} />
                </label>
                <Button className="h-11 w-full" disabled={loading || seed.trim().length === 0 || agentA.name.trim().length === 0 || agentB.name.trim().length === 0} onClick={runQuickDuel}>
                  <Swords /> {loading ? "Kjører duell…" : "Start hurtigduell"}
                </Button>
                <div className="flex gap-2 rounded-lg border border-emerald-300/10 bg-emerald-300/[0.035] p-3 text-[10px] leading-4 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-200" />
                  Modellkatalogen følger serverens free-only-policy. Ingen API-nøkler sendes til nettleseren.
                </div>
              </div>
            </aside>

            <DuelStage
              agentA={agentA}
              agentB={agentB}
              arena={arena}
              key={`${result?.matchId ?? "preview"}-${runSerial}`}
              live={liveResult !== null}
              loading={loading}
              onSelectEvent={setSelectedEvent}
              result={liveResult ?? result}
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
