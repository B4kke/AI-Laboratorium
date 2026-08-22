import type {
  AgentStrategy,
  DecisionTrace,
  MemoryWriteCandidate,
  ProviderSnapshot,
  VirtualAgentFile,
} from "@ai-lab/domain";

export type FreeClassification = ProviderSnapshot["freeClassification"];
export type ProviderId = ProviderSnapshot["providerId"];

export type ModelDescriptor = {
  displayName: string;
  endpointFamily: ProviderSnapshot["endpointFamily"];
  freeClassification: FreeClassification;
  id: string;
  providerId: ProviderId;
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
};

export type ProviderHealth = {
  message: string;
  status: "available" | "degraded" | "not-configured" | "unavailable";
};

export type ConversationMessage = {
  message: string;
  round: number;
  speakerId: string;
  speakerName: string;
};

export type DecisionRequest = {
  actorName: string;
  allowedActions: ReadonlyArray<{ description: string; id: string; label: string }>;
  conversationHistory: readonly ConversationMessage[];
  files?: readonly VirtualAgentFile[];
  memoryContext?: readonly MemoryWriteCandidate[];
  modelId: string;
  observation: string;
  opponentLastAction?: string;
  opponentLastMessage?: string;
  prompt: string;
  round: number;
  seed: string;
  soul?: string;
  strategy: AgentStrategy;
};

export type NormalizedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type DecisionResult = {
  finishReason: string;
  latencyMs: number;
  modelId: string;
  providerId: ProviderId;
  trace: DecisionTrace;
  usage: NormalizedUsage;
};

export type TextGenerationRequest = {
  maxTokens?: number;
  modelId: string;
  prompt: string;
  system: string;
  temperature?: number;
};

export type TextGenerationResult = {
  content: string;
  finishReason: string;
  latencyMs: number;
  modelId: string;
  providerId: ProviderId;
  usage: NormalizedUsage;
};

export type ProviderPolicy = {
  freeOnly: boolean;
};

export interface ModelProvider {
  readonly id: ProviderId;
  captureSnapshot(modelId: string): Promise<ProviderSnapshot>;
  generateDecision(request: DecisionRequest): Promise<DecisionResult>;
  generateText?(request: TextGenerationRequest): Promise<TextGenerationResult>;
  health(): Promise<ProviderHealth>;
  listModels(): Promise<readonly ModelDescriptor[]>;
}
