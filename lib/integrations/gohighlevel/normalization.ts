import { createHash } from "node:crypto";
import type { GhlAppointment, GhlContact, GhlMessage } from "./types.ts";

export type NormalizedContact = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  lead_source: string | null;
  status: string;
  external_updated_at: string | null;
  checksum: string;
};

export type MappedAppointmentStatus = {
  status: string;
  needsReview: boolean;
  raw: string | null;
  rawField: "appointmentStatus" | "status" | null;
};

function scalarText(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

function normalizedTimestamp(value: unknown) {
  const text = scalarText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeEmail(email: unknown) {
  const normalized = scalarText(email).toLowerCase();
  return normalized.includes("@") ? normalized : null;
}

export function normalizePhone(phone: unknown) {
  const digits = scalarText(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 7 ? `+${digits}` : null;
}

export function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function rawAppointmentStatus(appointment: GhlAppointment) {
  const appointmentStatus = scalarText(appointment.appointmentStatus);
  if (appointmentStatus) return { value: appointmentStatus, field: "appointmentStatus" as const };
  const status = scalarText(appointment.status);
  if (status) return { value: status, field: "status" as const };
  return { value: null, field: null };
}

export function normalizeContact(contact: GhlContact): NormalizedContact {
  const firstName = scalarText(contact.firstName) || "Unknown";
  const lastName = scalarText(contact.lastName) || "Contact";
  const normalized = {
    first_name: firstName,
    last_name: lastName,
    email: normalizeEmail(contact.email),
    phone: normalizePhone(contact.phone),
    lead_source: scalarText(contact.source) || "GoHighLevel",
    status: contact.dnd ? "do_not_contact" : "new_lead",
    external_updated_at: normalizedTimestamp(contact.updatedAt) ?? normalizedTimestamp(contact.dateAdded)
  };
  return { ...normalized, checksum: checksum(normalized) };
}

export function mapAppointmentStatus(status: string | null | undefined): MappedAppointmentStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (["booked", "confirmed", "scheduled", "new", "active"].includes(value)) return { status: "scheduled", needsReview: false, raw: value, rawField: null };
  if (["showed", "completed", "complete"].includes(value)) return { status: "completed", needsReview: false, raw: value, rawField: null };
  if (["cancelled", "canceled", "invalid"].includes(value)) return { status: "cancelled", needsReview: false, raw: value, rawField: null };
  if (["no-show", "noshow", "no_show"].includes(value)) return { status: "no_show", needsReview: false, raw: value, rawField: null };
  return { status: "review_required", needsReview: true, raw: value || null, rawField: null };
}

export function normalizeAppointment(appointment: GhlAppointment) {
  const rawStatus = rawAppointmentStatus(appointment);
  const mapped = mapAppointmentStatus(rawStatus.value);
  return {
    start_at: new Date(appointment.startTime).toISOString(),
    end_at: new Date(appointment.endTime).toISOString(),
    status: mapped.status,
    notes: appointment.notes ?? null,
    timezone: appointment.timezone ?? null,
    external_updated_at: appointment.updatedAt ?? null,
    raw_status: mapped.raw,
    raw_status_field: rawStatus.field,
    needs_review: mapped.needsReview,
    checksum: checksum(appointment)
  };
}

export function normalizeMessage(message: GhlMessage) {
  const channel = String(message.channel ?? "sms").toLowerCase();
  const messageTimestamp = message.timestamp ?? message.dateAdded ?? message.createdAt;
  return {
    direction: message.direction === "inbound" ? "inbound" : "outbound",
    channel: ["sms", "email", "whatsapp", "call"].includes(channel) ? channel : "external",
    body: message.body ?? "",
    status: message.status ?? "imported",
    provider_message_id: message.id,
    created_at: messageTimestamp ? new Date(messageTimestamp).toISOString() : new Date().toISOString(),
    checksum: checksum(message)
  };
}
