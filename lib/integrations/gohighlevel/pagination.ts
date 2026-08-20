import type { GhlPage } from "./types.ts";

type ParseOptions = {
  page?: number;
  offset?: number;
  limit?: number;
  httpStatus?: number;
  endpoint?: string;
  queryParameterNames?: string[];
  apiVersion?: string;
  requestMethod?: "GET" | "POST";
  numericPageOnly?: boolean;
};

function objectRecord(payload: unknown) {
  return (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
}

function arraysForKeys<T>(record: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) => (Array.isArray(record[key]) ? (record[key] as T[]) : []));
}

function wrappedCollectionForKeys<T>(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const wrapper = objectRecord(value);
    if (Array.isArray(wrapper[key])) return { key, wrapper, data: wrapper[key] as T[] };
  }
  return null;
}

function malformedWrapperWarnings(record: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) => {
    const value = record[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const wrapper = objectRecord(value);
    if (Array.isArray(wrapper[key])) return [];
    return [`Recognized wrapper "${key}" did not contain an inner "${key}" array. Wrapper keys: ${Object.keys(wrapper).join(", ") || "none"}.`];
  });
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function token(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  return null;
}

export function parsePagedResponse<T>(payload: unknown, keys: string[], options: ParseOptions = {}): GhlPage<T> {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const nestedData = objectRecord(record.data);
  const keyedData = arraysForKeys<T>(record, keys);
  const nestedKeyedData = record.data && !Array.isArray(record.data) ? arraysForKeys<T>(nestedData, keys) : [];
  const wrappedCollection = wrappedCollectionForKeys<T>(record, keys);
  const wrappedData = wrappedCollection?.data ?? [];
  const genericData = Array.isArray(record.data) ? (record.data as T[]) : [];
  const data = keyedData.length ? keyedData : nestedKeyedData.length ? nestedKeyedData : wrappedData.length || wrappedCollection ? wrappedData : genericData;
  const meta = (record.meta && typeof record.meta === "object" ? record.meta : {}) as Record<string, unknown>;
  const pagination = objectRecord(record.pagination);
  const wrapper: Record<string, unknown> = wrappedCollection?.wrapper ?? {};
  const total = numeric(record.count ?? record.totalCount ?? record.total ?? meta.count ?? meta.totalCount ?? meta.total ?? pagination.count ?? pagination.totalCount ?? pagination.total ?? wrapper.count ?? wrapper.totalCount ?? wrapper.total);
  const page = options.page ?? numeric(record.page ?? meta.page ?? pagination.page ?? wrapper.page) ?? null;
  const offset = options.offset ?? numeric(record.offset ?? meta.offset ?? pagination.offset ?? wrapper.offset) ?? null;
  const limit = options.limit ?? numeric(record.limit ?? record.pageLimit ?? meta.limit ?? meta.pageLimit ?? pagination.limit ?? pagination.pageLimit ?? wrapper.limit ?? wrapper.pageLimit) ?? null;
  const inferredNextPage = total !== null && page !== null && limit !== null && total > page * limit ? String(page + 1) : null;
  const inferredNextFullPage = options.numericPageOnly && total === null && page !== null && limit !== null && data.length >= limit ? String(page + 1) : null;
  const inferredNextOffset = total !== null && offset !== null && limit !== null && total > offset + limit ? String(offset + limit) : "";
  const wrappedNextPageToken = wrappedCollection && (wrapper.nextPage === true || wrapper.hasMore === true)
    ? token(wrapper.lastMessageId) ?? token(wrapper.nextPageToken) ?? token(wrapper.cursor)
    : null;
  const cursorNextPageToken = options.numericPageOnly ? null : (token(record.nextPageToken)
    ?? token(record.nextPage)
    ?? token(record.startAfterId)
    ?? token(meta.nextPageToken)
    ?? token(meta.nextPage)
    ?? token(meta.startAfterId)
    ?? token(pagination.nextPageToken)
    ?? token(pagination.nextPage)
    ?? wrappedNextPageToken);
  const nextPageToken = ((cursorNextPageToken
    ?? inferredNextPage
    ?? inferredNextFullPage
    ?? inferredNextOffset) || null);
  const cursor = token(record.cursor) ?? token(meta.cursor) ?? token(wrapper.cursor);
  const recognizedCollection = keyedData.length > 0 || nestedKeyedData.length > 0 || Boolean(wrappedCollection) || Array.isArray(record.data);
  const wrapperWarnings = malformedWrapperWarnings(record, keys);
  const parserWarnings = [
    ...(recognizedCollection ? [] : [`No recognized collection array found. Response keys: ${Object.keys(record).join(", ") || "none"}.`]),
    ...wrapperWarnings
  ];
  return {
    data,
    nextPageToken,
    cursor,
    offset,
    hasMore: Boolean(nextPageToken || cursor || record.hasMore === true),
    recordsAvailable: total,
    httpStatus: options.httpStatus,
    endpoint: options.endpoint,
    queryParameterNames: options.queryParameterNames,
    apiVersion: options.apiVersion,
    requestMethod: options.requestMethod,
    responseKeys: Object.keys(record),
    parserWarnings
  };
}
