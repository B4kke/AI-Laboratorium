import {
  AgentSnapshotSchema,
  DuelResultSchema,
  EventEnvelopeSchema,
  LineageEdgeSchema,
  ProviderSnapshotSchema,
  createDeterministicId,
  type AgentSnapshot,
  type DuelResult,
  type EntityId,
  type EventEnvelope,
  type LineageEdge,
  type ProviderSnapshot,
} from "@ai-lab/domain";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { z } from "zod";

import { databaseSchemaSql } from "./schema";

export type AgentListItem = {
  agentId: EntityId;
  createdAt: string;
  currentSnapshotId: EntityId;
  generation: number;
  memoryItems: number;
  modelId: string;
  name: string;
  providerId: AgentSnapshot["providerId"];
  serialNumber: number;
  status: AgentSnapshot["status"];
};

export type EvolutionJobStatus = "completed" | "failed" | "queued" | "running";

export type EvolutionJob<TInput = unknown, TResult = unknown> = {
  createdAt: string;
  error: string | null;
  id: EntityId;
  input: TInput;
  progress: unknown;
  result: TResult | null;
  status: EvolutionJobStatus;
  updatedAt: string;
};

export type EvolutionStepKind = "duel" | "mutation" | "population";

export type EvolutionStep<TPayload = unknown> = {
  jobId: EntityId;
  kind: EvolutionStepKind;
  payload: TPayload;
  stepId: string;
};

export type EvolutionFeedItem = {
  actionId: string;
  actorName: string;
  generationNumber: number;
  matchId: EntityId;
  message: string;
  rationale: string;
  round: number;
};

type Queryable = {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rowCount: number | null; rows: TRow[] }>;
};

const AgentRowSchema = z.object({
  created_at: z.coerce.date(),
  current_snapshot_id: z.string(),
  generation: z.number().int().nonnegative(),
  id: z.string(),
  model_id: z.string(),
  name: z.string(),
  provider_id: z.enum(["mock", "nvidia-nim", "opencode-zen"]),
  serial_number: z.coerce.number().int().positive(),
  snapshot: z.unknown(),
  status: z.enum(["active", "baseline", "champion", "retired"]),
});

const JobRowSchema = z.object({
  created_at: z.coerce.date(),
  error: z.string().nullable(),
  id: z.string(),
  input: z.unknown(),
  progress: z.unknown().nullable(),
  result: z.unknown().nullable(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  updated_at: z.coerce.date(),
});

function toAgentListItem(rowInput: unknown): AgentListItem {
  const parsed = AgentRowSchema.parse(rowInput);
  const snapshot = AgentSnapshotSchema.parse(parsed.snapshot);
  return {
    agentId: parsed.id as EntityId,
    createdAt: parsed.created_at.toISOString(),
    currentSnapshotId: parsed.current_snapshot_id as EntityId,
    generation: parsed.generation,
    memoryItems: snapshot.memory.items.length,
    modelId: parsed.model_id,
    name: parsed.name,
    providerId: parsed.provider_id,
    serialNumber: parsed.serial_number,
    status: parsed.status,
  };
}

function toJob<TInput, TResult>(rowInput: unknown): EvolutionJob<TInput, TResult> {
  const row = JobRowSchema.parse(rowInput);
  return {
    createdAt: row.created_at.toISOString(),
    error: row.error,
    id: row.id as EntityId,
    input: row.input as TInput,
    progress: row.progress,
    result: row.result as TResult | null,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
  };
}

async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class LaboratoryRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async ensureSchema(): Promise<void> {
    await this.#pool.query(databaseSchemaSql);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async ping(): Promise<void> {
    await this.#pool.query("SELECT 1");
  }

  async saveAgentSnapshot(snapshotInput: AgentSnapshot): Promise<AgentListItem> {
    const snapshot = AgentSnapshotSchema.parse(snapshotInput);
    await transaction(this.#pool, async (client) => {
      await client.query(
        `INSERT INTO agents(id, name, status, current_snapshot_id, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, $4, $4)
         ON CONFLICT (id) DO NOTHING`,
        [snapshot.agentId, snapshot.name, snapshot.status, snapshot.createdAt],
      );
      await client.query(
        `INSERT INTO agent_snapshots(
           id, agent_id, generation, provider_id, model_id, genome_id, memory_id,
           parent_snapshot_ids, snapshot, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          snapshot.id,
          snapshot.agentId,
          snapshot.genome.generation,
          snapshot.providerId,
          snapshot.modelId,
          snapshot.genome.id,
          snapshot.memory.id,
          snapshot.parentSnapshotIds,
          JSON.stringify(snapshot),
          snapshot.createdAt,
        ],
      );
      await client.query(
        `UPDATE agents
         SET name=$2, status=$3, current_snapshot_id=$4, updated_at=$5,
             current_generation=$6
         WHERE id=$1
           AND (
             current_generation < $6
             OR (current_generation = $6 AND updated_at <= $5)
           )`,
        [
          snapshot.agentId,
          snapshot.name,
          snapshot.status,
          snapshot.id,
          snapshot.createdAt,
          snapshot.genome.generation,
        ],
      );
    });
    const item = await this.getAgentListItem(snapshot.agentId);
    if (item === null) throw new Error(`Agenten ${snapshot.agentId} ble ikke lagret`);
    return item;
  }

  async getAgentSnapshot(agentId: EntityId, snapshotId?: EntityId): Promise<AgentSnapshot | null> {
    const result = await this.#pool.query<{ snapshot: unknown }>(
      snapshotId === undefined
        ? `SELECT s.snapshot
           FROM agents a JOIN agent_snapshots s ON s.id = a.current_snapshot_id
           WHERE a.id=$1`
        : `SELECT snapshot FROM agent_snapshots WHERE agent_id=$1 AND id=$2`,
      snapshotId === undefined ? [agentId] : [agentId, snapshotId],
    );
    const row = result.rows[0];
    return row === undefined ? null : AgentSnapshotSchema.parse(row.snapshot);
  }

  async listAgentSnapshots(agentId: EntityId): Promise<readonly AgentSnapshot[]> {
    const result = await this.#pool.query<{ snapshot: unknown }>(
      `SELECT snapshot FROM agent_snapshots
       WHERE agent_id=$1
       ORDER BY generation ASC, created_at ASC, id ASC`,
      [agentId],
    );
    return result.rows.map(({ snapshot }) => AgentSnapshotSchema.parse(snapshot));
  }

  async listLineageForGenomeIds(genomeIds: readonly EntityId[]): Promise<readonly LineageEdge[]> {
    if (genomeIds.length === 0) return [];
    const result = await this.#pool.query<{ edge: unknown }>(
      `SELECT edge FROM lineage_edges
       WHERE child_genome_id = ANY($1::text[])
          OR parent_genome_ids && $1::text[]
       ORDER BY created_at ASC, id ASC`,
      [genomeIds],
    );
    return result.rows.map(({ edge }) => LineageEdgeSchema.parse(edge));
  }

  async listAgents(limit = 100): Promise<readonly AgentListItem[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const result = await this.#pool.query(
      `SELECT a.id, a.serial_number, a.name, a.status, a.created_at,
              a.current_snapshot_id, s.generation, s.provider_id, s.model_id,
              s.snapshot
       FROM agents a JOIN agent_snapshots s ON s.id = a.current_snapshot_id
       ORDER BY a.serial_number DESC LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map(toAgentListItem);
  }

  async getAgentListItem(agentId: EntityId): Promise<AgentListItem | null> {
    const result = await this.#pool.query(
      `SELECT a.id, a.serial_number, a.name, a.status, a.created_at,
              a.current_snapshot_id, s.generation, s.provider_id, s.model_id,
              s.snapshot
       FROM agents a JOIN agent_snapshots s ON s.id = a.current_snapshot_id
       WHERE a.id=$1`,
      [agentId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toAgentListItem(row);
  }

  async getAgentListItemBySerialNumber(serialNumber: number): Promise<AgentListItem | null> {
    if (!Number.isSafeInteger(serialNumber) || serialNumber < 1) return null;
    const result = await this.#pool.query(
      `SELECT a.id, a.serial_number, a.name, a.status, a.created_at,
              a.current_snapshot_id, s.generation, s.provider_id, s.model_id,
              s.snapshot
       FROM agents a JOIN agent_snapshots s ON s.id = a.current_snapshot_id
       WHERE a.serial_number=$1`,
      [serialNumber],
    );
    const row = result.rows[0];
    return row === undefined ? null : toAgentListItem(row);
  }

  async getLatestChampionSnapshot(): Promise<AgentSnapshot | null> {
    const result = await this.#pool.query<{ snapshot: unknown }>(
      `SELECT s.snapshot
       FROM agents a JOIN agent_snapshots s ON s.id = a.current_snapshot_id
       WHERE a.status='champion'
       ORDER BY a.updated_at DESC, a.serial_number DESC
       LIMIT 1`,
    );
    const row = result.rows[0];
    return row === undefined ? null : AgentSnapshotSchema.parse(row.snapshot);
  }

  async updateAgentStatus(
    agentId: EntityId,
    status: AgentSnapshot["status"],
  ): Promise<void> {
    await this.#pool.query(
      `UPDATE agents SET status=$2, updated_at=now() WHERE id=$1`,
      [agentId, status],
    );
  }

  async saveLineage(runId: EntityId, edges: readonly LineageEdge[]): Promise<void> {
    await transaction(this.#pool, async (client) => {
      for (const edgeInput of edges) {
        const edge = LineageEdgeSchema.parse(edgeInput);
        await client.query(
          `INSERT INTO lineage_edges(
             id, run_id, parent_genome_ids, child_genome_id, mutation_operator, edge
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [
            edge.id,
            runId,
            edge.parentGenomeIds,
            edge.childGenomeId,
            edge.mutationOperator,
            JSON.stringify(edge),
          ],
        );
      }
    });
  }

  async saveDuel(
    resultInput: DuelResult,
    context: {
      evolutionJobId?: EntityId;
      evolutionStepId?: string;
      generationNumber?: number;
    } = {},
  ): Promise<void> {
    const result = DuelResultSchema.parse(resultInput);
    await transaction(this.#pool, async (client) => {
      await client.query(
        `INSERT INTO duel_runs(
           match_id, arena_id, arena_version, seed, result, completed_at,
           evolution_job_id, generation_number, evolution_step_id
         )
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
         ON CONFLICT (match_id) DO UPDATE SET
           evolution_job_id=COALESCE(duel_runs.evolution_job_id, EXCLUDED.evolution_job_id),
           generation_number=COALESCE(duel_runs.generation_number, EXCLUDED.generation_number),
           evolution_step_id=COALESCE(duel_runs.evolution_step_id, EXCLUDED.evolution_step_id)`,
        [
          result.matchId,
          result.arena.id,
          result.arena.version,
          result.seed,
          JSON.stringify(result),
          result.completedAt,
          context.evolutionJobId ?? null,
          context.generationNumber ?? null,
          context.evolutionStepId ?? null,
        ],
      );
      for (const event of result.events) {
        await client.query(
          `INSERT INTO events(id, match_id, sequence, event_type, event, occurred_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6)
           ON CONFLICT (id) DO NOTHING`,
          [event.id, event.matchId, event.sequence, event.type, JSON.stringify(event), event.occurredAt],
        );
      }
    });
  }

  async saveProviderSnapshot(runId: EntityId, snapshotInput: ProviderSnapshot): Promise<void> {
    const snapshot = ProviderSnapshotSchema.parse(snapshotInput);
    await this.#pool.query(
      `INSERT INTO provider_snapshots(
         run_id, snapshot_id, provider_id, model_id, snapshot, captured_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (run_id, snapshot_id) DO NOTHING`,
      [
        runId,
        snapshot.id,
        snapshot.providerId,
        snapshot.modelId,
        JSON.stringify(snapshot),
        snapshot.capturedAt,
      ],
    );
  }

  async saveEvolutionStep<TPayload>(
    jobId: EntityId,
    stepId: string,
    kind: EvolutionStepKind,
    payload: TPayload,
  ): Promise<void> {
    if (stepId.length === 0 || stepId.length > 200) throw new Error("Ugyldig Evolution-steg-ID");
    await this.#pool.query(
      `INSERT INTO evolution_steps(job_id, step_id, kind, payload)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (job_id, step_id) DO NOTHING`,
      [jobId, stepId, kind, JSON.stringify(payload)],
    );
  }

  async getEvolutionStep<TPayload = unknown>(
    jobId: EntityId,
    stepId: string,
    kind: EvolutionStepKind,
  ): Promise<EvolutionStep<TPayload> | null> {
    const result = await this.#pool.query<{ kind: EvolutionStepKind; payload: TPayload }>(
      `SELECT kind, payload FROM evolution_steps WHERE job_id=$1 AND step_id=$2 AND kind=$3`,
      [jobId, stepId, kind],
    );
    const row = result.rows[0];
    return row === undefined ? null : { jobId, kind: row.kind, payload: row.payload, stepId };
  }

  async listEvolutionJobs<TInput = unknown, TResult = unknown>(
    limit = 20,
  ): Promise<readonly EvolutionJob<TInput, TResult>[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.#pool.query(
      `SELECT * FROM evolution_jobs ORDER BY created_at DESC LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map((row) => toJob<TInput, TResult>(row));
  }

  async listEvolutionFeed(jobId: EntityId, limit = 30): Promise<readonly EvolutionFeedItem[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.#pool.query<{ event: unknown; generation_number: number }>(
      `SELECT generation_number, event FROM evolution_feed_events
       WHERE job_id=$1
       ORDER BY occurred_at DESC, event_id DESC
       LIMIT $2`,
      [jobId, safeLimit * 4],
    );
    return result.rows
      .toReversed()
      .flatMap((row) => {
        const event = EventEnvelopeSchema.parse(row.event);
        if (event.type !== "agent.decided") return [];
        const payload = event.payload as {
          actorName?: unknown;
          round?: unknown;
          trace?: {
            actionId?: unknown;
            message?: unknown;
            rationale?: unknown;
          };
        };
        if (
          typeof payload.actorName !== "string" ||
          typeof payload.round !== "number" ||
          typeof payload.trace?.actionId !== "string" ||
          typeof payload.trace.message !== "string" ||
          typeof payload.trace.rationale !== "string"
        ) {
          return [];
        }
        return [{
          actionId: payload.trace.actionId,
          actorName: payload.actorName,
          generationNumber: row.generation_number,
          matchId: event.matchId,
          message: payload.trace.message,
          rationale: payload.trace.rationale,
          round: payload.round,
        }];
      })
      .slice(-safeLimit);
  }

  async saveEvolutionFeedEvent(
    jobId: EntityId,
    stepId: string,
    generationNumber: number,
    eventInput: EventEnvelope,
  ): Promise<void> {
    if (stepId.length === 0 || stepId.length > 200) throw new Error("Ugyldig Evolution-steg-ID");
    if (!Number.isInteger(generationNumber) || generationNumber < 0) {
      throw new Error("Ugyldig generasjonsnummer for Evolution-feed");
    }
    const event = EventEnvelopeSchema.parse(eventInput);
    await this.#pool.query(
      `INSERT INTO evolution_feed_events(
       event_id, job_id, step_id, generation_number, event, occurred_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (event_id) DO UPDATE SET
         event=EXCLUDED.event,
         occurred_at=EXCLUDED.occurred_at`,
      [event.id, jobId, stepId, generationNumber, JSON.stringify(event), event.occurredAt],
    );
  }

  async enqueueEvolution<TInput>(input: TInput, clock = new Date()): Promise<EvolutionJob<TInput>> {
    const id = createDeterministicId(
      "run",
      `evolution-${clock.getTime()}-${crypto.randomUUID()}`,
    );
    const result = await this.#pool.query(
      `INSERT INTO evolution_jobs(id, input, status, created_at, updated_at)
       VALUES ($1,$2::jsonb,'queued',$3,$3)
       RETURNING *`,
      [id, JSON.stringify(input), clock.toISOString()],
    );
    return toJob<TInput, never>(result.rows[0]);
  }

  async getEvolutionJob<TInput = unknown, TResult = unknown>(
    id: EntityId,
  ): Promise<EvolutionJob<TInput, TResult> | null> {
    const result = await this.#pool.query(`SELECT * FROM evolution_jobs WHERE id=$1`, [id]);
    const row = result.rows[0];
    return row === undefined ? null : toJob<TInput, TResult>(row);
  }

  async claimEvolutionJob<TInput = unknown>(
    workerId: string,
    leaseTimeoutSeconds = 300,
  ): Promise<EvolutionJob<TInput> | null> {
    const safeLeaseTimeoutSeconds = Math.max(30, Math.trunc(leaseTimeoutSeconds));
    const staleBefore = new Date(Date.now() - safeLeaseTimeoutSeconds * 1_000).toISOString();
    const result = await this.#pool.query(
      `WITH next_job AS (
         SELECT id FROM evolution_jobs
         WHERE status='queued'
            OR (status='running' AND leased_at < $2)
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE evolution_jobs j
       SET status='running', lease_owner=$1, leased_at=now(), updated_at=now(), error=NULL
       FROM next_job
       WHERE j.id=next_job.id
       RETURNING j.*`,
      [workerId, staleBefore],
    );
    const row = result.rows[0];
    return row === undefined ? null : toJob<TInput, never>(row);
  }

  async updateEvolutionProgress(
    id: EntityId,
    workerId: string,
    progress: unknown,
  ): Promise<boolean> {
    const result = await this.#pool.query(
      `UPDATE evolution_jobs
       SET progress=$2::jsonb, leased_at=now(), updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$3`,
      [id, JSON.stringify(progress), workerId],
    );
    return result.rowCount === 1;
  }

  async heartbeatEvolution(id: EntityId, workerId: string): Promise<boolean> {
    const result = await this.#pool.query(
      `UPDATE evolution_jobs
       SET leased_at=now(), updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$2`,
      [id, workerId],
    );
    return result.rowCount === 1;
  }

  async completeEvolution(id: EntityId, workerId: string, result: unknown): Promise<boolean> {
    const update = await this.#pool.query(
      `UPDATE evolution_jobs
       SET status='completed', result=$2::jsonb, progress=NULL, leased_at=NULL, updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$3`,
      [id, JSON.stringify(result), workerId],
    );
    return update.rowCount === 1;
  }

  async failEvolution(id: EntityId, workerId: string, error: string): Promise<boolean> {
    const result = await this.#pool.query(
      `UPDATE evolution_jobs
       SET status='failed', error=$2, leased_at=NULL, updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$3`,
      [id, error.slice(0, 4_000), workerId],
    );
    return result.rowCount === 1;
  }

  async releaseEvolution(id: EntityId, workerId: string): Promise<boolean> {
    const result = await this.#pool.query(
      `UPDATE evolution_jobs
       SET status='queued', lease_owner=NULL, leased_at=NULL, updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$2`,
      [id, workerId],
    );
    return result.rowCount === 1;
  }
}

export async function createLaboratoryRepository(connectionString: string): Promise<LaboratoryRepository> {
  if (connectionString.startsWith("pgmem:")) {
    // Lokal utviklingsmodus: Postgres i prosessen via pg-mem. Data lever bare
    // så lenge prosessen kjører - ingen ekstern tjeneste kreves.
    const { newDb } = await import("pg-mem");
    const database = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = database.adapters.createPg();
    return new LaboratoryRepository(new adapter.Pool() as unknown as Pool);
  }
  const url = new URL(connectionString);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL må bruke postgres://, postgresql:// eller pgmem:");
  }
  const configuredPoolSize = Number(process.env.DATABASE_POOL_SIZE ?? 5);
  const poolSize = Number.isInteger(configuredPoolSize)
    ? Math.max(1, Math.min(50, configuredPoolSize))
    : 5;
  return new LaboratoryRepository(
    new Pool({
      connectionString,
      max: poolSize,
    }),
  );
}

export async function ensureRepositorySchema(repository: LaboratoryRepository): Promise<LaboratoryRepository> {
  await repository.ensureSchema();
  return repository;
}

export type { Queryable };
