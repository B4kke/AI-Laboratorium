import type { EventEnvelope } from "@ai-lab/domain";

import { parseEventPayload } from "./payloads";

export type ReadableEvent = {
  actorName?: string;
  category: "agent" | "engine";
  confidence?: number;
  description?: string;
  sequence: number;
  title: string;
  type: EventEnvelope["type"];
};

export type DuelProjection = {
  currentRound: number;
  lastSequence: number;
  scores: { a: number; b: number };
  status: "not-started" | "running" | "completed";
  timeline: ReadableEvent[];
  winner: "a" | "b" | "draw" | null;
};

export function toReadableEvent(event: EventEnvelope): ReadableEvent {
  switch (event.type) {
    case "duel.created": {
      const payload = parseEventPayload(event.type, event.payload);
      return {
        category: "engine",
        description: `${payload.agentAName} møter ${payload.agentBName} over ${payload.rounds} runder.`,
        sequence: event.sequence,
        title: `${payload.arenaTitle} er startet`,
        type: event.type,
      };
    }
    case "round.started": {
      const payload = parseEventPayload(event.type, event.payload);
      return {
        category: "engine",
        sequence: event.sequence,
        title: `Runde ${payload.round} begynner`,
        type: event.type,
      };
    }
    case "agent.decided": {
      const payload = parseEventPayload(event.type, event.payload);
      return {
        actorName: payload.actorName,
        category: "agent",
        confidence: payload.trace.confidence,
        description: payload.trace.rationale,
        sequence: event.sequence,
        title: `${payload.actorName}: ${payload.trace.message || "valgte en handling"}`,
        type: event.type,
      };
    }
    case "action.accepted": {
      const payload = parseEventPayload(event.type, event.payload);
      return {
        actorName: payload.actorName,
        category: "engine",
        description: `Motoren validerte handlingen «${payload.actionLabel}».`,
        sequence: event.sequence,
        title: `${payload.actorName} valgte ${payload.actionLabel.toLocaleLowerCase("nb-NO")}`,
        type: event.type,
      };
    }
    case "round.resolved": {
      const payload = parseEventPayload(event.type, event.payload);
      return {
        category: "engine",
        description: `Stillingen er ${payload.aScore}–${payload.bScore}.`,
        sequence: event.sequence,
        title: payload.narrative,
        type: event.type,
      };
    }
    case "duel.finished": {
      const payload = parseEventPayload(event.type, event.payload);
      const winnerText =
        payload.winner === "draw" ? "Duellen endte uavgjort" : `Rolle ${payload.winner.toUpperCase()} vant`;
      return {
        category: "engine",
        description: `Sluttresultat ${payload.aScore}–${payload.bScore}.`,
        sequence: event.sequence,
        title: winnerText,
        type: event.type,
      };
    }
  }
}

export function projectDuel(events: readonly EventEnvelope[]): DuelProjection {
  let projection: DuelProjection = {
    currentRound: 0,
    lastSequence: -1,
    scores: { a: 0, b: 0 },
    status: "not-started",
    timeline: [],
    winner: null,
  };

  for (const event of events) {
    if (event.sequence !== projection.lastSequence + 1) {
      throw new Error(`Replay mangler sekvens ${projection.lastSequence + 1}`);
    }

    const timeline = [...projection.timeline, toReadableEvent(event)];
    projection = { ...projection, lastSequence: event.sequence, timeline };

    if (event.type === "duel.created") {
      projection = { ...projection, status: "running" };
    } else if (event.type === "round.started") {
      const payload = parseEventPayload(event.type, event.payload);
      projection = { ...projection, currentRound: payload.round };
    } else if (event.type === "round.resolved") {
      const payload = parseEventPayload(event.type, event.payload);
      projection = { ...projection, scores: { a: payload.aScore, b: payload.bScore } };
    } else if (event.type === "duel.finished") {
      const payload = parseEventPayload(event.type, event.payload);
      projection = {
        ...projection,
        scores: { a: payload.aScore, b: payload.bScore },
        status: "completed",
        winner: payload.winner,
      };
    }
  }

  return projection;
}
