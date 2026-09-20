import { createHmac, timingSafeEqual } from "node:crypto";

import { stableStringify } from "@ai-lab/arena";
import { DuelResultSchema, type DuelResult } from "@ai-lab/domain";

import { ApiUnauthorizedError, ApiUnavailableError } from "./http";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_SECONDS = 15 * 60;
const developmentSecret = "ai-laboratorium-kun-for-lokal-utvikling-2026";

type TokenOptions = { nowMs?: number; secret?: string };

function signingSecret(explicit: string | undefined): string {
  const secret = explicit ?? process.env.REPORT_SIGNING_SECRET?.trim();
  if (secret !== undefined && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return developmentSecret;
  throw new ApiUnavailableError(
    "Rapporteksport krever REPORT_SIGNING_SECRET med minst 32 tegn",
  );
}

export function isReportSigningConfigured(): boolean {
  const secret = process.env.REPORT_SIGNING_SECRET?.trim();
  return process.env.NODE_ENV !== "production" || (secret !== undefined && secret.length >= 32);
}

function payload(result: DuelResult, expiresAt: number): string {
  return `${TOKEN_VERSION}.${expiresAt}.${stableStringify(result)}`;
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createReportToken(resultInput: DuelResult, options: TokenOptions = {}): string {
  const result = DuelResultSchema.parse(resultInput);
  const expiresAt = Math.floor((options.nowMs ?? Date.now()) / 1_000) + TOKEN_TTL_SECONDS;
  const prefix = `${TOKEN_VERSION}.${expiresAt}`;
  return `${prefix}.${signature(payload(result, expiresAt), signingSecret(options.secret))}`;
}

export function verifyReportToken(
  resultInput: DuelResult,
  token: string,
  options: TokenOptions = {},
): void {
  const result = DuelResultSchema.parse(resultInput);
  const match = /^(v1)\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (match === null) throw new ApiUnauthorizedError("Rapportbeviset er ugyldig");

  const expiresAt = Number(match[2]);
  const now = Math.floor((options.nowMs ?? Date.now()) / 1_000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) {
    throw new ApiUnauthorizedError("Rapportbeviset har utløpt");
  }

  const expected = signature(payload(result, expiresAt), signingSecret(options.secret));
  const supplied = match[3] ?? "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.byteLength !== expectedBuffer.byteLength ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    throw new ApiUnauthorizedError("Rapportbeviset samsvarer ikke med duellresultatet");
  }
}
