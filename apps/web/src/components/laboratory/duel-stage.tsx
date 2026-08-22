"use client";

import type { AgentConfiguration, ArenaSpec, DuelResult, EventEnvelope } from "@ai-lab/domain";
import { parseEventPayload, projectDuel, toReadableEvent } from "@ai-lab/events";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Circle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const DecisionMessage = dynamic(
  () => import("@/components/laboratory/decision-message").then((module) => module.DecisionMessage),
  { ssr: false },
);

type DuelStageProps = {
  agentA: AgentConfiguration;
  agentB: AgentConfiguration;
  arena: ArenaSpec;
  live?: boolean;
  loading: boolean;
  onSelectEvent: (event: EventEnvelope) => void;
  result: DuelResult | null;
};

function AgentOrb({
  active,
  agent,
  lastAction,
  score,
  side,
}: {
  active: boolean;
  agent: AgentConfiguration;
  lastAction?: string | undefined;
  score: number;
  side: "a" | "b";
}) {
  const cyan = side === "a";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <div
        className={cn(
          "relative mb-4 grid size-20 place-items-center rounded-full border bg-[#111622] transition-all duration-500 sm:size-24",
          cyan ? "border-cyan-300/25 text-cyan-200" : "border-violet-300/25 text-violet-200",
          active && "active-agent agent-orbit scale-[1.03]",
        )}
      >
        <Bot className="size-8 sm:size-10" strokeWidth={1.35} />
        <span
          className={cn(
            "absolute right-0 bottom-1 size-3 rounded-full border-2 border-[#111622]",
            active ? "live-pulse bg-emerald-300" : "bg-slate-600",
          )}
        />
      </div>
      <p className="max-w-full truncate text-sm font-semibold sm:text-base">{agent.name}</p>
      <p className="mt-1 max-w-36 truncate font-mono text-[10px] text-muted-foreground sm:text-xs">
        {agent.modelId}
      </p>
      <Badge
        variant="outline"
        className={cn(
          "mt-3 max-w-36 border-white/8 text-[10px]",
          lastAction === undefined ? "text-muted-foreground" : cyan ? "text-cyan-200" : "text-violet-200",
        )}
      >
        {lastAction ?? "venter på handling"}
      </Badge>
      <p className="mt-4 font-mono text-3xl font-semibold tracking-tight sm:text-4xl">{score}</p>
      <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">poeng</p>
    </div>
  );
}

function EmptyStage({ agentA, agentB, arena, loading }: Omit<DuelStageProps, "onSelectEvent" | "result">) {
  return (
    <div className="laboratory-grid flex min-h-[620px] flex-col rounded-2xl border border-white/8 bg-[#0d111b]/85 p-5 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-cyan-200">
            <Circle className="size-2 fill-current" /> SANNTIDARENA
          </div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{arena.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{arena.description}</p>
        </div>
        <Badge variant="outline" className="border-white/10 font-mono text-[10px]">v{arena.version}</Badge>
      </div>

      <div className="my-auto flex items-center justify-center gap-4 py-16 sm:gap-10">
        <AgentOrb active={loading} agent={agentA} score={arena.initialScore} side="a" />
        <div className="flex shrink-0 flex-col items-center gap-3 text-muted-foreground">
          <div className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/25">
            <Swords className="size-5" />
          </div>
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase">
            {loading ? "starter…" : `${arena.rounds} runder`}
          </span>
        </div>
        <AgentOrb active={loading} agent={agentB} score={arena.initialScore} side="b" />
      </div>

      <div className="rounded-xl border border-dashed border-white/10 bg-black/15 p-5 text-center">
        <Sparkles className="mx-auto mb-2 size-5 text-cyan-200" />
        <p className="text-sm font-medium">{loading ? "Motoren kjører den seedede duellen" : "Arenaen er klar"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {loading ? "Beslutninger valideres før tilstandsendringen." : "Start duellen for å se hendelser og avspilling."}
        </p>
      </div>
    </div>
  );
}

export function DuelStage(props: DuelStageProps) {
  const { agentA, agentB, live = false, onSelectEvent, result } = props;
  const [position, setPosition] = useState(() => (result === null ? 0 : Math.min(1, result.events.length)));
  const [playing, setPlaying] = useState(result !== null);

  useEffect(() => {
    if (result === null || live) return;
    if (!playing || position >= result.events.length) return;
    const timer = window.setInterval(() => {
      setPosition((current) => {
        if (current >= result.events.length) {
          return current;
        }
        return current + 1;
      });
    }, 620);
    return () => window.clearInterval(timer);
  }, [live, playing, position, result]);

  const effectivePosition = live ? (result?.events.length ?? position) : position;

  const visibleEvents = useMemo(
    () => (result === null ? [] : result.events.slice(0, effectivePosition)),
    [effectivePosition, result],
  );
  const projection = useMemo(() => projectDuel(visibleEvents), [visibleEvents]);
  const activeEvent = visibleEvents.at(-1);
  const lastAAction = visibleEvents.findLast(
    (event) => event.type === "action.accepted" && event.actorId === agentA.id,
  );
  const lastBAction = visibleEvents.findLast(
    (event) => event.type === "action.accepted" && event.actorId === agentB.id,
  );

  if (result === null) return <EmptyStage {...props} />;

  const actionLabel = (event: EventEnvelope | undefined) =>
    event?.type === "action.accepted"
      ? parseEventPayload(event.type, event.payload).actionLabel
      : undefined;
  const finished = !live && effectivePosition >= result.events.length;

  return (
    <div className="laboratory-grid flex min-h-[680px] flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#0d111b]/88">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/7 px-5 py-5 sm:px-7">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium tracking-[0.14em] text-cyan-200 uppercase">
            <Circle className={cn("size-2 fill-current", (!finished || live) && "live-pulse")} />
            {live ? "Direkte strøm" : finished ? "Avspilling fullført" : "Avspilling pågår"}
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{result.arena.title}</h2>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="border-white/10 font-mono text-[10px]">
            Runde {projection.currentRound}/{result.arena.rounds}
          </Badge>
          {finished && (
            <Badge className="gap-1.5 bg-amber-300/12 text-amber-200">
              <Trophy className="size-3" />
              {result.winner === "draw" ? "Uavgjort" : `${result.winner === "a" ? agentA.name : agentB.name} vant`}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid flex-1 gap-5 p-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(320px,1.15fr)] lg:p-7">
        <div className="flex min-h-[330px] flex-col rounded-xl border border-white/7 bg-black/15 p-5">
          <div className="my-auto flex items-center justify-center gap-4 sm:gap-8">
            <AgentOrb
              active={activeEvent?.actorId === agentA.id}
              agent={agentA}
              lastAction={actionLabel(lastAAction)}
              score={projection.scores.a}
              side="a"
            />
            <div className="flex shrink-0 flex-col items-center gap-2 text-muted-foreground">
              <Swords className="size-5" />
              <span className="font-mono text-[9px] uppercase">mot</span>
            </div>
            <AgentOrb
              active={activeEvent?.actorId === agentB.id}
              agent={agentB}
              lastAction={actionLabel(lastBAction)}
              score={projection.scores.b}
              side="b"
            />
          </div>
          <div className="mt-5 rounded-lg border border-white/7 bg-black/20 px-4 py-3">
            <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Siste motorhendelse</p>
            <p className="mt-1.5 text-sm leading-5">
              {activeEvent === undefined ? "Duellen initialiseres." : toReadableEvent(activeEvent).title}
            </p>
          </div>
        </div>

        <div className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-white/7 bg-black/15">
          <div className="flex items-center justify-between border-b border-white/7 px-4 py-3">
            <p className="text-xs font-semibold tracking-[0.12em] uppercase">Observerbar strøm</p>
            <span className="font-mono text-[10px] text-muted-foreground">{effectivePosition}/{result.events.length}</span>
          </div>
          <ScrollArea className="h-[380px] flex-1 px-4 py-4">
            <div className="space-y-3 pr-3">
              {visibleEvents.map((event) => {
                const readable = toReadableEvent(event);
                if (event.type === "agent.decided") {
                  const payload = parseEventPayload(event.type, event.payload);
                  const fromA = event.actorId === agentA.id;
                  return (
                    <button
                      className="block w-full text-left"
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                      type="button"
                    >
                      <DecisionMessage
                        actorName={payload.actorName}
                        confidence={payload.trace.confidence}
                        fromA={fromA}
                        message={payload.trace.message}
                        rationale={payload.trace.rationale}
                        scripted={(fromA ? agentA : agentB).providerId === "mock"}
                      />
                    </button>
                  );
                }
                return (
                  <button
                    className="group flex w-full gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.035]"
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    type="button"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-500 group-hover:bg-cyan-300" />
                    <span>
                      <span className="block text-xs font-medium">{readable.title}</span>
                      {readable.description !== undefined && (
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{readable.description}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="border-t border-white/7 bg-black/20 px-5 py-4 sm:px-7">
        <Progress value={(effectivePosition / result.events.length) * 100} className="mb-3 h-1" />
        {live ? (
          <p className="text-[10px] leading-4 text-cyan-200/80">
            Hendelser vises etter hvert som motoren validerer dem. Avspilling og rapport låses opp
            når duellen er fullført.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button
                aria-label="Start replay på nytt"
                size="icon-sm"
                variant="ghost"
                onClick={() => { setPosition(1); setPlaying(true); }}
              >
                <RotateCcw />
              </Button>
              <Button
                aria-label="Forrige hendelse"
                size="icon-sm"
                variant="ghost"
                onClick={() => { setPlaying(false); setPosition((value) => Math.max(1, value - 1)); }}
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label={playing ? "Sett replay på pause" : "Spill replay"}
                size="icon"
                onClick={() => setPlaying((value) => !value)}
              >
                {playing && !finished ? <Pause /> : <Play />}
              </Button>
              <Button
                aria-label="Neste hendelse"
                size="icon-sm"
                variant="ghost"
                onClick={() => { setPlaying(false); setPosition((value) => Math.min(result.events.length, value + 1)); }}
              >
                <ChevronRight />
              </Button>
            </div>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {result.replayFingerprint}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
