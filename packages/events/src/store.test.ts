import { describe, expect, it } from "vitest";

import { createEvent } from "./store";
import { InMemoryEventStore } from "./store";
import { projectDuel } from "./projection";

const base = {
  arenaVersion: "1.0.0",
  matchId: "match_replay-test",
  occurredAt: "2026-08-21T20:00:00.000Z",
  seed: "replay-seed",
};

describe("InMemoryEventStore", () => {
  it("avviser hull i den append-only sekvensen", () => {
    const store = new InMemoryEventStore();
    const event = createEvent({
      ...base,
      id: "event_wrong-sequence",
      payload: { round: 1 },
      sequence: 1,
      type: "round.started",
    });

    expect(() => store.append(event)).toThrow(/forventet 0/);
  });

  it("bygger samme sluttstatus ved deterministisk replay", () => {
    const events = [
      createEvent({
        ...base,
        id: "event_replay-0",
        payload: { agentAName: "Astra", agentBName: "Nova", arenaTitle: "Test", rounds: 1 },
        sequence: 0,
        type: "duel.created",
      }),
      createEvent({
        ...base,
        id: "event_replay-1",
        payload: { round: 1 },
        sequence: 1,
        type: "round.started",
      }),
      createEvent({
        ...base,
        id: "event_replay-2",
        payload: { aDelta: 3, aScore: 3, bDelta: 1, bScore: 1, narrative: "A tok ledelsen.", round: 1 },
        sequence: 2,
        type: "round.resolved",
      }),
      createEvent({
        ...base,
        id: "event_replay-3",
        payload: { aScore: 3, bScore: 1, winner: "a" },
        sequence: 3,
        type: "duel.finished",
      }),
    ];

    expect(projectDuel(events)).toEqual(projectDuel(structuredClone(events)));
    expect(projectDuel(events)).toMatchObject({
      currentRound: 1,
      scores: { a: 3, b: 1 },
      status: "completed",
      winner: "a",
    });
  });
});
