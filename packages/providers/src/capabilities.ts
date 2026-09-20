import type { ProviderSnapshot } from "@ai-lab/domain";

export type InferredCapabilities = {
  endpointFamily: ProviderSnapshot["endpointFamily"];
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
};

/** Fjern `opencode/`-prefiks for direkte Zen-kall. Zen forventer bar ID. */
export function stripProviderPrefix(modelId: string): string {
  const trimmed = modelId.trim();
  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    const prefix = trimmed.slice(0, slash).toLowerCase();
    if (prefix === "opencode") return trimmed.slice(slash + 1);
  }
  return trimmed;
}

export function normalizeModelIdForComparison(modelId: string): string {
  return stripProviderPrefix(modelId).toLowerCase();
}

/**
 * Muse Spark Contributor Free (og annen Muse) på Zen er Responses-only.
 * Chat-completions mot disse gir HTTP 500 og må routes til /responses.
 */
export function isResponsesOnlyModel(modelId: string): boolean {
  const bare = stripProviderPrefix(modelId).toLowerCase();
  return bare.startsWith("muse-spark");
}

function isSafetyEmbedOrParse(bare: string): boolean {
  return (
    bare.includes("safety-guard") ||
    bare.includes("content-safety") ||
    bare.includes("embed") ||
    bare.includes("nemotron-parse") ||
    bare.includes("reward")
  );
}

function isCapableChatModel(bare: string): boolean {
  return (
    bare.includes("nemotron") ||
    bare.includes("llama-") ||
    bare.includes("mimo") ||
    bare.includes("ling-") ||
    bare.includes("big-pickle") ||
    bare.includes("deepseek") ||
    bare.includes("qwen")
  );
}

export function inferModelCapabilities(modelId: string): InferredCapabilities {
  const bare = stripProviderPrefix(modelId).toLowerCase();
  if (isResponsesOnlyModel(modelId)) {
    return {
      endpointFamily: "responses",
      supportsStructuredOutput: true,
      supportsTools: true,
    };
  }
  if (isSafetyEmbedOrParse(bare)) {
    return {
      endpointFamily: "chat-completions",
      supportsStructuredOutput: false,
      supportsTools: false,
    };
  }
  if (isCapableChatModel(bare)) {
    return {
      endpointFamily: "chat-completions",
      supportsStructuredOutput: true,
      supportsTools: true,
    };
  }
  return {
    endpointFamily: "chat-completions",
    supportsStructuredOutput: false,
    supportsTools: false,
  };
}
