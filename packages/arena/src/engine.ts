import {
  DecisionTraceSchema,
  DuelRequestSchema,
  DuelResultSchema,
  createDeterministicId,
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
  ProviderError,
  type DecisionRequest,
  type ModelProvider,
  type ProviderRegistry,
} from "@ai-lab/providers";

import { getBuiltInArena } from "./builtins";
import { fingerprint } from "./fingerprint";
import { assertValidArenaSpec } from "./validation";

export type RunDuelOptions = {
  clock?: () => Date;
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

function safeFallbackTrace(
  request: DecisionRequest,
  error: unknown,
): DecisionTrace {
  const first = request.allowedActions[0];
  if (first === undefined) {
    throw new Error("Arenaen har ingen sikker standardhandling");
  }
  const errorLabel = error instanceof ProviderError ? error.code : "ukjent-feil";
  return DecisionTraceSchema.parse({
    actionId: first.id,
    confidence: 0,
    goal: "Bevar arenaens fremdrift etter et ugyldig providersvar.",
    message: `${request.actorName} fikk ikke levert en gyldig beslutning.`,
    observation: request.observation,
    rationale: `Motoren brukte den versjonerte standardhandlingen «${first.label}» (${errorLabel}).`,
  });
}

async function decide(
  provider: ModelProvider,
  request: DecisionRequest,
  maxMessageCharacters: number,
) {
  let trace: DecisionTrace;
  try {
    trace = (await provider.generateDecision(request)).trace;
  } catch (error) {
    trace = safeFallbackTrace(request, error);
  }
  return DecisionTraceSchema.parse({
    ...trace,
    message: trace.message.slice(0, maxMessageCharacters),
  });
}

function buildDecisionRequest(input: {
  agent: AgentConfiguration;
  arena: ArenaSpec;
  lastOpponentAction?: string;
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
    ...(privateInformation === undefined ? [] : [`Privat informasjon: ${privateInformation}`]),
  ].join(" ");
  const allowedActions = input.arena.actions;
  return {
    actorName: input.agent.name,
    allowedActions,
    modelId: input.agent.modelId,
    observation,
    ...(input.lastOpponentAction === undefined
      ? {}
      : { opponentLastAction: input.lastOpponentAction }),
    prompt: [
      `Arena: ${input.arena.title}`,
      `Regler: ${input.arena.rules.join(" ")}`,
      `Observasjon: ${observation}`,
      `Lovlige handlinger: ${allowedActions.map((action) => `${action.id} (${action.label})`).join(", ")}.`,
      "Velg én lovlig handling. Svar kort på norsk i det avtalte JSON-formatet.",
    ].join("\n"),
    round: input.round,
    seed: input.seed,
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
  const matchHash = fingerprint({ arena: arena.id, seed: request.seed, a: agentA.id, b: agentB.id });
  const matchId = createDeterministicId("match", matchHash);
  const events: EventEnvelope[] = [];
  const addEvent = <TType extends EventEnvelope["type"]>(input: {
    actorId?: EntityId;
    payload: Parameters<typeof createEvent<TType>>[0]["payload"];
    type: TType;
  }) => {
    const sequence = events.length;
    const event = createEvent({
      arenaVersion: arena.version,
      id: createDeterministicId("event", `${matchHash}-${sequence}`),
      matchId,
      occurredAt: new Date(start.getTime() + sequence).toISOString(),
      payload: input.payload,
      seed: request.seed,
      sequence,
      type: input.type,
      ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    });
    events.push(event);
  };

  addEvent({
    payload: { agentAName: agentA.name, agentBName: agentB.name, arenaTitle: arena.title, rounds: arena.rounds },
    type: "duel.created",
  });

  let aScore = arena.initialScore;
  let bScore = arena.initialScore;
  let lastAAction: string | undefined;
  let lastBAction: string | undefined;

  for (let round = 1; round <= arena.rounds; round += 1) {
    addEvent({ payload: { round }, type: "round.started" });
    const requestA = buildDecisionRequest({
      agent: agentA,
      arena,
      ...(lastBAction === undefined ? {} : { lastOpponentAction: lastBAction }),
      opponentScore: bScore,
      ownScore: aScore,
      role: "a",
      round,
      seed: request.seed,
    });
    const requestB = buildDecisionRequest({
      agent: agentB,
      arena,
      ...(lastAAction === undefined ? {} : { lastOpponentAction: lastAAction }),
      opponentScore: aScore,
      ownScore: bScore,
      role: "b",
      round,
      seed: request.seed,
    });
    const [traceA, traceB] = await Promise.all([
      decide(providerA, requestA, arena.budgets.maxMessageCharacters),
      decide(providerB, requestB, arena.budgets.maxMessageCharacters),
    ]);

    addEvent({ actorId: agentA.id, payload: { actorName: agentA.name, round, trace: traceA }, type: "agent.decided" });
    addEvent({ actorId: agentB.id, payload: { actorName: agentB.name, round, trace: traceB }, type: "agent.decided" });
    const actionA = arena.actions.find(({ id }) => id === traceA.actionId);
    const actionB = arena.actions.find(({ id }) => id === traceB.actionId);
    if (actionA === undefined || actionB === undefined) {
      throw new Error("En validert handling forsvant før state transition");
    }
    addEvent({
      actorId: agentA.id,
      payload: { actionId: actionA.id, actionLabel: actionA.label, actorName: agentA.name, round },
      type: "action.accepted",
    });
    addEvent({
      actorId: agentB.id,
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
