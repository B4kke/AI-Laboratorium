import {
  DecisionTraceSchema,
  ProviderSnapshotSchema,
  type ProviderSnapshot,
} from "@ai-lab/domain";

import { ProviderError } from "./errors";
import type {
  DecisionRequest,
  DecisionResult,
  ModelDescriptor,
  ModelProvider,
  ProviderHealth,
} from "./types";
import { hashToUnitInterval, providerSnapshotId } from "./utils";

const mockModels = [
  { id: "scripted-adaptive", name: "Adaptiv baseline" },
  { id: "scripted-cooperative", name: "Samarbeidende baseline" },
  { id: "scripted-opportunist", name: "Opportunistisk baseline" },
  { id: "scripted-risk-averse", name: "Forsiktig baseline" },
  { id: "scripted-unpredictable", name: "Uforutsigbar baseline" },
] as const;

export class MockProvider implements ModelProvider {
  readonly id = "mock" as const;

  async listModels(): Promise<readonly ModelDescriptor[]> {
    return mockModels.map((model) => ({
      displayName: model.name,
      endpointFamily: "local-scripted" as const,
      freeClassification: "confirmed-free" as const,
      id: model.id,
      providerId: this.id,
      supportsStructuredOutput: true,
      supportsTools: false,
    }));
  }

  async captureSnapshot(modelId: string): Promise<ProviderSnapshot> {
    const model = (await this.listModels()).find(({ id }) => id === modelId);
    if (model === undefined) {
      throw new ProviderError("request-failed", `Ukjent mock-modell: ${modelId}`);
    }
    return ProviderSnapshotSchema.parse({
      capturedAt: new Date().toISOString(),
      endpointFamily: model.endpointFamily,
      freeClassification: model.freeClassification,
      id: providerSnapshotId(this.id, modelId),
      modelId,
      providerId: this.id,
      supportsStructuredOutput: true,
      supportsTools: false,
    });
  }

  async generateDecision(request: DecisionRequest): Promise<DecisionResult> {
    const startedAt = performance.now();
    const first = request.allowedActions[0];
    const second = request.allowedActions[1] ?? first;
    if (first === undefined || second === undefined) {
      throw new ProviderError("invalid-response", "Arenaen mangler lovlige handlinger");
    }

    const randomIndex = Math.floor(
      hashToUnitInterval(`${request.seed}:${request.actorName}:${request.round}`) *
        request.allowedActions.length,
    );
    const randomAction = request.allowedActions[randomIndex] ?? first;
    const action = (() => {
      switch (request.strategy) {
        case "cooperative":
          return first;
        case "opportunist":
          return second;
        case "risk_averse":
          return request.round % 3 === 0 ? second : first;
        case "unpredictable":
          return randomAction;
        case "adaptive":
          return request.opponentLastAction === second.id ? second : first;
      }
    })();

    const trace = DecisionTraceSchema.parse({
      actionId: action.id,
      confidence: Number((0.58 + hashToUnitInterval(`${request.seed}:confidence`) * 0.34).toFixed(2)),
      goal:
        request.strategy === "opportunist"
          ? "Maksimer egen gevinst i denne runden."
          : "Bygg en robust strategi over flere runder.",
      message:
        action.id === first.id
          ? `[Scripted kontroll] ${request.actorName} valgte den første policyhandlingen «${action.label}».`
          : `[Scripted kontroll] ${request.actorName} valgte policyhandlingen «${action.label}».`,
      observation: request.observation,
      rationale:
        request.strategy === "unpredictable"
          ? "Handlingen følger en seedet, uforutsigbar baseline som kan reproduseres."
          : `Valget følger den eksplisitte strategiprofilen «${request.strategy}».`,
    });

    return {
      finishReason: "stop",
      latencyMs: performance.now() - startedAt,
      modelId: request.modelId,
      providerId: this.id,
      trace,
      usage: {},
    };
  }

  async health(): Promise<ProviderHealth> {
    return { message: "Deterministisk lokal provider er klar", status: "available" };
  }
}
