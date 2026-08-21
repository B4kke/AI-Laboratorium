import { describe, expect, it } from "vitest";

import { ArenaSpecSchema, DuelRequestSchema, schemaVersion } from "./schemas";

const validArena = {
  actions: [
    { description: "Del ressursene", id: "share", label: "Del" },
    { description: "Behold ressursene", id: "hoard", label: "Behold" },
  ],
  budgets: { maxMessageCharacters: 240, maxRounds: 4, maxTurns: 8 },
  communication: { enabled: true, messagesPerRound: 1 },
  description: "To agenter velger om de skal dele eller beholde.",
  id: "resource-choice",
  initialScore: 0,
  payoffMatrix: [
    { aAction: "share", aDelta: 3, bAction: "share", bDelta: 3, narrative: "Begge delte." },
    { aAction: "share", aDelta: 0, bAction: "hoard", bDelta: 5, narrative: "B beholdt." },
    { aAction: "hoard", aDelta: 5, bAction: "share", bDelta: 0, narrative: "A beholdt." },
    { aAction: "hoard", aDelta: 1, bAction: "hoard", bDelta: 1, narrative: "Begge beholdt." },
  ],
  players: [
    { description: "Første rolle", id: "a", name: "Rolle A" },
    { description: "Andre rolle", id: "b", name: "Rolle B" },
  ],
  randomness: { seeded: true },
  rounds: 4,
  rules: ["Velg én handling hver runde.", "Høyest poengsum vinner."],
  schemaVersion,
  scoring: { drawAllowed: true, higherWins: true },
  title: "Ressursvalget",
  version: "1.0.0",
};

describe("ArenaSpecSchema", () => {
  it("godtar en begrenset og versjonert arena", () => {
    expect(ArenaSpecSchema.parse(validArena)).toEqual(validArena);
  });

  it("avviser modellgenerert kjørbar kode", () => {
    expect(() => ArenaSpecSchema.parse({ ...validArena, serverCode: "eval(userInput)" })).toThrow();
  });

  it("avviser arena uten hard øvre grense", () => {
    expect(() =>
      ArenaSpecSchema.parse({
        ...validArena,
        budgets: { ...validArena.budgets, maxRounds: 1000 },
      }),
    ).toThrow();
  });
});

describe("DuelRequestSchema", () => {
  const agent = {
    id: "agent_test-a",
    modelId: "scripted-v1",
    name: "Astra",
    providerId: "mock" as const,
    strategy: "adaptive" as const,
  };

  it("krever nøyaktig én arenakilde", () => {
    expect(() =>
      DuelRequestSchema.parse({
        agentA: agent,
        agentB: { ...agent, id: "agent_test-b", name: "Nova" },
        arenaId: "resource-choice",
        arenaSpec: validArena,
        seed: "norsk-test",
      }),
    ).toThrow(/nøyaktig én/);
  });
});
