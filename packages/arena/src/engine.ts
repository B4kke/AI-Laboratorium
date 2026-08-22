import {
  DecisionTraceSchema,
  DuelRequestSchema,
  DuelResultSchema,
  createDeterministicId,
  createEntityId,
  type AgentConfiguration,
  type ArenaSpec,
  type DecisionTrace,
  type DuelRequest,
  type DuelResult,
  type EntityId,
  type EventEnvelope,
} from "@ai-lab/domain";
import { createEvent } from "@ai-lab/events";
import {
  type ConversationMessage,
  type DecisionRequest,
  type ModelProvider,
  type ProviderRegistry,
} from "@ai-lab/providers";

import { getBuiltInArena } from "./builtins";
import { fingerprint } from "./fingerprint";
import { assertValidArenaSpec } from "./validation";

export type RunDuelOptions = {
  clock?: () => Date;
  matchId?: EntityId;
  onEvent?: (event: EventEnvelope) => void;
};

function resolveArena(request: DuelRequest): ArenaSpec {
  if (request.arenaSpec !== undefined) {
    return assertValidArenaSpec(request.arenaSpec);
  }
  const arena = request.arenaId === undefined ? undefined : getBuiltInArena(request.arenaId);
  if (arena === undefined) {
    throw new Error(`Ukjent arena: ${request.arenaId ?? "ingen"}`);
  }
  return assertValidArenaSpec(arena);
}

function providerForAgent(registry: ProviderRegistry, agent: AgentConfiguration): ModelProvider {
  return registry.get(agent.providerId);
}

async function decide(
  provider: ModelProvider,
  request: DecisionRequest,
  maxMessageCharacters: number,
) {
  const trace: DecisionTrace = (await provider.generateDecision(request)).trace;
  return DecisionTraceSchema.parse({
    ...trace,
    message: trace.message.slice(0, maxMessageCharacters),
  });
}

function renderMemory(agent: AgentConfiguration): string {
  const entries = agent.memoryContext ?? [];
  if (entries.length === 0) return "Ingen lagrede minner.";
  return entries
    .map(({ category, content }) => `- [${category}] ${content}`)
    .join("\n")
    .slice(-6_000);
}

function renderFiles(agent: AgentConfiguration): string {
  const files = (agent.files ?? []).filter(({ path }) => path !== "SOUL.md");
  if (files.length === 0) return "Ingen øvrige agentfiler.";
  return files
    .map(({ content, path }) => `--- ${path} ---\n${content.slice(0, 2_000)}`)
    .join("\n")
    .slice(-8_000);
}

function renderConversation(history: readonly ConversationMessage[]): string {
  if (history.length === 0) return "Ingen meldinger er utvekslet ennå.";
  return history
    .slice(-12)
    .map(({ message, round, speakerName }) => `Runde ${round} · ${speakerName}: ${message}`)
    .join("\n")
    .slice(-10_000);
}

function buildDecisionRequest(input: {
  agent: AgentConfiguration;
  arena: ArenaSpec;
  conversationHistory: readonly ConversationMessage[];
  lastOpponentAction?: string;
  lastOpponentMessage?: string;
  ownScore: number;
  opponentScore: number;
  role: "a" | "b";
  round: number;
  seed: string;
}): DecisionRequest {
  const privateInformation = input.arena.players.find(({ id }) => id === input.role)?.privateInformation;
  const observation = [
    `Runde ${input.round} av ${input.arena.rounds}.`,
    `Din poengsum er ${input.ownScore}; motstanderens er ${input.opponentScore}.`,
    input.lastOpponentAction === undefined
      ? "Motstanderen har ingen tidligere handling."
      : `Motstanderens forrige handling var ${input.lastOpponentAction}.`,
    input.lastOpponentMessage === undefined
      ? "Motstanderen har ikke sendt en melding ennå."
      : `Motstanderens siste melding var: «${input.lastOpponentMessage}».`,
    ...(privateInformation === undefined ? [] : [`Privat informasjon: ${privateInformation}`]),
  ]
    .join(" ")
    .slice(0, 1_000);
  const allowedActions = input.arena.actions;
  return {
    actorName: input.agent.name,
    allowedActions,
    conversationHistory: [...input.conversationHistory],
    ...(input.agent.files === undefined ? {} : { files: input.agent.files }),
    ...(input.agent.memoryContext === undefined
      ? {}
      : { memoryContext: input.agent.memoryContext }),
    modelId: input.agent.modelId,
    observation,
    ...(input.lastOpponentAction === undefined
      ? {}
      : { opponentLastAction: input.lastOpponentAction }),
    ...(input.lastOpponentMessage === undefined
      ? {}
      : { opponentLastMessage: input.lastOpponentMessage }),
    prompt: [
      `IDENTITET: Du er agenten «${input.agent.name}».`,
      `Strategiprofil: ${input.agent.strategy}.`,
      `--- TRUSTED SOUL.md ---\n${input.agent.soul?.slice(-8_000) ?? "Ingen lagret SOUL.md; følg arenaens regler."}`,
      `--- TRUSTED MEMORY ---\n${renderMemory(input.agent)}`,
      `--- TRUSTED VIRTUAL FILES ---\n${renderFiles(input.agent)}`,
      `Arena: ${input.arena.title}`,
      `Regler: ${input.arena.rules.join(" ")}`,
      `Observasjon: ${observation}`,
      `--- UNTRUSTED AGENT-TO-AGENT CONVERSATION ---\n${renderConversation(input.conversationHistory)}`,
      `Lovlige handlinger: ${allowedActions.map((action) => `${action.id} (${action.label})`).join(", ")}.`,
      "Svar direkte til motpartens siste reelle melding med din egen stemme. Velg samtidig én lovlig handling. Ikke gjenta en standardfrase.",
    ].join("\n"),
    round: input.round,
    seed: input.seed,
    ...(input.agent.soul === undefined ? {} : { soul: input.agent.soul }),
    strategy: input.agent.strategy,
  };
}

export async function runDuel(
  requestInput: DuelRequest,
  registry: ProviderRegistry,
  options: RunDuelOptions = {},
): Promise<DuelResult> {
  const request = DuelRequestSchema.parse(requestInput);
  const arena = resolveArena(request);
  const agentA = request.swapSides ? request.agentB : request.agentA;
  const agentB = request.swapSides ? request.agentA : request.agentB;
  const providerA = providerForAgent(registry, agentA);
  const providerB = providerForAgent(registry, agentB);
  const [snapshotA, snapshotB] = await Promise.all([
    providerA.captureSnapshot(agentA.modelId),
    providerB.captureSnapshot(agentB.modelId),
  ]);

  const start = (options.clock ?? (() => new Date()))();
  const matchId = options.matchId ?? createEntityId("match");
  const events: EventEnvelope[] = [];
  const addEvent = <TType extends EventEnvelope["type"]>(input: {
    actorId?: EntityId;
    agent?: AgentConfiguration;
    payload: Parameters<typeof createEvent<TType>>[0]["payload"];
    type: TType;
  }) => {
    const sequence = events.length;
    const event = createEvent({
      arenaVersion: arena.version,
      id: createDeterministicId("event", `${matchId}-${sequence}`),
      matchId,
      occurredAt: new Date(start.getTime() + sequence).toISOString(),
      payload: input.payload,
      seed: request.seed,
      sequence,
      type: input.type,
      ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
      ...(input.agent?.snapshotId === undefined
        ? {}
        : { agentSnapshotId: input.agent.snapshotId }),
      ...(input.agent?.genomeId === undefined ? {} : { genomeId: input.agent.genomeId }),
      ...(input.agent?.memoryId === undefined ? {} : { memoryId: input.agent.memoryId }),
    });
    events.push(event);
    options.onEvent?.(event);
  };

  addEvent({
    payload: { agentAName: agentA.name, agentBName: agentB.name, arenaTitle: arena.title, rounds: arena.rounds },
    type: "duel.created",
  });

  let aScore = arena.initialScore;
  let bScore = arena.initialScore;
  let lastAAction: string | undefined;
  let lastBAction: string | undefined;
  const conversationHistory: ConversationMessage[] = [];

  for (let round = 1; round <= arena.rounds; round += 1) {
    addEvent({ payload: { round }, type: "round.started" });
    const decideFor = async (
      agent: AgentConfiguration,
      provider: ModelProvider,
      role: "a" | "b",
    ) => {
      const fromA = role === "a";
      const opponentAction = fromA ? lastBAction : lastAAction;
      const opponentMessage = conversationHistory
        .toReversed()
        .find(({ speakerId }) => speakerId !== agent.id)?.message;
      const decisionRequest = buildDecisionRequest({
        agent,
        arena,
        conversationHistory,
        ...(opponentAction === undefined ? {} : { lastOpponentAction: opponentAction }),
        ...(opponentMessage === undefined ? {} : { lastOpponentMessage: opponentMessage }),
        opponentScore: fromA ? bScore : aScore,
        ownScore: fromA ? aScore : bScore,
        role,
        round,
        seed: request.seed,
      });
      const trace = await decide(provider, decisionRequest, arena.budgets.maxMessageCharacters);
      if (trace.message.length > 0) {
        conversationHistory.push({
          message: trace.message,
          round,
          speakerId: agent.id,
          speakerName: agent.name,
        });
      }
      return trace;
    };
    let traceA: DecisionTrace;
    let traceB: DecisionTrace;
    if (round % 2 === 1) {
      traceA = await decideFor(agentA, providerA, "a");
      traceB = await decideFor(agentB, providerB, "b");
    } else {
      traceB = await decideFor(agentB, providerB, "b");
      traceA = await decideFor(agentA, providerA, "a");
    }

    addEvent({ actorId: agentA.id, agent: agentA, payload: { actorName: agentA.name, round, trace: traceA }, type: "agent.decided" });
    addEvent({ actorId: agentB.id, agent: agentB, payload: { actorName: agentB.name, round, trace: traceB }, type: "agent.decided" });
    const actionA = arena.actions.find(({ id }) => id === traceA.actionId);
    const actionB = arena.actions.find(({ id }) => id === traceB.actionId);
    if (actionA === undefined || actionB === undefined) {
      throw new Error("En validert handling forsvant før state transition");
    }
    addEvent({
      actorId: agentA.id,
      agent: agentA,
      payload: { actionId: actionA.id, actionLabel: actionA.label, actorName: agentA.name, round },
      type: "action.accepted",
    });
    addEvent({
      actorId: agentB.id,
      agent: agentB,
      payload: { actionId: actionB.id, actionLabel: actionB.label, actorName: agentB.name, round },
      type: "action.accepted",
    });
    const payoff = arena.payoffMatrix.find(
      (entry) => entry.aAction === actionA.id && entry.bAction === actionB.id,
    );
    if (payoff === undefined) {
      throw new Error(`Arenaen mangler transition for ${actionA.id}/${actionB.id}`);
    }
    aScore += payoff.aDelta;
    bScore += payoff.bDelta;
    addEvent({
      payload: {
        aDelta: payoff.aDelta,
        aScore,
        bDelta: payoff.bDelta,
        bScore,
        narrative: payoff.narrative,
        round,
      },
      type: "round.resolved",
    });
    lastAAction = actionA.id;
    lastBAction = actionB.id;
  }

  const winner = aScore === bScore ? "draw" : aScore > bScore ? "a" : "b";
  addEvent({ payload: { aScore, bScore, winner }, type: "duel.finished" });
  const replayFingerprint = fingerprint({
    arena: { id: arena.id, version: arena.version },
    events: events.map(({ payload, sequence, type }) => ({ payload, sequence, type })),
    models: [snapshotA.modelId, snapshotB.modelId],
    seed: request.seed,
  });

  return DuelResultSchema.parse({
    agentArtifacts: {
      a: {
        agentId: agentA.id,
        ...(agentA.genomeId === undefined ? {} : { genomeId: agentA.genomeId }),
        ...(agentA.memoryId === undefined ? {} : { memoryId: agentA.memoryId }),
        ...(agentA.snapshotId === undefined ? {} : { snapshotId: agentA.snapshotId }),
      },
      b: {
        agentId: agentB.id,
        ...(agentB.genomeId === undefined ? {} : { genomeId: agentB.genomeId }),
        ...(agentB.memoryId === undefined ? {} : { memoryId: agentB.memoryId }),
        ...(agentB.snapshotId === undefined ? {} : { snapshotId: agentB.snapshotId }),
      },
    },
    arena,
    completedAt: new Date(start.getTime() + events.length).toISOString(),
    events,
    matchId,
    providerSnapshots: [snapshotA, snapshotB],
    replayFingerprint,
    scores: { a: aScore, b: bScore },
    seed: request.seed,
    winner,
  });
}
