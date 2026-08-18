import { createHash, createVerify, timingSafeEqual, verify as verifySignature } from "node:crypto";
import type { GhlImportObjectType } from "./importer.ts";

export function hashWebhookPayload(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function signatureBuffer(signature: string) {
  const trimmed = signature.trim();
  if (/^[a-f0-9]+$/i.test(trimmed) && trimmed.length % 2 === 0) return Buffer.from(trimmed, "hex");
  return Buffer.from(trimmed, "base64");
}

function normalizePem(value: string) {
  return value.includes("BEGIN PUBLIC KEY")
    ? value.replace(/\\n/g, "\n")
    : `-----BEGIN PUBLIC KEY-----\n${value.replace(/\s+/g, "")}\n-----END PUBLIC KEY-----`;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
  options: { ghlSignature?: string | null; ghlPublicKey?: string | null; legacySignature?: string | null; legacyPublicKey?: string | null } = {}
) {
  if (options.ghlSignature && options.ghlPublicKey) {
    try {
      const verified = verifySignature(null, Buffer.from(rawBody), normalizePem(options.ghlPublicKey), signatureBuffer(options.ghlSignature));
      return verified ? { verified: true, reason: "x_ghl_signature_verified" } : { verified: false, reason: "x_ghl_signature_mismatch" };
    } catch {
      return { verified: false, reason: "x_ghl_signature_invalid" };
    }
  }
  if (options.legacySignature && options.legacyPublicKey) {
    try {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(rawBody);
      verifier.end();
      const verified = verifier.verify(normalizePem(options.legacyPublicKey), signatureBuffer(options.legacySignature));
      return verified ? { verified: true, reason: "x_wh_signature_verified" } : { verified: false, reason: "x_wh_signature_mismatch" };
    } catch {
      return { verified: false, reason: "x_wh_signature_invalid" };
    }
  }
  if (!secret) return { verified: false, reason: "no_webhook_signature_configured" };
  if (!signature) return { verified: false, reason: "missing_signature" };
  const expected = createHash("sha256").update(`${rawBody}.${secret}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length) return { verified: false, reason: "signature_length_mismatch" };
  return timingSafeEqual(expectedBuffer, providedBuffer)
    ? { verified: true, reason: "shared_secret_verified" }
    : { verified: false, reason: "signature_mismatch" };
}

export const GHL_SUPPORTED_WEBHOOK_EVENTS = [
  "ContactCreate",
  "ContactUpdate",
  "AppointmentCreate",
  "AppointmentUpdate",
  "AppointmentDelete",
  "OpportunityCreate",
  "OpportunityUpdate",
  "ConversationProviderMessage",
  "InboundMessage",
  "OutboundMessage",
  "InvoicePaid",
  "PaymentReceived",
  "OrderCreated",
  "OrderUpdated",
  "INSTALL",
  "UNINSTALL"
] as const;

const eventObjectMap: Array<{ patterns: string[]; objectType: GhlImportObjectType }> = [
  { patterns: ["contact"], objectType: "contact" },
  { patterns: ["appointment", "calendar.event"], objectType: "appointment" },
  { patterns: ["opportunity"], objectType: "opportunity" },
  { patterns: ["conversation"], objectType: "conversation" },
  { patterns: ["message"], objectType: "message" },
  { patterns: ["payment", "transaction", "invoice"], objectType: "transaction" },
  { patterns: ["order"], objectType: "order" }
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nestedRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstText(...values: unknown[]) {
  return values.map(text).find(Boolean) ?? null;
}

function objectTypeForEvent(eventType: string): GhlImportObjectType | null {
  const normalized = eventType.toLowerCase();
  return eventObjectMap.find((entry) => entry.patterns.some((pattern) => normalized.includes(pattern)))?.objectType ?? null;
}

export function normalizeWebhookEvent(payload: unknown) {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data = nestedRecord(record.data ?? record.payload ?? record.object);
  const locationId = firstText(record.locationId, record.location_id, data.locationId, data.location_id);
  const eventType = firstText(record.type, record.eventType, record.event_type, record.event, record.eventName) ?? "unknown";
  const providerEventId = firstText(record.id, record.eventId, record.event_id, record.webhookId, record.webhook_id);
  const objectType = objectTypeForEvent(eventType);
  const externalObjectId = firstText(
    record.contactId,
    record.appointmentId,
    record.eventId,
    record.opportunityId,
    record.conversationId,
    record.messageId,
    record.transactionId,
    record.orderId,
    data.contactId,
    data.appointmentId,
    data.eventId,
    data.opportunityId,
    data.conversationId,
    data.messageId,
    data.transactionId,
    data.orderId,
    data.id,
    record.objectId
  );
  const calendarId = firstText(record.calendarId, data.calendarId);
  const conversationId = firstText(record.conversationId, data.conversationId);
  const timestamp = firstText(record.timestamp, record.createdAt, record.updatedAt, data.timestamp, data.createdAt, data.updatedAt);
  return { locationId, eventType, providerEventId, externalObjectId, objectType, calendarId, conversationId, timestamp };
}
