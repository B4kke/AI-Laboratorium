"use client";

import type { ArenaSpec } from "@ai-lab/domain";
import {
  estimateProviderCalls,
  evolutionPopulationSchedule,
  type EvolutionProgress,
  type EvolutionRequest,
  type StoredEvolutionResult,
} from "@ai-lab/evolution";
import type { EvolutionFeedItem } from "@ai-lab/db";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Dna,
  FileDiff,
  FlaskConical,
  GitBranch,
  MemoryStick,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { AgentHistoryPanel } from "@/components/laboratory/agent-history-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  readApiResponse,
  type AgentLibraryResponse,
  type EvolutionEnqueueResponse,
  type EvolutionJobsResponse,
  type EvolutionStatusResponse,
  type ProviderCatalogEntry,
} from "@/lib/laboratory-types";

const storedEvolutionJobKey = "ai-lab:evolution-job:v1";

type RemoteProviderId = "nvidia-nim" | "opencode-zen";

type SlotOverrideDraft = {
  agentId: string;
  index: number;
  modelKey: string;
};

type EvolutionPanelProps = {
  accessToken: string;
  arenas: readonly ArenaSpec[];
  onAgentsChanged: () => Promise<void>;
  providers: readonly ProviderCatalogEntry[];
  savedAgents: AgentLibraryResponse["agents"];
};

function modelKey(providerId: RemoteProviderId, modelId: string): string {
  return `${providerId}:${encodeURIComponent(modelId)}`;
}

function authorizationHeaders(token: string): Record<string, string> {
  return token.length === 0 ? {} : { Authorization: `Bearer ${token}` };
}

function boundedInteger(raw: string, minimum: number, maximum: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function boundedEvenInteger(raw: string, minimum: number, maximum: number): number {
  const value = boundedInteger(raw, minimum, maximum);
  return value % 2 === 0 ? value : Math.min(maximum, value + 1);
}

function progressValue(progress: unknown): EvolutionProgress | null {
  if (typeof progress !== "object" || progress === null) return null;
  if (!("completedWork" in progress) || !("totalWork" in progress)) return null;
  const candidate = progress as Partial<EvolutionProgress>;
  return typeof candidate.completedWork === "number" && typeof candidate.totalWork === "number"
    ? (candidate as EvolutionProgress)
    : null;
}

export function EvolutionPanel({
  accessToken,
  arenas,
  onAgentsChanged,
  providers,
  savedAgents,
}: EvolutionPanelProps) {
  const [arenaId, setArenaId] = useState(arenas[0]?.id ?? "fangens-dilemma");
  const [seed, setSeed] = useState("evolusjon-2026");
  const [generationCount, setGenerationCount] = useState(10);
  const [populationSize, setPopulationSize] = useState(10);
  const [trialsPerCandidate, setTrialsPerCandidate] = useState(2);
  const [holdoutTrials, setHoldoutTrials] = useState(6);
  const [concurrency, setConcurrency] = useState(2);
  const [defaultModelKey, setDefaultModelKey] = useState("");
  const [mutationModelKey, setMutationModelKey] = useState("");
  const [slotOverrides, setSlotOverrides] = useState<SlotOverrideDraft[]>([]);
  const [resolvedAgents, setResolvedAgents] = useState<AgentLibraryResponse["agents"]>([]);
  const [enqueueing, setEnqueueing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedJob, setQueuedJob] = useState<
    EvolutionEnqueueResponse["job"] | EvolutionStatusResponse["job"] | null
  >(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(storedEvolutionJobKey),
  );
  const completedNotification = useRef<string | null>(null);
  const accessScope = accessToken.length === 0 ? "public" : "authenticated";
  const recentJobsQuery = useQuery({
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/evolution", {
        headers: authorizationHeaders(accessToken),
        signal,
      });
      return readApiResponse<EvolutionJobsResponse>(response);
    },
    queryKey: ["evolution-jobs", accessScope],
  });
  const jobStatusQuery = useQuery({
    enabled: activeJobId !== null,
    queryFn: async ({ signal }) => {
      if (activeJobId === null) throw new Error("Mangler evolution-jobb");
      const response = await fetch(`/api/evolution/${activeJobId}`, {
        headers: authorizationHeaders(accessToken),
        signal,
      });
      return readApiResponse<EvolutionStatusResponse>(response);
    },
    queryKey: ["evolution-job", activeJobId, accessScope],
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === "queued" || status === "running" || status === undefined
        ? 1_500
        : false;
    },
  });
  const recentJobs = recentJobsQuery.data?.jobs ?? [];
  const statusResponse = jobStatusQuery.data;
  const job = statusResponse?.job ?? queuedJob;
  const feed: readonly EvolutionFeedItem[] = statusResponse?.feed ?? [];
  const result: StoredEvolutionResult | null = job?.result ?? null;
  const jobIsRunning = job?.status === "queued" || job?.status === "running";
  const running = enqueueing || jobIsRunning;
  const queryError =
    jobStatusQuery.error ?? (recentJobsQuery.error !== null ? recentJobsQuery.error : null);
  const visibleError =
    error ??
    (job?.status === "failed" ? (job.error ?? "Evolution-jobben feilet") : null) ??
    (queryError instanceof Error ? queryError.message : null);

  useEffect(() => {
    const statusJob = statusResponse?.job;
    if (statusJob?.status === "completed" && statusJob.result !== null) {
      if (completedNotification.current !== statusJob.id) {
        completedNotification.current = statusJob.id;
        void Promise.all([onAgentsChanged(), recentJobsQuery.refetch()]);
      }
    }
  }, [onAgentsChanged, recentJobsQuery, statusResponse]);

  const remoteModels = useMemo(
    () =>
      providers.flatMap((provider) => {
        if (provider.id === "mock") return [];
        const providerId: RemoteProviderId = provider.id;
        return provider.models.map((model) => ({
          key: modelKey(providerId, model.id),
          label: `${provider.name} · ${model.displayName}`,
          modelId: model.id,
          providerId,
        }));
      }),
    [providers],
  );
  const remoteModelByKey = useMemo(
    () => new Map(remoteModels.map((model) => [model.key, model])),
    [remoteModels],
  );
  const allSavedAgents = useMemo(() => {
    const byId = new Map(
      [...resolvedAgents, ...savedAgents].map((agent) => [agent.agentId, agent]),
    );
    return [...byId.values()];
  }, [resolvedAgents, savedAgents]);
  const selectedDefaultKey = remoteModelByKey.has(defaultModelKey)
    ? defaultModelKey
    : (remoteModels[0]?.key ?? "");
  const selectedMutationKey = remoteModelByKey.has(mutationModelKey)
    ? mutationModelKey
    : selectedDefaultKey;
  const arena = arenas.find((entry) => entry.id === arenaId) ?? arenas[0];
  const estimatedProviderCalls = estimateProviderCalls(
    { generationCount, holdoutTrials, populationSize, trialsPerCandidate },
    arena?.rounds ?? 0,
  );
  const populationSchedule = evolutionPopulationSchedule(populationSize, generationCount);
  const progress = progressValue(job?.progress);
  const progressPercent =
    progress === null || progress.totalWork === 0
      ? 0
      : Math.min(100, (progress.completedWork / progress.totalWork) * 100);
  const range = useMemo(() => {
    const values = result?.generations.map(({ bestFitness }) => bestFitness) ?? [0];
    return { max: Math.max(...values), min: Math.min(...values) };
  }, [result]);
  const bestLibraryAgent = allSavedAgents.find(
    ({ agentId }) => agentId === result?.winner.agentId,
  );

  function updatePopulationSize(raw: string) {
    const next = boundedInteger(raw, 10, 100);
    setPopulationSize(next);
    setSlotOverrides((current) => current.filter(({ index }) => index < next));
  }

  function addOverride() {
    const used = new Set(slotOverrides.map(({ index }) => index));
    const index = Array.from({ length: populationSize }, (_, candidate) => candidate).find(
      (candidate) => !used.has(candidate),
    );
    if (index === undefined) return;
    setSlotOverrides((current) => [...current, { agentId: "fresh", index, modelKey: "default" }]);
  }

  function updateOverride(position: number, patch: Partial<SlotOverrideDraft>) {
    setSlotOverrides((current) =>
      current.map((override, index) =>
        index === position ? { ...override, ...patch } : override,
      ),
    );
  }

  async function selectAgentSerialForOverride(position: number, serialNumber: number) {
    setError(null);
    try {
      const response = await fetch(`/api/agents?serialNumber=${serialNumber}`, {
        headers: authorizationHeaders(accessToken),
      });
      const library = await readApiResponse<AgentLibraryResponse>(response);
      const found = library.agents[0];
      if (found === undefined) throw new Error(`Agent ${serialNumber} finnes ikke`);
      setResolvedAgents((current) => [
        found,
        ...current.filter(({ agentId }) => agentId !== found.agentId),
      ]);
      updateOverride(position, { agentId: found.agentId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Agent ${serialNumber} kunne ikke lastes`);
    }
  }

  async function startEvolution() {
    const defaultModel = remoteModelByKey.get(selectedDefaultKey);
    const mutationModel = remoteModelByKey.get(selectedMutationKey);
    if (defaultModel === undefined || mutationModel === undefined) {
      setError("Koble til minst én ekte modell før Evolution kan starte.");
      return;
    }
    const request: EvolutionRequest = {
      arenaId,
      concurrency,
      defaultModel: {
        modelId: defaultModel.modelId,
        providerId: defaultModel.providerId,
      },
      generationCount,
      holdoutTrials,
      mutationModel: {
        modelId: mutationModel.modelId,
        providerId: mutationModel.providerId,
      },
      populationSize,
      seed,
      slotOverrides: slotOverrides.flatMap((override) => {
        const model = remoteModelByKey.get(override.modelKey);
        if (override.agentId === "fresh" && model === undefined) return [];
        return [
          {
            ...(override.agentId === "fresh" ? {} : { agentId: override.agentId }),
            index: override.index,
            ...(model === undefined
              ? {}
              : { model: { modelId: model.modelId, providerId: model.providerId } }),
          },
        ];
      }),
      trialsPerCandidate,
    };
    setEnqueueing(true);
    setError(null);
    setQueuedJob(null);
    setActiveJobId(null);
    try {
      const enqueueResponse = await fetch("/api/evolution", {
        body: JSON.stringify(request),
        headers: {
          ...authorizationHeaders(accessToken),
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const queued = await readApiResponse<EvolutionEnqueueResponse>(enqueueResponse);
      setQueuedJob(queued.job);
      localStorage.setItem(storedEvolutionJobKey, queued.job.id);
      setActiveJobId(queued.job.id);
      await recentJobsQuery.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evolusjonen feilet");
    } finally {
      setEnqueueing(false);
    }
  }

  function openRecentJob(jobId: string) {
    setError(null);
    setQueuedJob(recentJobs.find(({ id }) => id === jobId) ?? null);
    localStorage.setItem(storedEvolutionJobKey, jobId);
    setActiveJobId(jobId);
  }

  function prepareWinnerForNextRun() {
    if (result === null) return;
    setSlotOverrides((current) => [
      { agentId: result.winner.agentId, index: 0, modelKey: "default" },
      ...current.filter(({ index }) => index !== 0),
    ]);
    setQueuedJob(null);
    setActiveJobId(null);
    localStorage.removeItem(storedEvolutionJobKey);
    setError(null);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="glass-panel h-fit rounded-2xl border border-white/8 p-5 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <div className="mb-6 flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200">
            <Dna className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Ekte agent-evolusjon</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Agentselvrefleksjon, hoved-AI, immutable SOUL.md-versjoner og persistent minne.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            Arena
            <Select value={arenaId} onValueChange={setArenaId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {arenas.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>{entry.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Evolusjonsrunder
              <Input
                max={100}
                min={1}
                onChange={(event) =>
                  setGenerationCount(boundedInteger(event.target.value, 1, 100))
                }
                type="number"
                value={generationCount}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Agenter
              <Input
                max={100}
                min={10}
                onChange={(event) => updatePopulationSize(event.target.value)}
                type="number"
                value={populationSize}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Dueller per agent (sidepar)
              <Input
                max={20}
                min={2}
                onChange={(event) =>
                  setTrialsPerCandidate(boundedEvenInteger(event.target.value, 2, 20))
                }
                step={2}
                type="number"
                value={trialsPerCandidate}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Holdout-dueller
              <Input
                max={40}
                min={4}
                onChange={(event) =>
                  setHoldoutTrials(boundedEvenInteger(event.target.value, 4, 40))
                }
                step={2}
                type="number"
                value={holdoutTrials}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Parallelle oppgaver
              <Input
                max={8}
                min={1}
                onChange={(event) => setConcurrency(boundedInteger(event.target.value, 1, 8))}
                type="number"
                value={concurrency}
              />
            </label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              Startverdi
              <Input
                maxLength={128}
                onChange={(event) => setSeed(event.target.value)}
                value={seed}
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            Standardmodell for alle
            <Select value={selectedDefaultKey} onValueChange={setDefaultModelKey}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Ingen ekte modell" /></SelectTrigger>
              <SelectContent>
                {remoteModels.map((model) => (
                  <SelectItem key={model.key} value={model.key}>{model.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            Hoved-AI som endrer SOUL.md, minne og taktikk
            <Select value={selectedMutationKey} onValueChange={setMutationModelKey}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Ingen mutasjonsmodell" /></SelectTrigger>
              <SelectContent>
                {remoteModels.map((model) => (
                  <SelectItem key={model.key} value={model.key}>{model.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="space-y-2 rounded-xl border border-white/7 bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">Overstyr enkelte plasser</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  Velg Agent 382 eller en egen modell. Standardmodellen fyller resten.
                </p>
              </div>
              <Button
                aria-label="Legg til agentoverstyring"
                disabled={slotOverrides.length >= populationSize}
                onClick={addOverride}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                <Plus />
              </Button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {slotOverrides.map((override, position) => (
                <div
                  className="space-y-2 rounded-lg border border-white/7 bg-white/[0.02] p-2 [content-visibility:auto]"
                  key={`${override.index}-${position}`}
                >
                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-[10px] text-muted-foreground">
                      Plass
                      <Input
                        className="h-8"
                        max={populationSize}
                        min={1}
                        onChange={(event) =>
                          updateOverride(position, {
                            index: boundedInteger(event.target.value, 1, populationSize) - 1,
                          })
                        }
                        type="number"
                        value={override.index + 1}
                      />
                    </label>
                    <Button
                      aria-label={`Fjern overstyring for plass ${override.index + 1}`}
                      onClick={() =>
                        setSlotOverrides((current) =>
                          current.filter((_entry, index) => index !== position),
                        )
                      }
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const serialNumber = Number(
                        new FormData(event.currentTarget).get("agentSerialNumber"),
                      );
                      if (Number.isSafeInteger(serialNumber) && serialNumber > 0) {
                        void selectAgentSerialForOverride(position, serialNumber);
                      }
                    }}
                  >
                    <Input
                      aria-label={`Finn agentnummer for plass ${override.index + 1}`}
                      className="h-8 min-w-0"
                      min={1}
                      name="agentSerialNumber"
                      placeholder="Agentnummer, f.eks. 382"
                      type="number"
                    />
                    <Button size="sm" type="submit" variant="outline">Hent</Button>
                  </form>
                  <Select
                    value={override.agentId}
                    onValueChange={(agentId) => updateOverride(position, { agentId })}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fresh">Ny agent med start-SOUL</SelectItem>
                      {allSavedAgents.map((savedAgent) => (
                        <SelectItem key={savedAgent.agentId} value={savedAgent.agentId}>
                          Agent {savedAgent.serialNumber} · {savedAgent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={override.modelKey}
                    onValueChange={(nextModelKey) =>
                      updateOverride(position, { modelKey: nextModelKey })
                    }
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Behold agentmodell / bruk standard</SelectItem>
                      {remoteModels.map((model) => (
                        <SelectItem key={model.key} value={model.key}>{model.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              [String(generationCount), "runder"],
              [String(populationSize), "agenter"],
              [estimatedProviderCalls.toLocaleString("nb-NO"), "modellkall"],
            ].map(([value, label]) => (
              <div className="rounded-lg border border-white/7 bg-black/15 p-2 text-center" key={label}>
                <p className="truncate font-mono text-sm text-cyan-100">{value}</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <p className="rounded-lg border border-white/7 bg-black/15 p-2 text-[10px] leading-4 text-muted-foreground">
            Eliminasjonsplan: {populationSchedule.join(" → ")} aktive før rundene, deretter én
            sluttmutert vinner. Kallestimatet er kun informasjon og stopper aldri kjøringen.
          </p>

          <Button
            className="mt-2 w-full"
            disabled={
              running ||
              seed.trim().length === 0 ||
              remoteModels.length === 0
            }
            onClick={startEvolution}
          >
            {running ? <RotateCw className="animate-spin" /> : <FlaskConical />}
            {running ? "Evolution kjører i worker…" : "Kølegg evolusjonsløp"}
          </Button>
          {remoteModels.length === 0 ? (
            <p className="text-[10px] leading-4 text-amber-100">
              Koble til en konfigurert ekstern modellkilde. Scripted baselines kan ikke drive Evolution.
            </p>
          ) : null}
          {recentJobs.length > 0 ? (
            <div className="space-y-2 border-t border-white/7 pt-4">
              <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                Nylige persistente jobber
              </p>
              {recentJobs.slice(0, 5).map((recent) => (
                <Button
                  className="h-auto w-full justify-between px-3 py-2 text-left"
                  key={recent.id}
                  onClick={() => void openRecentJob(recent.id)}
                  type="button"
                  variant="outline"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[9px]">{recent.id}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {recent.input.populationSize} agenter · {recent.input.generationCount} runder
                    </span>
                  </span>
                  <Badge variant="outline">{recent.status}</Badge>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      <main className="laboratory-grid min-h-[680px] rounded-2xl border border-white/8 bg-[#0d111b]/88 p-5 sm:p-7">
        {visibleError !== null ? (
          <div role="alert" className="mb-5 rounded-xl border border-red-300/15 bg-red-400/[0.06] p-4 text-sm text-red-100">
            {visibleError}
          </div>
        ) : null}

        {running ? (
          <section className="mb-6 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.035] p-4">
            <div className="mb-3 flex items-center justify-between gap-4 text-xs">
              <span className="text-cyan-100">
                {progress?.message ?? (job?.status === "queued" ? "Venter på Evolution-worker" : "Starter jobben")}
              </span>
              <span className="font-mono text-muted-foreground">{Math.round(progressPercent)} %</span>
            </div>
            <Progress value={progressPercent} />
            <p className="mt-2 font-mono text-[9px] text-muted-foreground">{job?.id}</p>
          </section>
        ) : null}

        {feed.length > 0 ? (
          <section className="mb-6 rounded-xl border border-white/8 bg-black/15 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Faktiske replikker fra Evolution</p>
              <Badge variant="outline">live fra lagrede dueller</Badge>
            </div>
            <div className="max-h-80 space-y-3 overflow-y-auto" aria-live="polite">
              {feed.slice(-16).map((item, index) => (
                <article
                  className="rounded-lg border border-white/7 bg-white/[0.02] p-3"
                  key={`${item.matchId}-${item.round}-${item.actorName}-${index}`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-semibold text-cyan-100">{item.actorName}</span>
                    <span className="text-muted-foreground">
                      Runde {item.generationNumber + 1} · spillrunde {item.round} · {item.actionId}
                    </span>
                  </div>
                  <div className="text-sm"><MessageResponse>{item.message}</MessageResponse></div>
                  <div className="mt-2 text-[10px] leading-4 text-muted-foreground">
                    <span className="font-medium">Kort beslutningsspor: </span>
                    <MessageResponse>{item.rationale}</MessageResponse>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {result === null ? (
          <div className="flex min-h-[560px] flex-col">
            <div>
              <Badge variant="outline" className="mb-3 border-white/10 text-cyan-200">
                PERSISTENT EVOLUSJON
              </Badge>
              <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                La faktiske modeller kjempe, lære og versjonere agentfilene.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Hvert valg leser gjeldende SOUL.md, filer og minne. Etter hver runde elimineres
                agenter. Hver overlevende foreslår sin egen endring før hoved-AI-en avgjør og
                versjonerer SOUL.md, minne og taktikk helt til én sluttmutert vinner står igjen.
              </p>
            </div>
            <div className="my-auto grid gap-3 py-10 sm:grid-cols-3">
              {[
                { Icon: ShieldCheck, text: "Samme arena, sidebytte og eksplisitte seeds. Operativ throttling påvirker aldri score.", title: "Kontrollerte forsøk" },
                { Icon: GitBranch, text: "SOUL.md, filer, minne, modell og foreldre lagres per snapshot.", title: "Slektslinje" },
                { Icon: Activity, text: "Champion krever positiv holdout-margin og 95 % Wilson-grense over 50 %.", title: "Usikkerhet" },
              ].map(({ Icon, title, text }) => (
                <div className="rounded-xl border border-white/8 bg-black/15 p-5" key={title}>
                  <Icon className="mb-4 size-5 text-cyan-200" />
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-emerald-200">
                  <ShieldCheck className="size-4" /> Jobben og agentartefaktene er lagret
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {result.generations.length} evolusjonsrunder fullført · én agent igjen
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {result.totalDuels} ekte modelldueller · {result.lineageCount} nye slektskapskanter · {result.hallOfFameSnapshotIds.length} i hall of fame
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5 bg-amber-300/12 text-amber-200">
                  <Trophy /> {bestLibraryAgent === undefined ? result.winner.name : `Agent ${bestLibraryAgent.serialNumber}`}
                </Badge>
                <Button onClick={prepareWinnerForNextRun} type="button" variant="outline">
                  <Dna /> Muter vinneren i nytt løp
                </Button>
              </div>
            </div>

            <section className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Sluttmutert vinner</p>
                <p className="mt-2 truncate font-mono text-sm text-cyan-100">{result.winner.id}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Modell</p>
                <p className="mt-2 truncate font-mono text-sm">{result.winner.modelId}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Holdout-vinnrate</p>
                <p className="mt-2 font-mono text-xl">{Math.round(result.championDecision.holdoutWinRate * 100)} %</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Holdout 95 % intervall</p>
                <p className="mt-2 font-mono text-xl">
                  {Math.round(result.championDecision.holdoutWinRateInterval.lower * 100)}–{Math.round(result.championDecision.holdoutWinRateInterval.upper * 100)} %
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-white/8 bg-black/15 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Champion-holdout</p>
                  <p className="mt-1 text-xs text-muted-foreground">Dataene var skjult for mutasjonsfasen.</p>
                </div>
                <Badge variant={result.championDecision.promoted ? "default" : "outline"}>
                  {result.championDecision.promoted ? "Promotert" : "Ikke promotert"}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Margin {result.championDecision.holdoutAverageMargin.toFixed(2)} · vinnrate {Math.round(result.championDecision.holdoutWinRate * 100)} % · {result.championDecision.holdoutSampleCount} dueller
              </p>
              <ul className="mt-2 space-y-1 text-xs text-foreground">
                {result.championDecision.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
            </section>

            <section className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileDiff className="size-4 text-cyan-200" />
                  <p className="text-sm font-semibold">Gjeldende SOUL.md</p>
                </div>
                <div className="max-h-72 overflow-auto text-xs leading-5 text-muted-foreground">
                  <MessageResponse>{result.winner.genome.soul}</MessageResponse>
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MemoryStick className="size-4 text-violet-200" />
                  <p className="text-sm font-semibold">Gjeldende minne</p>
                </div>
                <div className="max-h-72 space-y-2 overflow-auto">
                  {result.winner.memory.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ingen minner ble beholdt.</p>
                  ) : (
                    result.winner.memory.items.map((item) => (
                      <div className="rounded-lg border border-white/7 p-2 text-xs" key={`${item.sourceMatchId}-${item.content}`}>
                        <Badge variant="outline" className="mb-1 text-[9px]">{item.category}</Badge>
                        <div className="leading-5 text-muted-foreground">
                          <MessageResponse>{item.content}</MessageResponse>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/8 bg-black/15 p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Egnethet og eliminering per runde</p>
                  <p className="mt-1 text-xs text-muted-foreground">Aktive → overlevende, med beste målte fitness</p>
                </div>
                <Activity className="size-4 text-cyan-200" />
              </div>
              <div className="space-y-3">
                {result.generations.map((generation) => {
                  const width =
                    range.max === range.min
                      ? 100
                      : 18 +
                        ((generation.bestFitness - range.min) / (range.max - range.min)) * 82;
                  return (
                    <div className="grid grid-cols-[78px_1fr_54px] items-center gap-3" key={generation.generation.id}>
                      <span className="font-mono text-[10px] text-muted-foreground">G{generation.generation.number + 1}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400/55 to-cyan-200" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-right font-mono text-[10px]">{generation.bestFitness.toFixed(2)}</span>
                      <span className="col-span-3 text-[9px] text-muted-foreground">
                        {generation.activePopulationSize} aktive → {generation.survivorCount} muterte overlevende · {generation.eliminatedCount} eliminert
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <GitBranch className="size-4 text-violet-200" />
                <p className="text-sm font-semibold">Siste faktiske artefaktmutasjoner</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {result.recentMutations
                  .toReversed()
                  .map((mutation) => (
                    <div className="min-w-0 rounded-lg border border-white/7 bg-white/[0.02] p-3" key={mutation.lineageId}>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-[9px] text-muted-foreground">{mutation.parentSnapshotIds[0]?.slice(-8)}</span>
                        <ArrowRight className="size-3 shrink-0 text-violet-200" />
                        <span className="truncate font-mono text-[9px] text-foreground">{mutation.childSnapshotId.slice(-8)}</span>
                        <Badge variant="outline" className="ml-auto border-white/8 text-[9px]">{mutation.mutationOperator}</Badge>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        <MessageResponse>{mutation.summary}</MessageResponse>
                      </div>
                      <div className="mt-2 border-t border-white/7 pt-2 text-[10px] leading-4 text-muted-foreground">
                        <span className="font-medium text-violet-100">Agentens egen refleksjon: </span>
                        <MessageResponse>{mutation.selfReflectionSummary}</MessageResponse>
                      </div>
                      <p className="mt-2 text-[10px] text-cyan-100">
                        {mutation.changedFiles.join(", ")}
                        {mutation.memoryWriteCount > 0 ? ` · ${mutation.memoryWriteCount} minneskriv` : ""}
                      </p>
                    </div>
                  ))}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-4">
              {[
                [result.usage.providerCalls.toLocaleString("nb-NO"), "faktiske providerforsøk"],
                [result.usage.inputTokens.toLocaleString("nb-NO"), "input-tokens"],
                [result.usage.outputTokens.toLocaleString("nb-NO"), "output-tokens"],
                [String(result.finalPopulationSize), "aktiv sluttpopulasjon"],
              ].map(([value, label]) => (
                <div className="rounded-xl border border-white/8 bg-black/15 p-4" key={label}>
                  <p className="font-mono text-lg text-cyan-100">{value}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </section>

            <AgentHistoryPanel accessToken={accessToken} agentId={result.winner.agentId} />
          </div>
        )}
      </main>
    </div>
  );
}
