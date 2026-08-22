import { z } from "zod";

import { EntityIdSchema } from "./ids";

export const schemaVersion = "1.0" as const;
export const SchemaVersionSchema = z.literal(schemaVersion);
export const IsoDateSchema = z.string().datetime({ offset: true });
export const SeedSchema = z.string().trim().min(1).max(128);

export const AgentStrategySchema = z.enum([
  "adaptive",
  "cooperative",
  "opportunist",
  "risk_averse",
  "unpredictable",
]);

export type AgentStrategy = z.infer<typeof AgentStrategySchema>;

export const PlayerRoleSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    id: z.enum(["a", "b"]),
    name: z.string().trim().min(1).max(80),
    privateInformation: z.string().trim().max(500).optional(),
  })
  .strict();

export const ActionDefinitionSchema = z
  .object({
    description: z.string().trim().min(1).max(400),
    id: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    label: z.string().trim().min(1).max(60),
  })
  .strict();

export const PayoffRuleSchema = z
  .object({
    aAction: z.string().trim().min(1).max(32),
    aDelta: z.number().int().min(-1000).max(1000),
    bAction: z.string().trim().min(1).max(32),
    bDelta: z.number().int().min(-1000).max(1000),
    narrative: z.string().trim().min(1).max(500),
  })
  .strict();

export const ArenaSpecSchema = z
  .object({
    actions: z.array(ActionDefinitionSchema).min(2).max(6),
    budgets: z
      .object({
        maxMessageCharacters: z.number().int().min(0).max(1000),
        maxRounds: z.number().int().min(1).max(40),
        maxTurns: z.number().int().min(2).max(80),
      })
      .strict(),
    communication: z
      .object({
        enabled: z.boolean(),
        messagesPerRound: z.number().int().min(0).max(2),
      })
      .strict(),
    description: z.string().trim().min(1).max(1000),
    id: z.string().trim().regex(/^[a-z][a-z0-9-]{1,63}$/),
    initialScore: z.number().int().min(0).max(10000),
    payoffMatrix: z.array(PayoffRuleSchema).min(4).max(36),
    players: z.array(PlayerRoleSchema).length(2),
    randomness: z
      .object({
        seeded: z.literal(true),
      })
      .strict(),
    rounds: z.number().int().min(1).max(40),
    rules: z.array(z.string().trim().min(1).max(300)).min(2).max(12),
    schemaVersion: SchemaVersionSchema,
    scoring: z
      .object({
        drawAllowed: z.boolean(),
        higherWins: z.literal(true),
      })
      .strict(),
    title: z.string().trim().min(1).max(100),
    version: z.string().trim().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict()
  .superRefine((spec, context) => {
    const actionIds = new Set(spec.actions.map(({ id }) => id));
    const payoffPairs = new Set(
      spec.payoffMatrix.map(({ aAction, bAction }) => `${aAction}:${bAction}`),
    );

    for (const aAction of actionIds) {
      for (const bAction of actionIds) {
        if (!payoffPairs.has(`${aAction}:${bAction}`)) {
          context.addIssue({
            code: "custom",
            message: `Mangler poengregel for ${aAction}:${bAction}`,
            path: ["payoffMatrix"],
          });
        }
      }
    }
  });

export type ArenaSpec = z.infer<typeof ArenaSpecSchema>;

export const ProviderSnapshotSchema = z
  .object({
    capturedAt: IsoDateSchema,
    endpointFamily: z.enum(["chat-completions", "local-scripted", "responses"]),
    freeClassification: z.enum(["confirmed-free", "not-free", "unknown"]),
    id: EntityIdSchema,
    modelId: z.string().trim().min(1).max(200),
    providerId: z.enum(["mock", "nvidia-nim", "opencode-zen"]),
    supportsStructuredOutput: z.boolean(),
    supportsTools: z.boolean(),
  })
  .strict();

export type ProviderSnapshot = z.infer<typeof ProviderSnapshotSchema>;

export const AgentFilePathSchema = z.enum([
  "SOUL.md",
  "objectives.md",
  "policy.md",
  "risk-profile.json",
  "communication-policy.md",
  "memory-policy.md",
  "tools.md",
]);

export type AgentFilePath = z.infer<typeof AgentFilePathSchema>;

export const VirtualAgentFileSchema = z
  .object({
    content: z.string().max(16_000),
    mediaType: z.enum(["application/json", "text/markdown"]),
    path: AgentFilePathSchema,
  })
  .strict();

export type VirtualAgentFile = z.infer<typeof VirtualAgentFileSchema>;

export const MemoryWriteCandidateSchema = z
  .object({
    category: z.enum([
      "mistake",
      "opponent_model",
      "principle",
      "successful_pattern",
      "world_model",
    ]),
    content: z.string().trim().min(1).max(1_000),
  })
  .strict();

export type MemoryWriteCandidate = z.infer<typeof MemoryWriteCandidateSchema>;

export const AgentArtifactReferenceSchema = z
  .object({
    agentId: EntityIdSchema,
    genomeId: EntityIdSchema.optional(),
    memoryId: EntityIdSchema.optional(),
    snapshotId: EntityIdSchema.optional(),
  })
  .strict();

export type AgentArtifactReference = z.infer<typeof AgentArtifactReferenceSchema>;

export const AgentConfigurationSchema = z
  .object({
    files: z.array(VirtualAgentFileSchema).max(7).optional(),
    genomeId: EntityIdSchema.optional(),
    id: EntityIdSchema,
    memoryContext: z.array(MemoryWriteCandidateSchema).max(200).optional(),
    memoryId: EntityIdSchema.optional(),
    modelId: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(60),
    providerId: z.enum(["mock", "nvidia-nim", "opencode-zen"]),
    snapshotId: EntityIdSchema.optional(),
    soul: z.string().trim().min(1).max(16_000).optional(),
    strategy: AgentStrategySchema,
  })
  .strict();

export type AgentConfiguration = z.infer<typeof AgentConfigurationSchema>;

export const DecisionTraceSchema = z
  .object({
    actionId: z.string().trim().min(1).max(32),
    confidence: z.number().min(0).max(1),
    goal: z.string().trim().min(1).max(300),
    message: z.string().trim().max(1000),
    memoryWrite: MemoryWriteCandidateSchema.optional(),
    observation: z.string().trim().min(1).max(1000),
    rationale: z.string().trim().min(1).max(600),
  })
  .strict();

export type DecisionTrace = z.infer<typeof DecisionTraceSchema>;

export const DuelRequestSchema = z
  .object({
    agentA: AgentConfigurationSchema,
    agentB: AgentConfigurationSchema,
    arenaId: z.string().trim().min(1).max(64).optional(),
    arenaSpec: ArenaSpecSchema.optional(),
    seed: SeedSchema,
    swapSides: z.boolean().default(false),
  })
  .strict()
  .superRefine((request, context) => {
    if ((request.arenaId === undefined) === (request.arenaSpec === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Oppgi nøyaktig én av arenaId og arenaSpec",
        path: ["arenaId"],
      });
    }
  });

export type DuelRequest = z.infer<typeof DuelRequestSchema>;

export const EventTypeSchema = z.enum([
  "duel.created",
  "round.started",
  "agent.decided",
  "action.accepted",
  "round.resolved",
  "duel.finished",
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const EventEnvelopeSchema = z
  .object({
    actorId: EntityIdSchema.optional(),
    agentSnapshotId: EntityIdSchema.optional(),
    arenaVersion: z.string().trim().min(1).max(30),
    genomeId: EntityIdSchema.optional(),
    id: EntityIdSchema,
    matchId: EntityIdSchema,
    memoryId: EntityIdSchema.optional(),
    occurredAt: IsoDateSchema,
    payload: z.record(z.string(), z.unknown()),
    schemaVersion: SchemaVersionSchema,
    seed: SeedSchema,
    sequence: z.number().int().nonnegative(),
    type: EventTypeSchema,
  })
  .strict();

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const DuelResultSchema = z
  .object({
    agentArtifacts: z
      .object({
        a: AgentArtifactReferenceSchema,
        b: AgentArtifactReferenceSchema,
      })
      .strict()
      .optional(),
    arena: ArenaSpecSchema,
    completedAt: IsoDateSchema,
    // Maksimal legitim duell: created + 40 * 6 rundehendelser + finished.
    events: z.array(EventEnvelopeSchema).min(4).max(242),
    matchId: EntityIdSchema,
    providerSnapshots: z.array(ProviderSnapshotSchema).length(2),
    replayFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
    scores: z
      .object({
        a: z.number().int(),
        b: z.number().int(),
      })
      .strict(),
    seed: SeedSchema,
    winner: z.enum(["a", "b", "draw"]),
  })
  .strict();

export type DuelResult = z.infer<typeof DuelResultSchema>;

export const GenomeSnapshotSchema = z
  .object({
    communicationPolicy: z.string().max(4000),
    files: z.array(VirtualAgentFileSchema).min(1).max(7),
    generation: z.number().int().nonnegative(),
    id: EntityIdSchema,
    mutation: z
      .object({
        changedFiles: z.array(AgentFilePathSchema).max(7),
        modelId: z.string().trim().min(1).max(200),
        operator: z.enum([
          "compression",
          "counter_strategy",
          "crossover",
          "randomized",
          "reflection",
          "specialization",
        ]),
        promptVersion: z.string().trim().min(1).max(50),
        providerId: z.enum(["nvidia-nim", "opencode-zen"]),
        summary: z.string().trim().min(1).max(1_000),
        validationStatus: z.literal("accepted"),
      })
      .strict()
      .optional(),
    objectives: z.array(z.string().min(1).max(500)).min(1).max(12),
    parentIds: z.array(EntityIdSchema).max(2),
    riskProfile: z.number().min(0).max(1),
    soul: z.string().min(1).max(16000),
  })
  .strict()
  .superRefine((genome, context) => {
    const paths = new Set<string>();
    for (const [index, file] of genome.files.entries()) {
      if (paths.has(file.path)) {
        context.addIssue({
          code: "custom",
          message: `Filen ${file.path} finnes flere ganger`,
          path: ["files", index, "path"],
        });
      }
      paths.add(file.path);
    }
    const soulFile = genome.files.find(({ path }) => path === "SOUL.md");
    if (soulFile === undefined || soulFile.content !== genome.soul) {
      context.addIssue({
        code: "custom",
        message: "SOUL.md må finnes og være identisk med genomets soul-felt",
        path: ["files"],
      });
    }
  });

export type GenomeSnapshot = z.infer<typeof GenomeSnapshotSchema>;

export const MemoryItemSchema = z
  .object({
    category: z.enum([
      "mistake",
      "opponent_model",
      "principle",
      "successful_pattern",
      "world_model",
    ]),
    content: z.string().trim().min(1).max(1000),
    createdAt: IsoDateSchema,
    sourceMatchId: EntityIdSchema,
  })
  .strict();

export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const MemorySnapshotSchema = z
  .object({
    agentId: EntityIdSchema,
    budgetCharacters: z.number().int().min(100).max(100000),
    createdAt: IsoDateSchema,
    generation: z.number().int().nonnegative(),
    id: EntityIdSchema,
    items: z.array(MemoryItemSchema).max(200),
    parentId: EntityIdSchema.optional(),
  })
  .strict();

export type MemorySnapshot = z.infer<typeof MemorySnapshotSchema>;

export const AgentSnapshotSchema = z
  .object({
    agentId: EntityIdSchema,
    createdAt: IsoDateSchema,
    genome: GenomeSnapshotSchema,
    id: EntityIdSchema,
    memory: MemorySnapshotSchema,
    modelId: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(60),
    parentSnapshotIds: z.array(EntityIdSchema).max(2),
    providerId: z.enum(["mock", "nvidia-nim", "opencode-zen"]),
    status: z.enum(["active", "baseline", "champion", "retired"]),
    strategy: AgentStrategySchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.memory.agentId !== snapshot.agentId) {
      context.addIssue({
        code: "custom",
        message: "Minnet tilhører ikke agenten i snapshotet",
        path: ["memory", "agentId"],
      });
    }
    if (snapshot.memory.generation !== snapshot.genome.generation) {
      context.addIssue({
        code: "custom",
        message: "Genom og minne må tilhøre samme generasjon",
        path: ["memory", "generation"],
      });
    }
  });

export type AgentSnapshot = z.infer<typeof AgentSnapshotSchema>;

export const LineageEdgeSchema = z
  .object({
    childGenomeId: EntityIdSchema,
    id: EntityIdSchema,
    mutationOperator: z.enum([
      "compression",
      "counter_strategy",
      "crossover",
      "randomized",
      "reflection",
      "specialization",
    ]),
    parentGenomeIds: z.array(EntityIdSchema).min(1).max(2),
  })
  .strict();

export type LineageEdge = z.infer<typeof LineageEdgeSchema>;

export const ExperimentSchema = z
  .object({
    arenaVersion: z.string().min(1),
    createdAt: IsoDateSchema,
    id: EntityIdSchema,
    name: z.string().trim().min(1).max(120),
    status: z.enum(["draft", "queued", "running", "completed", "failed"]),
  })
  .strict();

export type Experiment = z.infer<typeof ExperimentSchema>;

export const RunSchema = z
  .object({
    codeCommit: z.string().min(7).max(64),
    experimentId: EntityIdSchema,
    id: EntityIdSchema,
    seed: SeedSchema,
    status: z.enum(["queued", "running", "completed", "failed"]),
  })
  .strict();

export type Run = z.infer<typeof RunSchema>;

export const GenerationSchema = z
  .object({
    activeAgentIds: z.array(EntityIdSchema),
    id: EntityIdSchema,
    number: z.number().int().nonnegative(),
    runId: EntityIdSchema,
  })
  .strict();

export type Generation = z.infer<typeof GenerationSchema>;

export const MatchSchema = z
  .object({
    arenaId: EntityIdSchema,
    id: EntityIdSchema,
    participantIds: z.array(EntityIdSchema).length(2),
    seed: SeedSchema,
    status: z.enum(["queued", "running", "completed", "failed"]),
  })
  .strict();

export type Match = z.infer<typeof MatchSchema>;

export const EvaluationSchema = z
  .object({
    agentId: EntityIdSchema,
    arenaVersion: z.string().min(1),
    id: EntityIdSchema,
    sampleCount: z.number().int().positive(),
    score: z.number(),
    seedSetHash: z.string().min(8).max(128),
    uncertainty: z.number().nonnegative(),
  })
  .strict();

export type Evaluation = z.infer<typeof EvaluationSchema>;
