import { createAgentSnapshot, createGenome, createMemorySnapshot } from "@ai-lab/agents";
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { LaboratoryRepository } from "./repository";

async function repositoryWithPoolFixture() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  const repository = new LaboratoryRepository(pool);
  await repository.ensureSchema();
  return { pool, repository };
}

async function repositoryFixture() {
  return (await repositoryWithPoolFixture()).repository;
}

function snapshotFixture(generation = 0) {
  const agentId = "agent_persistent-test" as const;
  const genome = createGenome({
    communicationPolicy: "Svar konkret til motparten.",
    generation,
    objectives: ["Maksimer robust gevinst."],
    parentIds: [],
    riskProfile: 0.4,
    soul: `Jeg er en persistent agent i generasjon ${generation}.`,
  });
  const memory = createMemorySnapshot(agentId, 4_000, {
    clock: () => new Date(`2026-08-21T20:0${generation}:00.000Z`),
    generation,
  });
  return createAgentSnapshot({
    agentId,
    clock: () => new Date(`2026-08-21T20:0${generation}:00.000Z`),
    genome,
    memory,
    modelId: "nvidia/nemotron-test",
    name: "Agent vedvarende",
    providerId: "nvidia-nim",
    strategy: "adaptive",
  });
}

describe("LaboratoryRepository", () => {
  it("lagrer immutable agentversjoner og peker agenten på siste snapshot", async () => {
    const repository = await repositoryFixture();
    const first = snapshotFixture(0);
    const second = snapshotFixture(1);

    const created = await repository.saveAgentSnapshot(first);
    await repository.saveAgentSnapshot(second);

    expect(created.serialNumber).toBe(1);
    expect((await repository.getAgentSnapshot(first.agentId, first.id))?.genome.soul).toBe(
      first.genome.soul,
    );
    expect((await repository.getAgentSnapshot(first.agentId))?.id).toBe(second.id);
    expect((await repository.getAgentListItemBySerialNumber(1))?.agentId).toBe(first.agentId);
    expect(await repository.listAgents()).toEqual([
      expect.objectContaining({
        agentId: first.agentId,
        currentSnapshotId: second.id,
        generation: 1,
      }),
    ]);

    await repository.close();
  });

  it("oppretter en persistent Evolution-jobb som kan leses igjen", async () => {
    const repository = await repositoryFixture();
    const job = await repository.enqueueEvolution(
      { generationCount: 12, populationSize: 20 },
      new Date("2026-08-21T20:00:00.000Z"),
    );

    expect(job.status).toBe("queued");
    await expect(repository.getEvolutionJob(job.id)).resolves.toMatchObject({
      id: job.id,
      input: { generationCount: 12, populationSize: 20 },
      status: "queued",
    });

    await repository.close();
  });

  it("binder heartbeat og fullføring til workeren som eier leasen", async () => {
    const { pool, repository } = await repositoryWithPoolFixture();
    const job = await repository.enqueueEvolution(
      { generationCount: 2 },
      new Date("2026-08-21T20:00:00.000Z"),
    );
    await pool.query(
      `UPDATE evolution_jobs
       SET status='running', lease_owner='worker-a', leased_at=now()
       WHERE id=$1`,
      [job.id],
    );

    await expect(repository.heartbeatEvolution(job.id, "worker-b")).resolves.toBe(false);
    await expect(repository.heartbeatEvolution(job.id, "worker-a")).resolves.toBe(true);
    await expect(repository.completeEvolution(job.id, "worker-b", { winner: "feil" })).resolves.toBe(
      false,
    );
    await expect(repository.completeEvolution(job.id, "worker-a", { winner: "riktig" })).resolves.toBe(
      true,
    );
    await expect(repository.getEvolutionJob(job.id)).resolves.toMatchObject({
      result: { winner: "riktig" },
      status: "completed",
    });

    await repository.close();
  });

  it("lar ikke en forsinket eldre snapshot rulle current-versjonen tilbake", async () => {
    const repository = await repositoryFixture();
    const first = snapshotFixture(0);
    const second = snapshotFixture(1);

    await repository.saveAgentSnapshot(second);
    await repository.saveAgentSnapshot(first);

    expect((await repository.getAgentSnapshot(first.agentId))?.id).toBe(second.id);
    expect((await repository.getAgentListItem(first.agentId))?.generation).toBe(1);
    expect(await repository.getAgentSnapshot(first.agentId, first.id)).not.toBeNull();

    await repository.close();
  });

  it("boots et lokalt pgmem-repositorium via createLaboratoryRepository", async () => {
    const { createLaboratoryRepository, ensureRepositorySchema } = await import("./repository");
    const repository = await createLaboratoryRepository("pgmem:local").then(ensureRepositorySchema);
    const snapshot = snapshotFixture(0);

    await repository.saveAgentSnapshot(snapshot);

    expect(await repository.getAgentSnapshot(snapshot.agentId)).not.toBeNull();
    await repository.close();
  });
});
