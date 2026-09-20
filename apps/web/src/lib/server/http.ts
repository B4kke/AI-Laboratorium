import { createHash } from "node:crypto";

import { ProviderError } from "@ai-lab/providers";
import { ZodError } from "zod";

export class ApiHttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, status: number, options: ErrorOptions & { retryAfterSeconds?: number } = {}) {
    super(message, options);
    this.name = "ApiHttpError";
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class ApiInputError extends ApiHttpError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, 400, options);
    this.name = "ApiInputError";
  }
}

export class ApiNotFoundError extends ApiHttpError {
  constructor(message = "Ressursen finnes ikke") {
    super(message, 404);
    this.name = "ApiNotFoundError";
  }
}

export class ApiPayloadTooLargeError extends ApiHttpError {
  constructor(message = "Forespørselen er for stor") {
    super(message, 413);
    this.name = "ApiPayloadTooLargeError";
  }
}

export class ApiUnauthorizedError extends ApiHttpError {
  constructor(message = "Gyldig tilgangsnøkkel kreves") {
    super(message, 401);
    this.name = "ApiUnauthorizedError";
  }
}

export class ApiRateLimitError extends ApiHttpError {
  constructor(retryAfterSeconds: number) {
    super("For mange forespørsler. Prøv igjen senere.", 429, { retryAfterSeconds });
    this.name = "ApiRateLimitError";
  }
}

export class ApiUnavailableError extends ApiHttpError {
  constructor(message = "Tjenesten er midlertidig opptatt", retryAfterSeconds = 1) {
    super(message, 503, { retryAfterSeconds });
    this.name = "ApiUnavailableError";
  }
}

type RateLimitOptions = {
  cost?: number;
  globalLimit?: number;
  limit: number;
  windowMs: number;
};

type RateBucket = { remaining: number; resetAt: number };

const rateBuckets = new Map<string, RateBucket>();
const inFlight = new Map<string, number>();
let lastRateLimitCleanup = 0;

function digestIdentity(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function requestIdentity(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) return `auth:${digestIdentity(authorization)}`;

  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "ukjent-klient";
  return `nett:${digestIdentity(forwarded)}`;
}

function consumeRateBucket(key: string, limit: number, cost: number, windowMs: number, now: number) {
  const current = rateBuckets.get(key);
  const bucket =
    current === undefined || current.resetAt <= now
      ? { remaining: limit, resetAt: now + windowMs }
      : current;

  if (cost > bucket.remaining) {
    throw new ApiRateLimitError(Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)));
  }
  bucket.remaining -= cost;
  rateBuckets.set(key, bucket);
}

function cleanupRateBuckets(now: number) {
  if (now - lastRateLimitCleanup < 60_000 && rateBuckets.size < 5_000) return;
  lastRateLimitCleanup = now;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
  while (rateBuckets.size > 5_000) {
    const oldest = rateBuckets.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    rateBuckets.delete(oldest);
  }
}

export function assertRateLimit(request: Request, namespace: string, options: RateLimitOptions) {
  const now = Date.now();
  const cost = options.cost ?? 1;
  if (!Number.isSafeInteger(cost) || cost < 1) {
    throw new Error("Rate-limit-kostnad må være et positivt heltall");
  }
  cleanupRateBuckets(now);
  consumeRateBucket(
    `${namespace}:klient:${requestIdentity(request)}`,
    options.limit,
    cost,
    options.windowMs,
    now,
  );
  consumeRateBucket(
    `${namespace}:global`,
    options.globalLimit ?? options.limit * 4,
    cost,
    options.windowMs,
    now,
  );
}

export async function withConcurrencyLimit<T>(
  namespace: string,
  limit: number,
  operation: () => Promise<T>,
): Promise<T> {
  const current = inFlight.get(namespace) ?? 0;
  if (current >= limit) throw new ApiUnavailableError();
  inFlight.set(namespace, current + 1);
  try {
    return await operation();
  } finally {
    const next = (inFlight.get(namespace) ?? 1) - 1;
    if (next <= 0) inFlight.delete(namespace);
    else inFlight.set(namespace, next);
  }
}

export async function handleApiRequest(
  request: Request,
  route: string,
  handler: () => Promise<Response> | Response,
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = (request.headers.get("x-vercel-id") ?? crypto.randomUUID()).slice(0, 128);
  console.log(JSON.stringify({ level: "info", message: "start", requestId, route }));
  try {
    const response = await handler();
    const log = response.status >= 500 ? console.error : console.log;
    log(
      JSON.stringify({
        durationMs: Date.now() - startedAt,
        level: response.status >= 500 ? "error" : "info",
        message: response.status >= 500 ? "failed" : "done",
        requestId,
        route,
        status: response.status,
      }),
    );
    return response;
  } catch (error) {
    const response = errorResponse(error);
    console.error(
      JSON.stringify({
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        level: "error",
        message: "failed",
        requestId,
        route,
        status: response.status,
      }),
    );
    return response;
  }
}

export async function readJsonBody(request: Request, maxBytes = 128_000): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiInputError("Forespørselen må bruke Content-Type application/json");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new ApiPayloadTooLargeError();
    }
  }

  const reader = request.body?.getReader();
  if (reader === undefined) throw new ApiInputError("Forespørselen mangler JSON-data");
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel("Maksimal kroppsstørrelse er overskredet");
        throw new ApiPayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ApiInputError("Forespørselen inneholder ugyldig UTF-8", { cause: error });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ApiInputError("Forespørselen inneholder ugyldig JSON", { cause: error });
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ProviderError) {
    // Providerfeil har allerede trygge, norske meldinger uten hemmeligheter.
    // Vis dem videre med riktig status i stedet for generisk 500.
    const status =
      error.code === "rate-limited"
        ? 429
        : error.code === "timeout" || error.code === "circuit-open"
          ? 503
          : error.code === "not-configured"
            ? 503
            : 502;
    return Response.json(
      { error: error.message },
      { headers: { "Cache-Control": "no-store" }, status },
    );
  }
  const status =
    error instanceof ApiHttpError ? error.status : error instanceof ZodError ? 400 : 500;
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message ?? "Ugyldige data"
      : error instanceof ApiHttpError
        ? error.message
        : "En uventet serverfeil oppstod";
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (error instanceof ApiHttpError && error.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(error.retryAfterSeconds);
  }
  return Response.json({ error: message }, { headers, status });
}

export function resetHttpGuardsForTests() {
  rateBuckets.clear();
  inFlight.clear();
  lastRateLimitCleanup = 0;
}
