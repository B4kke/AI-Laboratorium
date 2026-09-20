import {
  EventEnvelopeSchema,
  type EntityId,
  type EventEnvelope,
  type EventType,
} from "@ai-lab/domain";

import { parseEventPayload, type EventPayloadMap } from "./payloads";

export type NewEvent<TType extends EventType> = Omit<
  EventEnvelope,
  | "actorId"
  | "agentSnapshotId"
  | "genomeId"
  | "id"
  | "memoryId"
  | "occurredAt"
  | "payload"
  | "schemaVersion"
  | "type"
> & {
  actorId?: EntityId;
  agentSnapshotId?: EntityId;
  genomeId?: EntityId;
  id: EntityId;
  memoryId?: EntityId;
  occurredAt: string;
  payload: EventPayloadMap[TType];
  type: TType;
};

export function createEvent<TType extends EventType>(input: NewEvent<TType>): EventEnvelope {
  const payload = parseEventPayload(input.type, input.payload);
  const candidate = {
    arenaVersion: input.arenaVersion,
    id: input.id,
    matchId: input.matchId,
    occurredAt: input.occurredAt,
    payload,
    schemaVersion: "1.0" as const,
    seed: input.seed,
    sequence: input.sequence,
    type: input.type,
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
    ...(input.agentSnapshotId === undefined ? {} : { agentSnapshotId: input.agentSnapshotId }),
    ...(input.genomeId === undefined ? {} : { genomeId: input.genomeId }),
    ...(input.memoryId === undefined ? {} : { memoryId: input.memoryId }),
  };

  return EventEnvelopeSchema.parse(candidate);
}

export class InMemoryEventStore {
  readonly #eventsByMatch = new Map<string, EventEnvelope[]>();
  readonly #ids = new Set<string>();

  append(eventInput: EventEnvelope): EventEnvelope {
    const event = EventEnvelopeSchema.parse(eventInput);
    parseEventPayload(event.type, event.payload);

    if (this.#ids.has(event.id)) {
      throw new Error(`Hendelsen ${event.id} finnes allerede`);
    }

    const current = this.#eventsByMatch.get(event.matchId) ?? [];
    if (event.sequence !== current.length) {
      throw new Error(
        `Ugyldig sekvens for ${event.matchId}: forventet ${current.length}, fikk ${event.sequence}`,
      );
    }

    const previous = current.at(-1);
    if (previous !== undefined && previous.seed !== event.seed) {
      throw new Error("Seed kan ikke endres i en påbegynt kamp");
    }

    const next = [...current, event];
    this.#eventsByMatch.set(event.matchId, next);
    this.#ids.add(event.id);
    return event;
  }

  read(matchId: EntityId): readonly EventEnvelope[] {
    return [...(this.#eventsByMatch.get(matchId) ?? [])];
  }
}
