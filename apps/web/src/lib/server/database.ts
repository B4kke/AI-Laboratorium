import {
  createLaboratoryRepository,
  ensureRepositorySchema,
  type LaboratoryRepository,
} from "@ai-lab/db";

import { ApiUnavailableError } from "./http";

let repositoryPromise: Promise<LaboratoryRepository> | undefined;

function connectionString(): string | undefined {
  const value = process.env.DATABASE_URL?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export function isDatabaseConfigured(): boolean {
  return connectionString() !== undefined;
}

export function getLaboratoryRepository(): Promise<LaboratoryRepository> {
  const configured = connectionString();
  if (configured === undefined) {
    throw new ApiUnavailableError(
      "Agentbibliotek og Evolution krever en konfigurert PostgreSQL DATABASE_URL",
    );
  }
  repositoryPromise ??= ensureRepositorySchema(createLaboratoryRepository(configured));
  return repositoryPromise;
}

export async function getOptionalLaboratoryRepository(): Promise<LaboratoryRepository | null> {
  return isDatabaseConfigured() ? getLaboratoryRepository() : null;
}
