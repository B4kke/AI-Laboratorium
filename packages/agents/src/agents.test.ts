import { describe, expect, it } from "vitest";

import { appendMemory, createGenome, createMemorySnapshot, diffGenomes, mutateGenome } from "./index";

const parent = createGenome({
  communicationPolicy: "Vær tydelig og kort.",
  generation: 0,
  objectives: ["Maksimer langsiktig poengsum."],
  parentIds: [],
  riskProfile: 0.5,
  soul: "Søk gjensidig gevinst uten å være naiv.",
});

describe("genomer", () => {
  it("lager uforanderlige snapshots og en lesbar diff", () => {
    const child = mutateGenome(parent, "reflection", { nonce: "test" });
    expect(Object.isFrozen(parent)).toBe(true);
    expect(child.parentIds).toEqual([parent.id]);
    expect(diffGenomes(parent, child).soulAppendix).toContain("Mutasjon 1");
  });

  it("gir samme mutasjon for samme input", () => {
    expect(mutateGenome(parent, "compression").id).toBe(
      mutateGenome(parent, "compression").id,
    );
  });
});

describe("begrenset minne", () => {
  it("beholder de nyeste minnene innenfor budsjettet", () => {
    const empty = createMemorySnapshot("agent_test", 100);
    const first = appendMemory(empty, {
      category: "mistake",
      content: "a".repeat(70),
      createdAt: "2026-08-21T20:00:00.000Z",
      sourceMatchId: "match_one",
    });
    const second = appendMemory(first, {
      category: "principle",
      content: "b".repeat(70),
      createdAt: "2026-08-21T20:01:00.000Z",
      sourceMatchId: "match_two",
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.content).toBe("b".repeat(70));
  });
});
