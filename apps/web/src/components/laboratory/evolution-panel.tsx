"use client";

import type { ArenaSpec } from "@ai-lab/domain";
import type { EvolutionResult } from "@ai-lab/evolution";
import { Activity, ArrowRight, Dna, FlaskConical, GitBranch, RotateCw, ShieldCheck, Trophy } from "lucide-react";
import { useMemo, useState } from "react";

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
import { readApiResponse } from "@/lib/laboratory-types";

type EvolutionPanelProps = { arenas: readonly ArenaSpec[] };

export function EvolutionPanel({ arenas }: EvolutionPanelProps) {
  const [arenaId, setArenaId] = useState(arenas[0]?.id ?? "fangens-dilemma");
  const [seed, setSeed] = useState("evolusjon-2026");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EvolutionResult | null>(null);

  const range = useMemo(() => {
    const values = result?.generations.map(({ bestFitness }) => bestFitness) ?? [0];
    return { max: Math.max(...values), min: Math.min(...values) };
  }, [result]);

  async function startEvolution() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/evolution", {
        body: JSON.stringify({
          arenaId,
          generationCount: 10,
          populationSize: 6,
          seed,
          trialsPerCandidate: 2,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setResult(await readApiResponse<EvolutionResult>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evolusjonen feilet");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="glass-panel h-fit rounded-2xl border border-white/8 p-5 xl:sticky xl:top-20">
        <div className="mb-6 flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200">
            <Dna className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Evolusjonsløp</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Elitisme, mutasjon og seedede målinger.</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            Arena
            <Select value={arenaId} onValueChange={setArenaId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {arenas.map((arena) => <SelectItem key={arena.id} value={arena.id}>{arena.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            Startverdi
            <Input maxLength={128} value={seed} onChange={(event) => setSeed(event.target.value)} />
          </label>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[["10", "generasjoner"], ["6", "kandidater"], ["120", "dueller"]].map(([value, label]) => (
              <div className="rounded-lg border border-white/7 bg-black/15 p-2 text-center" key={label}>
                <p className="font-mono text-sm text-cyan-100">{value}</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <Button className="mt-2 w-full" disabled={running || seed.trim().length === 0} onClick={startEvolution}>
            {running ? <RotateCw className="animate-spin" /> : <FlaskConical />}
            {running ? "Kjører 10 generasjoner…" : "Start 10 generasjoner"}
          </Button>
          <p className="text-[10px] leading-4 text-muted-foreground">
            Prototypekjøringen bruker lokale, deterministiske baselines. Den forbruker ingen modellkvote.
          </p>
        </div>
      </aside>

      <main className="laboratory-grid min-h-[680px] rounded-2xl border border-white/8 bg-[#0d111b]/88 p-5 sm:p-7">
        {error !== null && (
          <div role="alert" className="mb-5 rounded-xl border border-red-300/15 bg-red-400/[0.06] p-4 text-sm text-red-100">{error}</div>
        )}
        {result === null ? (
          <div className="flex min-h-[610px] flex-col">
            <div>
              <Badge variant="outline" className="mb-3 border-white/10 text-cyan-200">REPRODUSERBAR EVOLUSJON</Badge>
              <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">Se strategi bli til målbare generasjoner.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Hver kandidat vurderes mot samme referanse med byttede sider. Usikkerhet, foreldre og mutasjonsoperator følger resultatet.
              </p>
            </div>
            <div className="my-auto grid gap-3 py-10 sm:grid-cols-3">
              {[
                { Icon: ShieldCheck, text: "Samme arena, eksplisitte seeds og likt budsjett.", title: "Kontrollerte forsøk" },
                { Icon: GitBranch, text: "Ingen taper slettes; alle foreldre og barn spores.", title: "Slektslinje" },
                { Icon: Activity, text: "Vinnrate vises med 95 % Wilson-intervall.", title: "Usikkerhet" },
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
                <div className="mb-2 flex items-center gap-2 text-xs text-emerald-200"><ShieldCheck className="size-4" /> Løpet er fullført</div>
                <h2 className="text-2xl font-semibold tracking-tight">10 generasjoner analysert</h2>
                <p className="mt-2 text-sm text-muted-foreground">{result.totalDuels} seedede dueller · {result.lineage.length} slektskapskanter</p>
              </div>
              <Badge className="gap-1.5 bg-amber-300/12 text-amber-200"><Trophy /> Egnethet {result.best.fitness.toFixed(2)}</Badge>
            </div>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Beste genom</p>
                <p className="mt-2 truncate font-mono text-sm text-cyan-100">{result.best.genome.id}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Vinnrate</p>
                <p className="mt-2 font-mono text-xl">{Math.round(result.best.winRate * 100)} %</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/15 p-4">
                <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">95 % intervall</p>
                <p className="mt-2 font-mono text-xl">{Math.round(result.best.winRateInterval.lower * 100)}–{Math.round(result.best.winRateInterval.upper * 100)} %</p>
              </div>
            </section>

            <section className="rounded-xl border border-white/8 bg-black/15 p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div><p className="text-sm font-semibold">Egnethet per generasjon</p><p className="mt-1 text-xs text-muted-foreground">Beste kandidat i hver populasjon</p></div>
                <Activity className="size-4 text-cyan-200" />
              </div>
              <div className="space-y-3">
                {result.generations.map((generation) => {
                  const width = range.max === range.min ? 100 : 18 + ((generation.bestFitness - range.min) / (range.max - range.min)) * 82;
                  return (
                    <div className="grid grid-cols-[28px_1fr_54px] items-center gap-3" key={generation.generation.id}>
                      <span className="font-mono text-[10px] text-muted-foreground">G{generation.generation.number + 1}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400/55 to-cyan-200" style={{ width: `${width}%` }} /></div>
                      <span className="text-right font-mono text-[10px]">{generation.bestFitness.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2"><GitBranch className="size-4 text-violet-200" /><p className="text-sm font-semibold">Siste mutasjoner</p></div>
              <div className="grid gap-2 md:grid-cols-2">
                {result.lineage.slice(-6).toReversed().map((edge) => (
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/7 bg-white/[0.02] p-3" key={edge.id}>
                    <span className="truncate font-mono text-[9px] text-muted-foreground">{edge.parentGenomeIds[0]?.slice(-8)}</span>
                    <ArrowRight className="size-3 shrink-0 text-violet-200" />
                    <span className="truncate font-mono text-[9px] text-foreground">{edge.childGenomeId.slice(-8)}</span>
                    <Badge variant="outline" className="ml-auto border-white/8 text-[9px]">{edge.mutationOperator}</Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
