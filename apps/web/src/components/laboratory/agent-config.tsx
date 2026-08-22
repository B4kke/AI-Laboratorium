"use client";

import type { AgentConfiguration } from "@ai-lab/domain";
import { Bot, CircleDot, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProviderCatalogEntry } from "@/lib/laboratory-types";
import { cn } from "@/lib/utils";

const strategyNames: Record<AgentConfiguration["strategy"], string> = {
  adaptive: "Adaptiv",
  cooperative: "Samarbeidende",
  opportunist: "Opportunist",
  risk_averse: "Forsiktig",
  unpredictable: "Uforutsigbar",
};

export function strategyFromModel(
  modelId: string,
  current: AgentConfiguration["strategy"],
): AgentConfiguration["strategy"] {
  if (modelId.includes("cooperative")) return "cooperative";
  if (modelId.includes("opportunist")) return "opportunist";
  if (modelId.includes("risk-averse")) return "risk_averse";
  if (modelId.includes("unpredictable")) return "unpredictable";
  if (modelId.includes("adaptive")) return "adaptive";
  return current;
}

type AgentConfigProps = {
  accent: "cyan" | "violet";
  agent: AgentConfiguration;
  label: string;
  onChange: (agent: AgentConfiguration) => void;
  providers: readonly ProviderCatalogEntry[];
};

export function AgentConfig({ accent, agent, label, onChange, providers }: AgentConfigProps) {
  const provider = providers.find(({ id }) => id === agent.providerId) ?? providers[0];
  const models = provider?.models ?? [];
  return (
    <section className="space-y-4 rounded-xl border border-white/7 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "grid size-8 place-items-center rounded-lg border",
              accent === "cyan"
                ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200"
                : "border-violet-300/20 bg-violet-300/10 text-violet-200",
            )}
          >
            <Bot className="size-4" />
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {label}
            </p>
            <p className="text-sm font-semibold">{agent.name}</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 border-white/10 text-[10px] text-muted-foreground">
          <CircleDot className="size-2.5 text-emerald-300" /> klar
        </Badge>
      </div>

      <label className="grid gap-1.5 text-xs text-muted-foreground">
        Navn
        <Input
          aria-label={`${label}: navn`}
          maxLength={60}
          value={agent.name}
          onChange={(event) => onChange({ ...agent, name: event.target.value })}
        />
      </label>

      <label className="grid gap-1.5 text-xs text-muted-foreground">
        Leverandør
        <Select
          value={agent.providerId}
          onValueChange={(providerId: AgentConfiguration["providerId"]) => {
            const nextProvider = providers.find(({ id }) => id === providerId);
            const firstModel = nextProvider?.models[0];
            if (firstModel !== undefined) {
              onChange({
                ...agent,
                modelId: firstModel.id,
                providerId,
                strategy: strategyFromModel(firstModel.id, agent.strategy),
              });
            }
          }}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {providers.map((entry) => (
              <SelectItem key={entry.id} value={entry.id} disabled={entry.models.length === 0}>
                {entry.name}{entry.models.length === 0 ? " · ikke konfigurert" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="grid gap-1.5 text-xs text-muted-foreground">
        Modell
        <Select
          value={agent.modelId}
          onValueChange={(modelId) =>
            onChange({ ...agent, modelId, strategy: strategyFromModel(modelId, agent.strategy) })
          }
        >
          <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="grid gap-1.5 text-xs text-muted-foreground">
        Strategiprofil
        <Select
          value={agent.strategy}
          onValueChange={(strategy: AgentConfiguration["strategy"]) => onChange({ ...agent, strategy })}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(strategyNames).map(([value, name]) => (
              <SelectItem key={value} value={value}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="grid gap-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3 text-amber-200" /> Sjel (SOUL.md)
        </span>
        <Textarea
          aria-label={`${label}: sjel`}
          className="min-h-20 resize-none text-xs"
          maxLength={500}
          onChange={(event) => onChange({ ...agent, roleInstruction: event.target.value })}
          placeholder="F.eks: Du er en mistenksom forretningskvinne som belønner lojalitet og straffer svik hardt. Snakk kort og tørt."
          value={agent.roleInstruction ?? ""}
        />
      </label>
    </section>
  );
}
