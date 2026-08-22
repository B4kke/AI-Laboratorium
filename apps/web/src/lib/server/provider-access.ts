import { createHash, timingSafeEqual } from "node:crypto";

import type { ProviderId } from "@ai-lab/providers";

import { ApiUnauthorizedError, ApiUnavailableError } from "./http";

type RemoteProviderId = Exclude<ProviderId, "mock">;

function configuredProviderKey(providerId: RemoteProviderId): string | undefined {
  const value =
    providerId === "nvidia-nim" ? process.env.NVIDIA_API_KEY : process.env.OPENCODE_ZEN_API_KEY;
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function expectedAccessToken(): string | undefined {
  const trimmed = process.env.AI_LAB_ACCESS_TOKEN?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function suppliedAccessToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization === null || !authorization.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length === 0 ? undefined : token;
}

function matchesToken(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function providerRequiresAccess(providerId: ProviderId): boolean {
  return providerId !== "mock" && configuredProviderKey(providerId) !== undefined;
}

export function isRemoteProviderAccessConfigured(): boolean {
  const hasRemoteKey =
    configuredProviderKey("nvidia-nim") !== undefined ||
    configuredProviderKey("opencode-zen") !== undefined;
  if (!hasRemoteKey) return true;
  const token = expectedAccessToken();
  return token !== undefined && (process.env.NODE_ENV !== "production" || token.length >= 32);
}

export function isLaboratoryAccessConfigured(): boolean {
  const token = expectedAccessToken();
  return process.env.NODE_ENV !== "production" || (token !== undefined && token.length >= 32);
}

export function hasRemoteProviderAccess(request: Request): boolean {
  const expected = expectedAccessToken();
  const actual = suppliedAccessToken(request);
  return (
    expected !== undefined &&
    (process.env.NODE_ENV !== "production" || expected.length >= 32) &&
    actual !== undefined &&
    matchesToken(actual, expected)
  );
}

export function assertRemoteProviderAccess(request: Request, providerId: RemoteProviderId) {
  if (configuredProviderKey(providerId) === undefined) {
    throw new ApiUnavailableError(`Modellkilden ${providerId} er ikke konfigurert på serveren`);
  }
  const expected = expectedAccessToken();
  if (expected === undefined || (process.env.NODE_ENV === "production" && expected.length < 32)) {
    throw new ApiUnavailableError(
      "Eksterne modellkilder er låst til AI_LAB_ACCESS_TOKEN er konfigurert sikkert",
    );
  }
  const actual = suppliedAccessToken(request);
  if (actual === undefined || !matchesToken(actual, expected)) throw new ApiUnauthorizedError();
}

export function assertLaboratoryAccess(request: Request): void {
  const expected = expectedAccessToken();
  if (expected === undefined) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiUnavailableError("AI_LAB_ACCESS_TOKEN må konfigureres i produksjon");
    }
    return;
  }
  if (process.env.NODE_ENV === "production" && expected.length < 32) {
    throw new ApiUnavailableError("AI_LAB_ACCESS_TOKEN må ha minst 32 tegn i produksjon");
  }
  const actual = suppliedAccessToken(request);
  if (actual === undefined || !matchesToken(actual, expected)) throw new ApiUnauthorizedError();
}
