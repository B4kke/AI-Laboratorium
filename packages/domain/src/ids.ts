import { z } from "zod";

export const entityPrefixes = [
  "agent",
  "arena",
  "eval",
  "event",
  "experiment",
  "generation",
  "genome",
  "lineage",
  "match",
  "memory",
  "provider",
  "report",
  "run",
] as const;

export type EntityPrefix = (typeof entityPrefixes)[number];

export const EntityIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(
    /^(agent|arena|eval|event|experiment|generation|genome|lineage|match|memory|provider|report|run)_[a-zA-Z0-9_-]+$/,
    "Ugyldig entitets-ID",
  );

export type EntityId = z.infer<typeof EntityIdSchema>;

export function createEntityId(prefix: EntityPrefix, entropy = crypto.randomUUID()): EntityId {
  return EntityIdSchema.parse(`${prefix}_${entropy}`);
}

export function createDeterministicId(prefix: EntityPrefix, value: string): EntityId {
  const safeValue = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return EntityIdSchema.parse(`${prefix}_${safeValue}`);
}
