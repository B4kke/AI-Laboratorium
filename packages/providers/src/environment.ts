import { MockProvider } from "./mock";
import { createNvidiaNimProvider } from "./nvidia";
import { ProviderRegistry } from "./registry";
import type { ModelProvider } from "./types";
import { createOpenCodeZenProvider } from "./zen";

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

export function createEnvironmentProviders(
  environment: Readonly<Record<string, string | undefined>>,
  options: { includeMock?: boolean } = {},
): readonly ModelProvider[] {
  const confirmedNvidiaModels = new Set(
    (environment.NVIDIA_CONFIRMED_FREE_MODELS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const nvidiaApiKey = optional(environment.NVIDIA_API_KEY);
  const zenApiKey = optional(environment.OPENCODE_ZEN_API_KEY);
  const configuredTimeout = Number(environment.PROVIDER_REQUEST_TIMEOUT_MS ?? 45_000);
  const requestTimeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(1_000, Math.min(300_000, configuredTimeout))
    : 45_000;
  const freeOnly = environment.PROVIDER_FREE_ONLY !== "false";
  return [
    ...(options.includeMock === false ? [] : [new MockProvider()]),
    createNvidiaNimProvider({
      confirmedFreeModelIds: confirmedNvidiaModels,
      freeOnly,
      requestTimeoutMs,
      ...(nvidiaApiKey === undefined ? {} : { apiKey: nvidiaApiKey }),
    }),
    createOpenCodeZenProvider({
      freeOnly,
      requestTimeoutMs,
      ...(zenApiKey === undefined ? {} : { apiKey: zenApiKey }),
    }),
  ];
}

export function createEnvironmentProviderRegistry(
  environment: Readonly<Record<string, string | undefined>>,
  options: { includeMock?: boolean } = {},
): ProviderRegistry {
  return new ProviderRegistry(createEnvironmentProviders(environment, options));
}
