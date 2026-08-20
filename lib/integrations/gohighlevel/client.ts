import { privateIntegrationHeaders, tokenForConnection } from "./auth.ts";
import { assertGhlReadMode } from "./config.ts";
import { GhlIntegrationError } from "./errors.ts";
import { parsePagedResponse } from "./pagination.ts";
import { assertGhlResponse } from "./rate-limit.ts";
import type { GhlAppointment, GhlCalendar, GhlConnection, GhlContact, GhlConversation, GhlLocationMetadata, GhlMessage, GhlOpportunity, GhlPage, GhlPayment } from "./types.ts";

const baseUrl = "https://services.leadconnectorhq.com";
export const GHL_READ_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const READ_ONLY_POST_ENDPOINTS = new Set(["/contacts/search"]);
const CONTACT_SEARCH_BODY_KEYS = new Set(["locationId", "page", "pageLimit", "sort", "query"]);
const OPPORTUNITY_SEARCH_QUERY_KEYS = new Set([
  "q",
  "status",
  "campaignId",
  "id",
  "order",
  "endDate",
  "startAfter",
  "startAfterId",
  "date",
  "country",
  "page",
  "limit",
  "getTasks",
  "getNotes",
  "getCalendarEvents",
  "locationId",
  "pipelineId",
  "pipelineStageId",
  "contactId",
  "assignedTo"
]);

export function assertGhlReadOnlyHttpRequest(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET") return;
  if (normalizedMethod === "POST" && READ_ONLY_POST_ENDPOINTS.has(path)) return;
  throw new GhlIntegrationError(`Blocked outbound GoHighLevel ${normalizedMethod} request in read-only mode`, "writes_disabled", false, { endpoint: path });
}

type RequestOptions = {
  pageToken?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown>;
  version?: string;
  includeLocationQuery?: boolean;
  pageParam?: "pageToken" | "offset" | "lastMessageId" | "page" | "startAfterId";
  numericPageOnly?: boolean;
};

export class GhlReadOnlyClient {
  private readonly connection: GhlConnection;
  private readonly env: NodeJS.ProcessEnv;

  constructor(connection: GhlConnection, env: NodeJS.ProcessEnv = process.env) {
    this.connection = connection;
    this.env = env;
  }

  private safeEndpoint(url: URL) {
    return url.pathname;
  }

  private queryParameterNames(url: URL) {
    return Array.from(new Set(url.searchParams.keys())).sort();
  }

  private parseJson(bodyText: string) {
    if (!bodyText.trim()) return null;
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      return { message: "Provider returned a non-JSON response." };
    }
  }

  private numericPage(pageToken: string | number | null | undefined, endpoint: string, code: string) {
    const raw = String(pageToken ?? "").trim();
    if (!raw) return 1;
    const page = Number(raw);
    if (!Number.isInteger(page) || page < 1) {
      throw new GhlIntegrationError(`GoHighLevel pagination token must be a positive numeric page before requesting ${endpoint}.`, code, false, { endpoint, safeProviderMessage: "Pagination page must be numeric." });
    }
    return page;
  }

  private numericOpportunityPage(pageToken: string | null | undefined) {
    return this.numericPage(pageToken, "/opportunities/search", "invalid_opportunity_page");
  }

  private millisParam(value: string | number | boolean | null | undefined, fieldName: string) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    const raw = String(value ?? "").trim();
    if (/^\d+$/.test(raw)) return raw;
    const parsed = new Date(raw).getTime();
    if (Number.isFinite(parsed)) return parsed;
    throw new GhlIntegrationError(`GoHighLevel appointment ${fieldName} must be a millisecond timestamp or parseable date.`, "invalid_appointment_window", false, { endpoint: "/calendars/events", safeProviderMessage: `${fieldName} must be milliseconds.` });
  }

  private requestContext(url: URL, method: "GET" | "POST", apiVersion: string, requestBodyKeys: string[] = []) {
    return {
      endpoint: this.safeEndpoint(url),
      requestMethod: method,
      queryParameterNames: this.queryParameterNames(url),
      requestBodyKeys,
      apiVersion
    };
  }

  private requestTimeout() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GHL_READ_REQUEST_TIMEOUT_MS);
    return {
      signal: controller.signal,
      clear: () => clearTimeout(timeout)
    };
  }

  private async fetchWithTimeout(url: URL, init: RequestInit) {
    const timeout = this.requestTimeout();
    try {
      return await fetch(url, { ...init, signal: timeout.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new GhlIntegrationError(`GoHighLevel read request timed out after ${GHL_READ_REQUEST_TIMEOUT_MS / 1000} seconds`, "request_timeout", true, { endpoint: this.safeEndpoint(url), queryParameterNames: this.queryParameterNames(url) });
      }
      throw error;
    } finally {
      timeout.clear();
    }
  }

  private async request<T>(path: string, keys: string[], options: RequestOptions = {}): Promise<GhlPage<T>> {
    assertGhlReadMode(this.env);
    const token = tokenForConnection(this.connection, this.env);
    if (!token) throw new GhlIntegrationError("GoHighLevel token is not configured for this connection", "missing_token", false);

    const url = new URL(path, baseUrl);
    assertGhlReadOnlyHttpRequest("GET", path);
    if (options.includeLocationQuery !== false) url.searchParams.set("locationId", this.connection.ghl_location_id);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    if (options.pageToken) url.searchParams.set(options.pageParam ?? "pageToken", options.pageToken);

    const apiVersion = options.version ?? "v3";
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: privateIntegrationHeaders(token, apiVersion),
      cache: "no-store"
    });
    const payload = this.parseJson(await response.text());
    const context = this.requestContext(url, "GET", apiVersion);
    await assertGhlResponse(response, payload, context);
    const page = parsePagedResponse<T>(payload, keys, {
      httpStatus: response.status,
      endpoint: context.endpoint,
      queryParameterNames: this.queryParameterNames(url),
      apiVersion,
      requestMethod: "GET",
      limit: Number(options.query?.limit ?? options.query?.pageLimit) || undefined,
      offset: Number(options.pageToken ?? options.query?.offset) || undefined,
      numericPageOnly: options.numericPageOnly
    });
    return page;
  }

  private async postPaged<T>(path: string, keys: string[], options: RequestOptions = {}): Promise<GhlPage<T>> {
    assertGhlReadMode(this.env);
    const token = tokenForConnection(this.connection, this.env);
    if (!token) throw new GhlIntegrationError("GoHighLevel token is not configured for this connection", "missing_token", false);

    const url = new URL(path, baseUrl);
    assertGhlReadOnlyHttpRequest("POST", path);
    const page = options.numericPageOnly
      ? this.numericPage(options.pageToken ?? (options.body?.page as string | number | null | undefined) ?? 1, path, "invalid_provider_page")
      : Number(options.pageToken ?? options.body?.page ?? 1);
    const body: Record<string, unknown> = { ...options.body, locationId: this.connection.ghl_location_id, page };
    const apiVersion = options.version ?? "v3";
    const requestBodyKeys = Object.keys(body).sort();
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: privateIntegrationHeaders(token, apiVersion, true),
      cache: "no-store",
      body: JSON.stringify(body)
    });
    const payload = this.parseJson(await response.text());
    const context = this.requestContext(url, "POST", apiVersion, requestBodyKeys);
    await assertGhlResponse(response, payload, context);
    return parsePagedResponse<T>(payload, keys, { httpStatus: response.status, endpoint: context.endpoint, queryParameterNames: this.queryParameterNames(url), apiVersion, requestMethod: "POST", page, limit: Number(body.pageLimit ?? body.limit) || undefined, numericPageOnly: options.numericPageOnly });
  }

  private async readJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    assertGhlReadMode(this.env);
    const token = tokenForConnection(this.connection, this.env);
    if (!token) throw new GhlIntegrationError("GoHighLevel token is not configured for this connection", "missing_token", false);

    const url = new URL(path, baseUrl);
    assertGhlReadOnlyHttpRequest("GET", path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    const apiVersion = options.version ?? "v3";
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: privateIntegrationHeaders(token, apiVersion),
      cache: "no-store"
    });
    const payload = this.parseJson(await response.text());
    await assertGhlResponse(response, payload, this.requestContext(url, "GET", apiVersion));
    return payload as T;
  }

  getLocationMetadata() {
    return this.readJson<GhlLocationMetadata | { location?: GhlLocationMetadata }>(`/locations/${this.connection.ghl_location_id}`);
  }

  getTags(options?: RequestOptions) {
    return this.request<Record<string, unknown>>(`/locations/${this.connection.ghl_location_id}/tags`, ["tags"], { ...options, includeLocationQuery: false });
  }

  getCustomFields(options?: RequestOptions) {
    return this.request<Record<string, unknown>>(`/locations/${this.connection.ghl_location_id}/customFields`, ["customFields", "custom_fields"], { ...options, query: options?.query, includeLocationQuery: false });
  }

  getLocationUsers(options?: RequestOptions) {
    return this.request<Record<string, unknown>>("/users/", ["users"], { ...options, query: {}, version: "2023-02-21" });
  }

  getContacts(options?: RequestOptions) {
    const requestedLimit = Number(options?.body?.pageLimit ?? options?.body?.limit ?? options?.query?.pageLimit ?? options?.query?.limit ?? 100);
    const rawBody: Record<string, unknown> = { ...(options?.body ?? {}), pageLimit: Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 100 };
    const body = Object.fromEntries(Object.entries(rawBody).filter(([key]) => CONTACT_SEARCH_BODY_KEYS.has(key)));
    return this.postPaged<GhlContact>("/contacts/search", ["contacts"], { ...options, body, numericPageOnly: true });
  }

  async getContact(contactId: string) {
    const payload = await this.readJson<GhlContact | { contact?: GhlContact }>(`/contacts/${contactId}`, { includeLocationQuery: false });
    const row = payload && typeof payload === "object" ? payload as { contact?: GhlContact } : {};
    return (row.contact ?? payload) as GhlContact;
  }

  getCalendars(options?: RequestOptions) {
    return this.request<GhlCalendar>("/calendars/", ["calendars"], options);
  }

  getAppointments(options?: RequestOptions) {
    const rawQuery = options?.query ?? {};
    const calendarId = rawQuery.calendarId;
    const userId = rawQuery.userId;
    const groupId = rawQuery.groupId;
    if (!calendarId && !userId && !groupId) {
      throw new GhlIntegrationError("GoHighLevel calendar events require calendarId, userId, or groupId.", "invalid_appointment_request", false, { endpoint: "/calendars/events", safeProviderMessage: "calendarId, userId, or groupId is required." });
    }
    const query: Record<string, string | number | boolean | null | undefined> = {
      calendarId,
      userId,
      groupId,
      startTime: this.millisParam(rawQuery.startTime, "startTime"),
      endTime: this.millisParam(rawQuery.endTime, "endTime")
    };
    return this.request<GhlAppointment>("/calendars/events", ["events", "appointments"], { ...options, pageToken: null, query });
  }

  getConversations(options?: RequestOptions) {
    return this.request<GhlConversation>("/conversations/search", ["conversations"], options);
  }

  getMessages(conversationId: string, options?: RequestOptions) {
    return this.request<GhlMessage>(`/conversations/${conversationId}/messages`, ["messages"], { ...options, pageParam: "lastMessageId" });
  }

  getOpportunities(options?: RequestOptions) {
    const page = this.numericOpportunityPage(options?.pageToken);
    const requestedQuery = Object.entries(options?.query ?? {}).filter(([key]) => OPPORTUNITY_SEARCH_QUERY_KEYS.has(key));
    const query: Record<string, string | number | boolean | null | undefined> = { limit: 100, ...Object.fromEntries(requestedQuery), page };
    return this.request<GhlOpportunity>("/opportunities/search", ["opportunities"], {
      ...options,
      pageToken: null,
      pageParam: "page",
      query,
      numericPageOnly: true
    });
  }

  getPipelines(options?: RequestOptions) {
    return this.request<Record<string, unknown>>("/opportunities/pipelines", ["pipelines"], { ...options, query: options?.query });
  }

  getUsers(options?: RequestOptions) {
    return this.getLocationUsers(options);
  }

  getPayments(options?: RequestOptions) {
    return this.request<GhlPayment>("/payments/transactions", ["data", "transactions", "payments"], {
      ...options,
      includeLocationQuery: false,
      pageParam: "offset",
      query: { altId: this.connection.ghl_location_id, altType: "location", limit: 100, offset: 0, ...(options?.query ?? {}) }
    });
  }

  getOrders(options?: RequestOptions) {
    return this.request<Record<string, unknown>>("/payments/orders", ["data", "orders"], {
      ...options,
      includeLocationQuery: false,
      pageParam: "offset",
      query: { altId: this.connection.ghl_location_id, altType: "location", limit: 100, offset: 0, ...(options?.query ?? {}) }
    });
  }
}
