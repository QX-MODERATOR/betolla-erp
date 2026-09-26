// HMAC verification for server-to-server webhooks (currently: the landing page's order sync).
// Scheme: header "t=<unix-ms>,v1=<hex hmac-sha256(secret, "<t>.<rawBody>")>" — the same shape
// Stripe/GitHub use, so `t` binds the signature to a moment and the raw (unparsed) body to its
// exact bytes. A request outside the tolerance window is rejected as expired; a request replayed
// inside the window does not create a duplicate order because business_create_order's own
// Idempotency-Key check (the same key the landing page already generated) already de-duplicates
// it — that existing mechanism is what this repo already relies on for every other write path, so
// no separate nonce store was added for this one caller.
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;
const HEADER_PATTERN = /^t=(\d+),v1=([0-9a-f]+)$/i;

export function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyHmacSignature(
  header: string | null | undefined,
  rawBody: string,
  secret: string,
  now: number = Date.now(),
  toleranceMs: number = DEFAULT_TOLERANCE_MS
): boolean {
  if (!header || !secret) return false;
  const match = HEADER_PATTERN.exec(header.trim());
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > toleranceMs) return false;

  const expected = computeSignature(secret, timestamp, rawBody);
  const expectedBuf = Buffer.from(expected, "utf8");
  const givenBuf = Buffer.from(match[2], "utf8");
  return expectedBuf.length === givenBuf.length && timingSafeEqual(expectedBuf, givenBuf);
}
