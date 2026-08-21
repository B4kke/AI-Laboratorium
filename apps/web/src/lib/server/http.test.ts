import { afterEach, describe, expect, it } from "vitest";

import {
  ApiPayloadTooLargeError,
  ApiRateLimitError,
  ApiUnavailableError,
  assertRateLimit,
  errorResponse,
  readJsonBody,
  resetHttpGuardsForTests,
  withConcurrencyLimit,
} from "./http";

afterEach(() => resetHttpGuardsForTests());

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    body,
    headers: { "Content-Type": "application/json", ...headers },
    method: "POST",
  });
}

describe("HTTP-grenser", () => {
  it("avbryter en faktisk kropp som er større enn grensen", async () => {
    await expect(readJsonBody(jsonRequest(JSON.stringify({ value: "abcdef" })), 8)).rejects.toBeInstanceOf(
      ApiPayloadTooLargeError,
    );
  });

  it("måler UTF-8-bytes og ikke bare tegn", async () => {
    const request = jsonRequest(JSON.stringify({ value: "å" }));
    await expect(readJsonBody(request, 12)).rejects.toBeInstanceOf(ApiPayloadTooLargeError);
  });

  it("returnerer 413 og skjuler uventede interne feil", async () => {
    expect(errorResponse(new ApiPayloadTooLargeError()).status).toBe(413);
    const response = errorResponse(new Error("hemmelig intern detalj"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "En uventet serverfeil oppstod" });
  });

  it("håndhever både kostnad og Retry-After", () => {
    const request = jsonRequest("{}", { "x-real-ip": "203.0.113.10" });
    assertRateLimit(request, "test", { cost: 2, globalLimit: 20, limit: 3, windowMs: 60_000 });
    expect(() =>
      assertRateLimit(request, "test", { cost: 2, globalLimit: 20, limit: 3, windowMs: 60_000 }),
    ).toThrow(ApiRateLimitError);
    const response = errorResponse(new ApiRateLimitError(12));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
  });

  it("avviser arbeid før en full samtidighetsport", async () => {
    let release: (() => void) | undefined;
    const pending = withConcurrencyLimit(
      "test-port",
      1,
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await expect(
      withConcurrencyLimit("test-port", 1, async () => "skal-ikke-kjøre"),
    ).rejects.toBeInstanceOf(ApiUnavailableError);
    release?.();
    await pending;
  });
});
