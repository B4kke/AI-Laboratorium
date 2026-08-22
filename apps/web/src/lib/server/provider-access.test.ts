import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiUnauthorizedError, ApiUnavailableError } from "./http";
import {
  assertLaboratoryAccess,
  assertRemoteProviderAccess,
  hasRemoteProviderAccess,
} from "./provider-access";

afterEach(() => vi.unstubAllEnvs());

function request(token?: string) {
  return new Request("http://localhost/api/duels", {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
}

describe("provider-tilgang", () => {
  it("holder en ukonfigurert provider lukket", () => {
    vi.stubEnv("NVIDIA_API_KEY", "");
    expect(() => assertRemoteProviderAccess(request(), "nvidia-nim")).toThrow(
      ApiUnavailableError,
    );
  });

  it("avviser manglende eller feil bearer-token", () => {
    vi.stubEnv("OPENCODE_ZEN_API_KEY", "provider-hemmelighet");
    vi.stubEnv("AI_LAB_ACCESS_TOKEN", "riktig-tilgangsnøkkel-med-minst-32-tegn");
    expect(() => assertRemoteProviderAccess(request(), "opencode-zen")).toThrow(
      ApiUnauthorizedError,
    );
    expect(() => assertRemoteProviderAccess(request("feil"), "opencode-zen")).toThrow(
      ApiUnauthorizedError,
    );
  });

  it("godtar korrekt token uten å eksponere provider-nøkkelen", () => {
    const token = "riktig-tilgangsnøkkel-med-minst-32-tegn";
    vi.stubEnv("NVIDIA_API_KEY", "provider-hemmelighet");
    vi.stubEnv("AI_LAB_ACCESS_TOKEN", token);
    expect(hasRemoteProviderAccess(request(token))).toBe(true);
    expect(() => assertRemoteProviderAccess(request(token), "nvidia-nim")).not.toThrow();
  });

  it("krever et separat laboratorietoken i produksjon", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_LAB_ACCESS_TOKEN", "");
    expect(() => assertLaboratoryAccess(request())).toThrow(ApiUnavailableError);

    const token = "riktig-tilgangsnøkkel-med-minst-32-tegn";
    vi.stubEnv("AI_LAB_ACCESS_TOKEN", token);
    expect(() => assertLaboratoryAccess(request(token))).not.toThrow();
  });
});
