import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { isMockGhlConnection, tokenPresentForConnection } from "./auth.ts";
import { GhlReadOnlyClient } from "./client.ts";
import { GhlIntegrationError } from "./errors.ts";
import { mapAppointmentStatus, normalizeEmail, normalizePhone, rawAppointmentStatus } from "./normalization.ts";
import type { GhlAppointment, GhlCalendar, GhlConnection, GhlContact, GhlConversation, GhlMessage, GhlOpportunity, GhlPage, GhlPayment, GhlSyncCounts } from "./types.ts";

const maxPages = 5;
const pageLimit = 100;
const messageConversationLimit = 10;
const appointmentCalendarLimit = 20;

type ObjectPreview = {
  objectType: string;
  status: "ok" | "empty" | "error" | "permission_error" | "parser_warning" | "not_requested";
  httpStatus: number | null;
  safeErrorMessage: string | null;
  endpoint: string | null;
  queryParameterNames: string[];
  apiVersion: string | null;
  requestMethod: string | null;
  recordsAvailable: number | null;
  recordsFetched: number;
  pagesFetched: number;
  paginationMetadata: string[];
  parserWarnings: string[];
  existingMatches: number;
  wouldCreate: number;
  wouldUpdate: number;
  duplicates: number;
  ambiguousMatches: number;
  missingScopes: string[];
  unsupportedLimitations: string[];
};

export type GhlDryRunPreview = {
  readiness: "NOT_READY_FOR_IMPORT" | "READY_WITH_WARNINGS" | "READY_FOR_CONTROLLED_HISTORICAL_IMPORT";
  generatedAt: string;
  connection: {
    id: string;
    displayName: string;
    ghlLocationId: string;
    tokenPresent: boolean;
  };
  location: {
    name: string | null;
    returnedLocationId: string | null;
    locationIdMatches: boolean;
    metadataReadable: boolean;
    limitation: string | null;
  };
  objects: ObjectPreview[];
  calendars: Array<{
    ghlCalendarId: string;
    calendarName: string;
    timezone: string | null;
    ownerOrTeam: string | null;
    futureAppointmentCount: number;
    proposedMapping: string;
  }>;
  contacts: {
    totalContacts: number;
    matchedByExternalId: number;
    matchedByExactPhone: number;
    matchedByExactEmail: number;
    newContacts: number;
    potentialDuplicatesRequiringReview: number;
  };
  appointments: {
    totalRetrievable: number;
    futureRetrievable: number;
    earliestRetrievableAppointmentDate: string | null;
    latestAppointmentDate: string | null;
    unknownStatuses: string[];
    unmappedCalendars: string[];
    unmappedProviders: string[];
  };
  limitations: string[];
};

type ExternalMappingRow = { external_object_type: string | null; external_id: string | null; checksum?: string | null };
type ContactRow = { id: string; email: string | null; phone: string | null };

function emptyPreview(objectType: string): ObjectPreview {
  return {
    objectType,
    status: "not_requested",
    httpStatus: null,
    safeErrorMessage: null,
    endpoint: null,
    queryParameterNames: [],
    apiVersion: null,
    requestMethod: null,
    recordsAvailable: null,
    recordsFetched: 0,
    pagesFetched: 0,
    paginationMetadata: [],
    parserWarnings: [],
    existingMatches: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
    duplicates: 0,
    ambiguousMatches: 0,
    missingScopes: [],
    unsupportedLimitations: []
  };
}

function locationRecord(payload: unknown) {
  const row = payload && typeof payload === "object" && "location" in payload ? (payload as { location?: unknown }).location : payload;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function externalId(row: unknown) {
  return text(row && typeof row === "object" ? (row as Record<string, unknown>).id ?? (row as Record<string, unknown>)._id : "");
}

function recordDate(row: unknown, keys: string[]) {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const raw = text(record[key]);
    if (raw) return raw;
  }
  return null;
}

function duplicatesFor(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = text(value);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

async function collectPages<T>(objectType: string, fetchPage: (pageToken?: string | null) => Promise<GhlPage<T>>) {
  const rows: T[] = [];
  const preview = emptyPreview(objectType);
  let pageToken: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchPage(pageToken);
    rows.push(...response.data);
    preview.status = response.parserWarnings?.length ? "parser_warning" : response.data.length ? "ok" : "empty";
    preview.httpStatus = response.httpStatus ?? preview.httpStatus;
    preview.endpoint = response.endpoint ?? preview.endpoint;
    preview.queryParameterNames = response.queryParameterNames ?? preview.queryParameterNames;
    preview.apiVersion = response.apiVersion ?? preview.apiVersion;
    preview.requestMethod = response.requestMethod ?? preview.requestMethod;
    preview.recordsAvailable = response.recordsAvailable ?? preview.recordsAvailable;
    preview.parserWarnings.push(...(response.parserWarnings ?? []));
    preview.paginationMetadata.push(
      `page ${page + 1}: status ${response.httpStatus ?? "unknown"}, query params ${response.queryParameterNames?.join(", ") || "none"}, fetched ${response.data.length}, next ${response.nextPageToken ?? response.cursor ?? "none"}`
    );
    preview.pagesFetched += 1;
    preview.recordsFetched += response.data.length;
    pageToken = response.nextPageToken ?? response.cursor ?? null;
    if (!response.hasMore || !pageToken) break;
  }
  preview.recordsAvailable = preview.recordsAvailable ?? preview.recordsFetched;
  if (pageToken) preview.unsupportedLimitations.push(`Preview stopped after ${maxPages} pages; run controlled import for the full history.`);
  return { rows, preview };
}

async function safeCollect<T>(objectType: string, scope: string, fetchPage: (pageToken?: string | null) => Promise<GhlPage<T>>) {
  try {
    return await collectPages(objectType, fetchPage);
  } catch (error) {
    const preview = emptyPreview(objectType);
    if (error instanceof GhlIntegrationError) {
      preview.status = error.code === "authorization_failed" ? "permission_error" : "error";
      preview.httpStatus = error.httpStatus;
      preview.endpoint = error.endpoint;
      preview.safeErrorMessage = error.safeProviderMessage ?? error.message;
      if (error.code === "authorization_failed") preview.missingScopes.push(scope);
      else preview.unsupportedLimitations.push(error.safeProviderMessage ?? error.message);
      preview.paginationMetadata.push(`request failed: status ${error.httpStatus ?? "unknown"}`);
    } else {
      preview.status = "error";
      preview.safeErrorMessage = "Provider endpoint unavailable during preview.";
      preview.unsupportedLimitations.push("Provider endpoint unavailable during preview.");
    }
    return { rows: [] as T[], preview };
  }
}

function appendPreview(target: ObjectPreview, source: ObjectPreview) {
  if (source.status === "ok" || target.status === "ok") target.status = "ok";
  else if (source.status !== "not_requested") target.status = source.status;
  target.httpStatus = source.httpStatus ?? target.httpStatus;
  target.endpoint = source.endpoint ?? target.endpoint;
  target.queryParameterNames = source.queryParameterNames.length ? source.queryParameterNames : target.queryParameterNames;
  target.apiVersion = source.apiVersion ?? target.apiVersion;
  target.requestMethod = source.requestMethod ?? target.requestMethod;
  target.recordsAvailable = (target.recordsAvailable ?? 0) + (source.recordsAvailable ?? source.recordsFetched);
  target.recordsFetched += source.recordsFetched;
  target.pagesFetched += source.pagesFetched;
  target.paginationMetadata.push(...source.paginationMetadata);
  target.parserWarnings.push(...source.parserWarnings);
  target.missingScopes.push(...source.missingScopes);
  target.unsupportedLimitations.push(...source.unsupportedLimitations);
}

function mergeMatchCounts(preview: ObjectPreview, externalIds: string[], mappingRows: ExternalMappingRow[]) {
  const mapped = new Set(
    mappingRows
      .filter((row) => row.external_object_type === preview.objectType)
      .map((row) => text(row.external_id))
      .filter(Boolean)
  );
  preview.existingMatches = externalIds.filter((id) => mapped.has(id)).length;
  preview.wouldUpdate = preview.existingMatches;
  preview.wouldCreate = Math.max(0, preview.recordsFetched - preview.existingMatches);
  preview.duplicates = duplicatesFor(externalIds);
}

function summarizeContactMatches(contacts: GhlContact[], mappings: ExternalMappingRow[], localContacts: ContactRow[]) {
  const mappedIds = new Set(mappings.filter((row) => row.external_object_type === "contact").map((row) => text(row.external_id)).filter(Boolean));
  const localEmails = new Map<string, number>();
  const localPhones = new Map<string, number>();
  for (const contact of localContacts) {
    const email = normalizeEmail(contact.email);
    const phone = normalizePhone(contact.phone);
    if (email) localEmails.set(email, (localEmails.get(email) ?? 0) + 1);
    if (phone) localPhones.set(phone, (localPhones.get(phone) ?? 0) + 1);
  }
  let matchedByExternalId = 0;
  let matchedByExactEmail = 0;
  let matchedByExactPhone = 0;
  let potentialDuplicatesRequiringReview = 0;
  for (const contact of contacts) {
    const id = externalId(contact);
    const emailMatches = localEmails.get(normalizeEmail(contact.email) ?? "") ?? 0;
    const phoneMatches = localPhones.get(normalizePhone(contact.phone) ?? "") ?? 0;
    if (id && mappedIds.has(id)) matchedByExternalId += 1;
    else if (emailMatches === 1) matchedByExactEmail += 1;
    else if (phoneMatches === 1) matchedByExactPhone += 1;
    if (emailMatches > 1 || phoneMatches > 1) potentialDuplicatesRequiringReview += 1;
  }
  return {
    totalContacts: contacts.length,
    matchedByExternalId,
    matchedByExactPhone,
    matchedByExactEmail,
    newContacts: Math.max(0, contacts.length - matchedByExternalId - matchedByExactEmail - matchedByExactPhone),
    potentialDuplicatesRequiringReview
  };
}

function summarizeAppointments(appointments: GhlAppointment[], calendars: GhlCalendar[], userExternalIds: Set<string>) {
  const dates = appointments
    .map((appointment) => recordDate(appointment, ["startTime", "startDate", "start_at"]))
    .filter(Boolean)
    .sort();
  const calendarIds = new Set(calendars.map((calendar) => externalId(calendar)).filter(Boolean));
  const unknownStatuses = new Set<string>();
  const unmappedCalendars = new Set<string>();
  const unmappedProviders = new Set<string>();
  for (const appointment of appointments) {
    const rawStatus = rawAppointmentStatus(appointment);
    const mapped = mapAppointmentStatus(rawStatus.value);
    if (mapped.needsReview) unknownStatuses.add(mapped.raw ?? "null_or_blank");
    const calendarId = text(appointment.calendarId);
    if (calendarId && !calendarIds.has(calendarId)) unmappedCalendars.add(calendarId);
    const providerId = text(appointment.assignedUserId);
    if (providerId && !userExternalIds.has(providerId)) unmappedProviders.add(providerId);
  }
  const now = new Date().toISOString();
  return {
    totalRetrievable: appointments.length,
    futureRetrievable: appointments.filter((appointment) => text(appointment.startTime) >= now).length,
    earliestRetrievableAppointmentDate: dates[0] ?? null,
    latestAppointmentDate: dates.at(-1) ?? null,
    unknownStatuses: Array.from(unknownStatuses),
    unmappedCalendars: Array.from(unmappedCalendars),
    unmappedProviders: Array.from(unmappedProviders)
  };
}

function readinessFor(preview: GhlDryRunPreview) {
  const missingScopes = preview.objects.flatMap((object) => object.missingScopes);
  const criticalObjects = preview.objects.filter((object) => ["contact", "calendar"].includes(object.objectType));
  const primaryObjects = preview.objects.filter((object) => ["user", "custom_field", "tag", "contact", "pipeline", "opportunity", "calendar", "appointment", "conversation"].includes(object.objectType));
  const failedPrimary = primaryObjects.filter((object) => ["error", "permission_error", "parser_warning"].includes(object.status));
  const blockers = !preview.connection.tokenPresent
    || !preview.location.metadataReadable
    || !preview.location.locationIdMatches
    || criticalObjects.some((object) => ["error", "permission_error", "parser_warning"].includes(object.status))
    || (primaryObjects.length > 0 && failedPrimary.length === primaryObjects.length);
  if (blockers) return "NOT_READY_FOR_IMPORT";
  const warnings = missingScopes.length > 0
    || preview.contacts.potentialDuplicatesRequiringReview > 0
    || preview.appointments.unknownStatuses.length > 0
    || preview.appointments.unmappedCalendars.length > 0
    || preview.appointments.unmappedProviders.length > 0
    || preview.objects.some((object) => object.duplicates > 0 || object.ambiguousMatches > 0 || object.unsupportedLimitations.length > 0 || object.parserWarnings.length > 0);
  return warnings ? "READY_WITH_WARNINGS" : "READY_FOR_CONTROLLED_HISTORICAL_IMPORT";
}

function millisDateOffset(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date.getTime();
}

export async function buildGhlDryRunPreview(supabase: SupabaseClient, profile: CurrentProfile, connection: GhlConnection): Promise<GhlDryRunPreview> {
  if (isMockGhlConnection(connection)) throw new Error("Dry Run / Preview Import is only available for real read-only GHL connections.");
  const tokenPresent = tokenPresentForConnection(connection);
  const client = new GhlReadOnlyClient(connection);
  const limitations: string[] = [];

  let locationPayload: unknown = null;
  let locationLimitation: string | null = null;
  try {
    locationPayload = tokenPresent ? await client.getLocationMetadata() : null;
  } catch (error) {
    locationLimitation = error instanceof Error ? error.message : "Location metadata unavailable.";
  }
  const location = locationRecord(locationPayload);
  const returnedLocationId = text(location.id ?? location._id ?? location.locationId) || null;
  const locationName = text(location.name ?? location.businessName ?? location.companyName) || null;

  const [{ data: mappingRows }, { data: localContacts }] = await Promise.all([
    supabase.from("external_record_mappings").select("external_object_type, external_id, checksum").eq("connection_id", connection.id),
    supabase.from("contacts").select("id, email, phone").eq("organization_id", profile.organizationId).eq("location_id", connection.location_id)
  ]);

  const mappings = (mappingRows ?? []) as ExternalMappingRow[];
  const localContactRows = (localContacts ?? []) as ContactRow[];
  const commonQuery = { limit: pageLimit };
  const appointmentWindow = { startTime: millisDateOffset(-5), endTime: millisDateOffset(2) };

  const users = await safeCollect<Record<string, unknown>>("user", "users.readonly", () => client.getUsers());
  const customFields = await safeCollect<Record<string, unknown>>("custom_field", "locations/customFields.readonly", () => client.getCustomFields());
  const tags = await safeCollect<Record<string, unknown>>("tag", "locations/tags.readonly", (pageToken) => client.getTags({ pageToken, query: commonQuery }));
  const contacts = await safeCollect<GhlContact>("contact", "contacts.readonly", (pageToken) => client.getContacts({ pageToken, query: commonQuery }));
  const pipelines = await safeCollect<Record<string, unknown>>("pipeline", "opportunities.readonly", () => client.getPipelines());
  const opportunities = await safeCollect<GhlOpportunity>("opportunity", "opportunities.readonly", (pageToken) => client.getOpportunities({ pageToken, query: commonQuery }));
  const calendars = await safeCollect<GhlCalendar>("calendar", "calendars.readonly", () => client.getCalendars());
  const appointments = { rows: [] as GhlAppointment[], preview: emptyPreview("appointment") };
  for (const calendar of calendars.rows.slice(0, appointmentCalendarLimit)) {
    const calendarId = externalId(calendar);
    if (!calendarId) continue;
    const result = await safeCollect<GhlAppointment>("appointment", "calendars/events.readonly", () => client.getAppointments({ query: { ...appointmentWindow, calendarId } }));
    appointments.rows.push(...result.rows);
    appendPreview(appointments.preview, result.preview);
  }
  if (calendars.rows.length === 0 && calendars.preview.status !== "ok") {
    appointments.preview.status = "not_requested";
    appointments.preview.unsupportedLimitations.push("Appointment preview requires readable calendars before calendar-specific event windows can be requested.");
  }
  if (calendars.rows.length > appointmentCalendarLimit) appointments.preview.unsupportedLimitations.push(`Appointment preview sampled ${appointmentCalendarLimit} calendars; controlled import can window the full calendar set.`);
  const conversations = await safeCollect<GhlConversation>("conversation", "conversations.readonly", (pageToken) => client.getConversations({ pageToken, query: commonQuery }));
  const transactions = await safeCollect<GhlPayment>("transaction", "payments/transactions.readonly", (pageToken) => client.getPayments({ pageToken }));
  const orders = await safeCollect<Record<string, unknown>>("order", "payments/orders.readonly", (pageToken) => client.getOrders({ pageToken }));

  const messages = { rows: [] as GhlMessage[], preview: emptyPreview("message") };
  for (const conversation of conversations.rows.slice(0, messageConversationLimit)) {
    const conversationId = externalId(conversation);
    if (!conversationId) continue;
    const result = await safeCollect<GhlMessage>("message", "conversations/message.readonly", (pageToken) => client.getMessages(conversationId, { pageToken, query: commonQuery }));
    messages.rows.push(...result.rows);
    messages.preview.status = result.preview.status === "ok" || messages.preview.status === "ok" ? "ok" : result.preview.status;
    messages.preview.httpStatus = result.preview.httpStatus ?? messages.preview.httpStatus;
    messages.preview.endpoint = result.preview.endpoint ?? messages.preview.endpoint;
    messages.preview.apiVersion = result.preview.apiVersion ?? messages.preview.apiVersion;
    messages.preview.requestMethod = result.preview.requestMethod ?? messages.preview.requestMethod;
    messages.preview.recordsFetched += result.preview.recordsFetched;
    messages.preview.pagesFetched += result.preview.pagesFetched;
    messages.preview.paginationMetadata.push(...result.preview.paginationMetadata);
    messages.preview.parserWarnings.push(...result.preview.parserWarnings);
    messages.preview.missingScopes.push(...result.preview.missingScopes);
    messages.preview.unsupportedLimitations.push(...result.preview.unsupportedLimitations);
  }
  messages.preview.recordsAvailable = messages.rows.length;
  if (conversations.rows.length > messageConversationLimit) messages.preview.unsupportedLimitations.push(`Message preview sampled ${messageConversationLimit} conversations; controlled import can page the full conversation history.`);

  const previews = [users, customFields, tags, contacts, pipelines, opportunities, calendars, appointments, conversations, messages, transactions, orders];
  for (const item of previews) {
    mergeMatchCounts(item.preview, item.rows.map(externalId).filter(Boolean), mappings);
  }

  const userExternalIds = new Set(users.rows.map(externalId).filter(Boolean));
  const appointmentSummary = summarizeAppointments(appointments.rows, calendars.rows, userExternalIds);
  const now = new Date().toISOString();
  const calendarRows = calendars.rows.map((calendar) => {
    const calendarId = externalId(calendar);
    return {
      ghlCalendarId: calendarId,
      calendarName: text(calendar.name) || calendarId || "Unnamed calendar",
      timezone: calendar.timezone ?? null,
      ownerOrTeam: text(calendar.ownerUserId) || null,
      futureAppointmentCount: appointments.rows.filter((appointment) => text(appointment.calendarId) === calendarId && text(appointment.startTime) >= now).length,
      proposedMapping: `${connection.display_name} - ${text(calendar.name) || calendarId || "Calendar"}`
    };
  });

  if (messages.preview.pagesFetched === 0 && conversations.rows.length === 0) limitations.push("Messages require readable conversations and message endpoints; no message pages were previewed.");
  if (orders.preview.unsupportedLimitations.length > 0) limitations.push("Orders availability depends on the currently enabled GHL payments API.");
  if (transactions.preview.unsupportedLimitations.length > 0) limitations.push("Transactions availability depends on the currently enabled GHL payments API.");

  const preview: GhlDryRunPreview = {
    readiness: "NOT_READY_FOR_IMPORT",
    generatedAt: new Date().toISOString(),
    connection: {
      id: connection.id,
      displayName: connection.display_name,
      ghlLocationId: connection.ghl_location_id,
      tokenPresent
    },
    location: {
      name: locationName,
      returnedLocationId,
      locationIdMatches: returnedLocationId === connection.ghl_location_id,
      metadataReadable: Boolean(locationPayload && !locationLimitation),
      limitation: locationLimitation
    },
    objects: previews.map((item) => item.preview),
    calendars: calendarRows,
    contacts: summarizeContactMatches(contacts.rows, mappings, localContactRows),
    appointments: appointmentSummary,
    limitations
  };
  preview.readiness = readinessFor(preview);
  return preview;
}

export function countsFromDryRunPreview(preview: GhlDryRunPreview): GhlSyncCounts {
  const fetched = preview.objects.reduce((sum, object) => sum + object.recordsFetched, 0);
  const pages = preview.objects.reduce((sum, object) => sum + object.pagesFetched, 0);
  return {
    fetched,
    created: preview.objects.reduce((sum, object) => sum + object.wouldCreate, 0),
    updated: preview.objects.reduce((sum, object) => sum + object.wouldUpdate, 0),
    unchanged: preview.objects.reduce((sum, object) => sum + object.existingMatches, 0),
    skipped: preview.objects.reduce((sum, object) => sum + object.duplicates + object.ambiguousMatches, 0),
    failed: preview.readiness === "NOT_READY_FOR_IMPORT" ? 1 : 0,
    pages
  };
}
