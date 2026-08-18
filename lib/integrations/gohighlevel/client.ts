import { privateIntegrationHeaders, tokenForConnection } from "./auth.ts";
import { assertGhlReadMode } from "./config.ts";
import { GhlIntegrationError } from "./errors.ts";
import { parsePagedResponse } from "./pagination.ts";
import { assertGhlResponse } from "./rate-limit.ts";
import type { GhlAppointment, GhlCalendar, GhlConnection, GhlContact, GhlConversation, GhlLocationMetadata, GhlMessage, GhlOpportunity, GhlPage, GhlPayment } from "./types.ts";

const baseUrl = "https://services.leadconnectorhq.com";
export const GHL_READ_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const READ_ONLY_POST_ENDPOINTS = new Set(["/contacts/search"]);

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
    return `${url.pathname}${url.search}`;
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

  private numericOpportunityPage(pageToken: string | null | undefined) {
    const raw = String(pageToken ?? "").trim();
    if (!raw) return 1;
    const page = Number(raw);
    if (!Number.isInteger(page) || page < 1) {
      throw new GhlIntegrationError("GoHighLevel opportunity pagination token must be a numeric page before requesting /opportunities/search.", "invalid_opportunity_page", false, { endpoint: "/opportunities/search", safeProviderMessage: "Opportunity search page must be numeric." });
    }
    return page;
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
        throw new GhlIntegrationError(`GoHighLevel read request timed out after ${GHL_READ_REQUEST_TIMEOUT_MS / 1000} seconds`, "request_timeout", true, { endpoint: this.safeEndpoint(url) });
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

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: privateIntegrationHeaders(token, options.version ?? "v3"),
      cache: "no-store"
    });
    const payload = this.parseJson(await response.text());
    const endpoint = this.safeEndpoint(url);
    await assertGhlResponse(response, payload, endpoint);
    const page = parsePagedResponse<T>(payload, keys, {
      httpStatus: response.status,
      endpoint,
      queryParameterNames: this.queryParameterNames(url),
      apiVersion: options.version ?? "v3",
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
    const page = Number(options.pageToken ?? options.body?.page ?? 1);
    const body: Record<string, unknown> = { ...options.body, locationId: this.connection.ghl_location_id, page };
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: privateIntegrationHeaders(token, options.version ?? "v3", true),
      cache: "no-store",
      body: JSON.stringify(body)
    });
    const payload = this.parseJson(await response.text());
    const endpoint = this.safeEndpoint(url);
    await assertGhlResponse(response, payload, endpoint);
    return parsePagedResponse<T>(payload, keys, { httpStatus: response.status, endpoint, queryParameterNames: this.queryParameterNames(url), apiVersion: options.version ?? "v3", requestMethod: "POST", page, limit: Number(body.pageLimit ?? body.limit) || undefined });
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

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: privateIntegrationHeaders(token, options.version ?? "v3"),
      cache: "no-store"
    });
    const payload = this.parseJson(await response.text());
    await assertGhlResponse(response, payload, this.safeEndpoint(url));
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
    return this.postPaged<GhlContact>("/contacts/search", ["contacts"], { ...options, body: { pageLimit: 100, ...(options?.body ?? {}) } });
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
    return this.request<GhlAppointment>("/calendars/events", ["events", "appointments"], options);
  }

  getConversations(options?: RequestOptions) {
    return this.request<GhlConversation>("/conversations/search", ["conversations"], options);
  }

  getMessages(conversationId: string, options?: RequestOptions) {
    return this.request<GhlMessage>(`/conversations/${conversationId}/messages`, ["messages"], { ...options, pageParam: "lastMessageId" });
  }

  getOpportunities(options?: RequestOptions) {
    const page = this.numericOpportunityPage(options?.pageToken);
    const query: Record<string, string | number | boolean | null | undefined> = { limit: 100, ...(options?.query ?? {}), page };
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
