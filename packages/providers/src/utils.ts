import { DecisionTraceSchema, createDeterministicId } from "@ai-lab/domain";

import { ProviderError } from "./errors";
import type { DecisionRequest, ModelDescriptor, ProviderId } from "./types";

export function parseDecisionTrace(content: string, request: DecisionRequest) {
  const trimmed = content
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new ProviderError("invalid-response", "Modellen returnerte ikke gyldig JSON", {
      cause: error,
    });
  }

  const trace = DecisionTraceSchema.parse(parsed);
  if (!request.allowedActions.some((action) => action.id === trace.actionId)) {
    throw new ProviderError(
      "invalid-response",
      `Modellen valgte en ulovlig handling: ${trace.actionId}`,
    );
  }
  return DecisionTraceSchema.parse({
    ...trace,
    // Observasjonen er et motor-eid faktum. Modellen får uttrykke handling og
    // begrunnelse, men kan ikke omskrive hva den faktisk fikk se.
    observation: request.observation,
  });
}

export function providerSnapshotId(providerId: ProviderId, modelId: string) {
  return createDeterministicId("provider", `${providerId}-${modelId.replaceAll("/", "-")}`);
}

export function assertFreePolicy(model: ModelDescriptor, freeOnly: boolean) {
  if (freeOnly && model.freeClassification !== "confirmed-free") {
    throw new ProviderError(
      "model-not-free",
      `Modellen ${model.id} er ikke eksplisitt bekreftet gratis ved denne kjøringen`,
    );
  }
}

export function hashToUnitInterval(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}
