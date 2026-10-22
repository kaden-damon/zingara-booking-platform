import { createHash, randomBytes } from "node:crypto";

export function createQuoteAcceptanceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashQuoteAcceptanceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function quoteAcceptanceExpiry(validUntil?: string | null) {
  const fallback = Date.now() + 30 * 24 * 60 * 60 * 1000;
  if (!validUntil) return new Date(fallback).toISOString();
  const endOfDay = Date.parse(`${validUntil}T23:59:59.999+02:00`);
  return new Date(Number.isFinite(endOfDay) ? endOfDay : fallback).toISOString();
}

export function formatZar(cents: number) {
  return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(cents / 100);
}
