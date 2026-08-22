"use client";

import type { AgentConfiguration } from "@ai-lab/domain";
import { Bot, CircleDot, Database, FileText, MemoryStick, Save, Sparkles } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import type { ProviderCatalogEntry } from "@/lib/laboratory-types";
import type { AgentLibraryResponse } from "@/lib/laboratory-types";
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
  onSave: () => void;
  onSelectAgentSerial: (serialNumber: number) => void;
  onSelectSavedAgent: (agentId: string | null) => void;
  persistenceConfigured: boolean;
  providers: readonly ProviderCatalogEntry[];
  savedAgents: AgentLibraryResponse["agents"];
  saving: boolean;
};

function detachSnapshot(agent: AgentConfiguration): AgentConfiguration {
  const draft = { ...agent };
  delete draft.genomeId;
  delete draft.memoryId;
  delete draft.snapshotId;
  return draft;
}

export function AgentConfig({
  accent,
  agent,
  label,
  onChange,
  onSave,
  onSelectAgentSerial,
  onSelectSavedAgent,
  persistenceConfigured,
  providers,
  savedAgents,
  saving,
}: AgentConfigProps) {
  const provider = providers.find(({ id }) => id === agent.providerId) ?? providers[0];
  const models = provider?.models ?? [];
  const selectedSavedAgent = savedAgents.find(
    ({ currentSnapshotId }) => currentSnapshotId === agent.snapshotId,
  );
  const supportingFiles = (agent.files ?? []).filter(({ path }) => path !== "SOUL.md");
  const updateDraft = (next: AgentConfiguration) => onChange(detachSnapshot(next));
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
        <span className="flex items-center gap-1.5">
          <Database className="size-3 text-cyan-200" /> Lagret agent
        </span>
        <Select
          value={agent.snapshotId ?? "draft"}
          onValueChange={(snapshotId) => {
            if (snapshotId === "draft") {
              onSelectSavedAgent(null);
              return;
            }
            const selected = savedAgents.find(
              ({ currentSnapshotId }) => currentSnapshotId === snapshotId,
            );
            if (selected !== undefined) onSelectSavedAgent(selected.agentId);
          }}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Nytt utkast</SelectItem>
            {savedAgents.map((savedAgent) => (
              <SelectItem key={savedAgent.currentSnapshotId} value={savedAgent.currentSnapshotId}>
                Agent {savedAgent.serialNumber} · {savedAgent.name} · G{savedAgent.generation}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedSavedAgent !== undefined ? (
          <span className="text-[10px] leading-4 text-emerald-200">
            Snapshot {selectedSavedAgent.currentSnapshotId.slice(-10)} · {selectedSavedAgent.memoryItems} minner
          </span>
        ) : null}
      </label>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(new FormData(event.currentTarget).get("serialNumber"));
          if (Number.isSafeInteger(value) && value > 0) onSelectAgentSerial(value);
        }}
      >
        <Input
          aria-label={`${label}: finn agentnummer`}
          className="min-w-0"
          min={1}
          name="serialNumber"
          placeholder="F.eks. 382"
          type="number"
        />
        <Button size="sm" type="submit" variant="outline">Hent Agent N</Button>
      </form>

      <label className="grid gap-1.5 text-xs text-muted-foreground">
        Navn
        <Input
          aria-label={`${label}: navn`}
          maxLength={60}
          value={agent.name}
          onChange={(event) => updateDraft({ ...agent, name: event.target.value })}
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
              updateDraft({
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
            updateDraft({ ...agent, modelId, strategy: strategyFromModel(modelId, agent.strategy) })
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
          onValueChange={(strategy: AgentConfiguration["strategy"]) => updateDraft({ ...agent, strategy })}
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
          maxLength={16_000}
          onChange={(event) => updateDraft({ ...agent, soul: event.target.value })}
          placeholder="F.eks: Du er en mistenksom forretningskvinne som belønner lojalitet og straffer svik hardt. Snakk kort og tørt."
          value={agent.soul ?? ""}
        />
        {agent.providerId === "mock" ? (
          <span className="text-[10px] leading-4 text-amber-100">
            Scripted kontroll: policyen leser ikke SOUL.md. Velg en ekstern modell for ekte dialog.
          </span>
        ) : null}
      </label>

      {agent.snapshotId !== undefined ? (
        <details className="rounded-lg border border-white/8 bg-black/15 text-xs">
          <summary className="cursor-pointer px-3 py-2.5 font-medium text-foreground">
            Vis bundet minne og filer
          </summary>
          <div className="space-y-4 border-t border-white/7 p-3">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <FileText className="size-3 text-cyan-200" /> Virtuelle filer
              </p>
              {supportingFiles.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">Ingen øvrige filer.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-auto">
                  {supportingFiles.map((file) => (
                    <div className="rounded-md border border-white/7 p-2" key={file.path}>
                      <p className="font-mono text-[9px] text-cyan-100">{file.path}</p>
                      <pre className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-muted-foreground">
                        {file.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                <MemoryStick className="size-3 text-violet-200" /> Minne
              </p>
              {(agent.memoryContext?.length ?? 0) === 0 ? (
                <p className="text-[10px] text-muted-foreground">Ingen lagrede minner.</p>
              ) : (
                <div className="max-h-44 space-y-2 overflow-auto">
                  {agent.memoryContext?.map((memory, index) => (
                    <div className="rounded-md border border-white/7 p-2" key={`${memory.category}-${index}`}>
                      <p className="font-mono text-[9px] text-violet-100">{memory.category}</p>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{memory.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>
      ) : null}

      <Button
        className="w-full"
        disabled={
          saving ||
          !persistenceConfigured ||
          agent.name.trim().length === 0 ||
          (agent.soul?.trim().length ?? 0) === 0
        }
        onClick={onSave}
        size="sm"
        type="button"
        variant="outline"
      >
        <Save /> {saving ? "Lagrer…" : "Lagre som ny agent"}
      </Button>
      {!persistenceConfigured ? (
        <p className="text-[10px] leading-4 text-amber-100">
          Agentbiblioteket blir tilgjengelig når DATABASE_URL er konfigurert.
        </p>
      ) : null}
    </section>
  );
}
