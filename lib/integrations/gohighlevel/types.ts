export type GhlIntegrationMode = "disabled" | "development" | "read_only" | "two_way_future";
export type GhlObjectType =
  | "contact"
  | "calendar"
  | "appointment"
  | "conversation"
  | "message"
  | "opportunity"
  | "pipeline"
  | "user"
  | "payment"
  | "transaction"
  | "order"
  | "tag"
  | "custom_field";

export type GhlConnection = {
  id: string;
  organization_id: string;
  location_id: string | null;
  display_name: string;
  ghl_location_id: string;
  credential_env_key?: string | null;
  connection_type: "private_integration" | "oauth_future" | "mock";
  status: "healthy" | "syncing" | "warning" | "error" | "disabled";
  sync_mode: GhlIntegrationMode;
  token_present: boolean;
  objects_enabled?: Record<string, boolean> | null;
  last_successful_sync_at?: string | null;
  last_full_sync_at?: string | null;
  last_webhook_at?: string | null;
};

export type GhlContact = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  source?: string | null;
  assignedTo?: string | null;
  dateAdded?: string | null;
  updatedAt?: string | null;
  customFields?: Record<string, unknown>;
  dnd?: boolean;
};

export type GhlCalendar = {
  id: string;
  name: string;
  active?: boolean;
  ownerUserId?: string | null;
  timezone?: string | null;
  updatedAt?: string | null;
};

export type GhlAppointment = {
  id: string;
  contactId?: string | null;
  calendarId?: string | null;
  assignedUserId?: string | null;
  title?: string | null;
  appointmentStatus?: string | null;
  status?: string | null;
  startTime: string;
  endTime: string;
  timezone?: string | null;
  notes?: string | null;
  updatedAt?: string | null;
};

export type GhlConversation = {
  id: string;
  contactId?: string | null;
  channel?: string | null;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
};

export type GhlMessage = {
  id: string;
  conversationId: string;
  contactId?: string | null;
  direction?: string | null;
  channel?: string | null;
  body?: string | null;
  status?: string | null;
  timestamp?: string | null;
};

export type GhlOpportunity = {
  id: string;
  contactId?: string | null;
  pipelineId?: string | null;
  stageId?: string | null;
  assignedUserId?: string | null;
  name?: string | null;
  value?: number | null;
  status?: string | null;
  source?: string | null;
  updatedAt?: string | null;
};

export type GhlPayment = {
  id: string;
  contactId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  status?: string | null;
  provider?: string | null;
  receivedAt?: string | null;
};

export type GhlLocationMetadata = {
  id?: string | null;
  _id?: string | null;
  name?: string | null;
  businessName?: string | null;
  companyName?: string | null;
  locationId?: string | null;
  timezone?: string | null;
};

export type GhlPage<T> = {
  data: T[];
  nextPageToken?: string | null;
  cursor?: string | null;
  offset?: number | null;
  hasMore: boolean;
  recordsAvailable?: number | null;
  httpStatus?: number;
  endpoint?: string;
  queryParameterNames?: string[];
  apiVersion?: string;
  requestMethod?: "GET" | "POST";
  responseKeys?: string[];
  parserWarnings?: string[];
};

export type GhlSyncCounts = {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  pages: number;
};
