import { describe, expect, it } from "vitest";

import {
  agentConfigurationFromSnapshot,
  applyMutationProposal,
  appendMemory,
  createAgentSnapshot,
  createGenome,
  createMemorySnapshot,
  diffGenomes,
  mutateGenome,
  parseMutationProposal,
} from "./index";

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

  it("materialiserer SOUL.md og de øvrige virtuelle genomfilene", () => {
    const soulFile = parent.files.find(({ path }) => path === "SOUL.md");
    expect(soulFile?.content).toBe(parent.soul);
    expect(parent.files.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        "SOUL.md",
        "objectives.md",
        "policy.md",
        "risk-profile.json",
        "communication-policy.md",
        "memory-policy.md",
      ]),
    );
  });

  it("gir samme mutasjon for samme input", () => {
    expect(mutateGenome(parent, "compression").id).toBe(
      mutateGenome(parent, "compression").id,
    );
  });
});

describe("begrenset minne", () => {
  it("beholder de nyeste minnene innenfor budsjettet", () => {
    const empty = createMemorySnapshot("agent_test", 100, {
      clock: () => new Date("2026-08-21T19:59:00.000Z"),
    });
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
    expect(second.parentId).toBe(first.id);
  });

  it("beholder maksimalt 200 av de nyeste minnene", () => {
    let memory = createMemorySnapshot("agent_memory-limit", 100_000, {
      clock: () => new Date("2026-08-21T19:59:00.000Z"),
    });
    for (let index = 0; index < 205; index += 1) {
      memory = appendMemory(memory, {
        category: "world_model",
        content: `minne-${index}`,
        createdAt: new Date(Date.UTC(2026, 7, 21, 20, index)).toISOString(),
        sourceMatchId: `match_memory-${index}`,
      });
    }
    expect(memory.items).toHaveLength(200);
    expect(memory.items[0]?.content).toBe("minne-5");
    expect(memory.items.at(-1)?.content).toBe("minne-204");
  });
});

describe("agent-snapshots", () => {
  it("binder modell, SOUL.md, minne og filer til én valgt versjon", () => {
    const memory = createMemorySnapshot("agent_382", 4_000, {
      clock: () => new Date("2026-08-21T20:00:00.000Z"),
    });
    const snapshot = createAgentSnapshot({
      agentId: "agent_382",
      clock: () => new Date("2026-08-21T20:00:00.000Z"),
      genome: parent,
      memory,
      modelId: "nvidia/nemotron-test",
      name: "Agent 382",
      providerId: "nvidia-nim",
      strategy: "adaptive",
    });
    const configuration = agentConfigurationFromSnapshot(snapshot);

    expect(configuration.snapshotId).toBe(snapshot.id);
    expect(configuration.soul).toBe(parent.soul);
    expect(configuration.files?.find(({ path }) => path === "SOUL.md")?.content).toBe(parent.soul);
    expect(configuration.memoryId).toBe(memory.id);
  });

  it("gir ulike snapshot-ID-er når modell eller minne endres", () => {
    const memory = createMemorySnapshot("agent_snapshot-identity", 4_000, {
      clock: () => new Date("2026-08-21T20:00:00.000Z"),
    });
    const base = {
      agentId: "agent_snapshot-identity" as const,
      genome: parent,
      memory,
      modelId: "model-a",
      name: "Snapshot-identitet",
      providerId: "opencode-zen" as const,
      strategy: "adaptive" as const,
    };
    const first = createAgentSnapshot(base);
    const changedModel = createAgentSnapshot({ ...base, modelId: "model-b" });
    const changedMemory = createAgentSnapshot({
      ...base,
      memory: appendMemory(memory, {
        category: "principle",
        content: "Et nytt prinsipp.",
        createdAt: "2026-08-21T20:01:00.000Z",
        sourceMatchId: "match_snapshot-memory",
      }),
    });
    expect(new Set([first.id, changedModel.id, changedMemory.id]).size).toBe(3);
  });
});

describe("modellgenerert mutasjon", () => {
  it("validerer og materialiserer ny SOUL.md og nytt minne med proveniens", () => {
    const memory = createMemorySnapshot("agent_mutation", 4_000, {
      clock: () => new Date("2026-08-21T20:00:00.000Z"),
    });
    const proposal = parseMutationProposal(
      JSON.stringify({
        communicationPolicy: "Svar på motpartens konkrete påstand før du foreslår en avtale.",
        files: [
          {
            content: "Kontroller om avtalen kan håndheves før du godtar den.\n",
            mediaType: "text/markdown",
            path: "policy.md",
          },
        ],
        memoryWrites: [
          {
            category: "mistake",
            content: "Jeg aksepterte et løfte uten en observerbar garanti.",
          },
        ],
        objectives: ["Krev etterprøvbar gjensidighet før irreversible valg."],
        riskProfile: 0.62,
        soul: "Jeg søker samarbeid, men krever observerbare garantier før jeg binder meg.",
        summary: "La til krav om håndhevbar gjensidighet etter et dokumentert svik.",
      }),
    );
    const applied = applyMutationProposal({
      agentId: "agent_mutation",
      clock: () => new Date("2026-08-21T20:05:00.000Z"),
      generation: 1,
      mutationModel: { modelId: "evolver-free", providerId: "opencode-zen" },
      operator: "reflection",
      parentGenome: parent,
      parentMemory: memory,
      proposal,
      sourceMatchIds: ["match_mutation-evidence", "match_mutation-evidence-2"],
    });

    expect(applied.genome.soul).toBe(proposal.soul);
    expect(applied.genome.files.find(({ path }) => path === "SOUL.md")?.content).toBe(
      proposal.soul,
    );
    expect(applied.memory.items).toEqual([
      expect.objectContaining({
        category: "mistake",
        sourceMatchId: "match_mutation-evidence",
        sourceMatchIds: ["match_mutation-evidence", "match_mutation-evidence-2"],
      }),
    ]);
    expect(applied.memory.parentId).toBe(memory.id);
    expect(applied.genome.mutation?.changedFiles).toEqual(
      expect.arrayContaining(["SOUL.md", "policy.md"]),
    );
  });

  it("avviser filer utenfor den virtuelle agent-sandkassen", () => {
    expect(() =>
      parseMutationProposal(
        JSON.stringify({
          communicationPolicy: "Kort.",
          files: [{ content: "secret", mediaType: "text/markdown", path: ".env" }],
          memoryWrites: [],
          objectives: ["Test"],
          riskProfile: 0.5,
          soul: "Test",
          summary: "Test",
        }),
      ),
    ).toThrow();
  });

  it("avviser tvetydige eller kanoniske filer i files-feltet", () => {
    const proposal = {
      communicationPolicy: "Kort.",
      memoryWrites: [],
      objectives: ["Test"],
      riskProfile: 0.5,
      soul: "Test",
      summary: "Test",
    };
    expect(() =>
      parseMutationProposal(
        JSON.stringify({
          ...proposal,
          files: [{ content: "annen soul", mediaType: "text/markdown", path: "SOUL.md" }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseMutationProposal(
        JSON.stringify({
          ...proposal,
          files: [
            { content: "én", mediaType: "text/markdown", path: "tools.md" },
            { content: "to", mediaType: "text/markdown", path: "tools.md" },
          ],
        }),
      ),
    ).toThrow();
  });
});
