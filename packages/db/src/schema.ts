export const databaseSchemaVersion = 2;

export const databaseSchemaSql = `
CREATE TABLE IF NOT EXISTS schema_versions (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS agent_serial_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  serial_number bigint NOT NULL UNIQUE DEFAULT nextval('agent_serial_number_seq'),
  name varchar(60) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('active', 'baseline', 'champion', 'retired')),
  current_snapshot_id text,
  current_generation integer NOT NULL DEFAULT -1 CHECK (current_generation >= -1),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS current_generation integer NOT NULL DEFAULT -1;

CREATE TABLE IF NOT EXISTS agent_snapshots (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES agents(id),
  generation integer NOT NULL CHECK (generation >= 0),
  provider_id varchar(30) NOT NULL,
  model_id varchar(200) NOT NULL,
  genome_id text NOT NULL,
  memory_id text NOT NULL,
  parent_snapshot_ids text[] NOT NULL DEFAULT '{}',
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

UPDATE agents
SET current_generation = snapshots.generation
FROM agent_snapshots AS snapshots
WHERE agents.current_snapshot_id = snapshots.id
  AND agents.current_generation = -1;

CREATE INDEX IF NOT EXISTS agent_snapshots_agent_generation_idx
  ON agent_snapshots(agent_id, generation DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS lineage_edges (
  id text PRIMARY KEY,
  run_id text NOT NULL,
  parent_genome_ids text[] NOT NULL,
  child_genome_id text NOT NULL,
  mutation_operator varchar(40) NOT NULL,
  edge jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lineage_edges_run_idx ON lineage_edges(run_id);

CREATE TABLE IF NOT EXISTS duel_runs (
  match_id text PRIMARY KEY,
  arena_id varchar(64) NOT NULL,
  arena_version varchar(30) NOT NULL,
  seed varchar(128) NOT NULL,
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  match_id text NOT NULL REFERENCES duel_runs(match_id),
  sequence integer NOT NULL CHECK (sequence >= 0),
  event_type varchar(60) NOT NULL,
  event jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE(match_id, sequence)
);

CREATE TABLE IF NOT EXISTS evolution_jobs (
  id text PRIMARY KEY,
  input jsonb NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress jsonb,
  result jsonb,
  error text,
  lease_owner text,
  leased_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS evolution_jobs_claim_idx
  ON evolution_jobs(status, created_at);

INSERT INTO schema_versions(version) VALUES (${databaseSchemaVersion})
ON CONFLICT (version) DO NOTHING;
`;
