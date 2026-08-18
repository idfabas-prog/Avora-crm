import crypto from "node:crypto";

export function timingSafeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hmacSha256(secret: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyHmacSignature({
  secret,
  payload,
  signature
}: {
  secret: string | undefined;
  payload: string;
  signature: string | null;
}) {
  if (!secret || !signature) return false;
  return timingSafeEqualText(hmacSha256(secret, payload), signature.replace(/^sha256=/, ""));
}

export function webhookIdempotencyKey(provider: string, providerEventId: string) {
  return `${provider}:${providerEventId}`.toLowerCase();
}

