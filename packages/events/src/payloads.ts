import { DecisionTraceSchema, EventTypeSchema } from "@ai-lab/domain";
import { z } from "zod";

const DuelCreatedPayloadSchema = z
  .object({
    agentAName: z.string().min(1).max(60),
    agentBName: z.string().min(1).max(60),
    arenaTitle: z.string().min(1).max(100),
    rounds: z.number().int().positive().max(40),
  })
  .strict();

const RoundStartedPayloadSchema = z
  .object({ round: z.number().int().positive().max(40) })
  .strict();

const AgentDecidedPayloadSchema = z
  .object({
    actorName: z.string().min(1).max(60),
    round: z.number().int().positive().max(40),
    trace: DecisionTraceSchema,
  })
  .strict();

const ActionAcceptedPayloadSchema = z
  .object({
    actionId: z.string().min(1).max(32),
    actionLabel: z.string().min(1).max(60),
    actorName: z.string().min(1).max(60),
    round: z.number().int().positive().max(40),
  })
  .strict();

const RoundResolvedPayloadSchema = z
  .object({
    aDelta: z.number().int(),
    aScore: z.number().int(),
    bDelta: z.number().int(),
    bScore: z.number().int(),
    narrative: z.string().min(1).max(500),
    round: z.number().int().positive().max(40),
  })
  .strict();

const DuelFinishedPayloadSchema = z
  .object({
    aScore: z.number().int(),
    bScore: z.number().int(),
    winner: z.enum(["a", "b", "draw"]),
  })
  .strict();

export const eventPayloadSchemas = {
  "action.accepted": ActionAcceptedPayloadSchema,
  "agent.decided": AgentDecidedPayloadSchema,
  "duel.created": DuelCreatedPayloadSchema,
  "duel.finished": DuelFinishedPayloadSchema,
  "round.resolved": RoundResolvedPayloadSchema,
  "round.started": RoundStartedPayloadSchema,
} satisfies Record<z.infer<typeof EventTypeSchema>, z.ZodType>;

export type EventPayloadMap = {
  [TType in keyof typeof eventPayloadSchemas]: z.infer<(typeof eventPayloadSchemas)[TType]>;
};

export function parseEventPayload<TType extends keyof EventPayloadMap>(
  type: TType,
  payload: unknown,
): EventPayloadMap[TType] {
  return eventPayloadSchemas[type].parse(payload) as EventPayloadMap[TType];
}
