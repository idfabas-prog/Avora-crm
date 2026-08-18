export type CreateCallRequest = {
  organizationId: string;
  locationId: string | null;
  contactId: string | null;
  fromNumber: string;
  toNumber: string;
  idempotencyKey?: string | null;
};

export type CreateCallResult = {
  provider: string;
  providerCallId: string;
  status: "queued" | "ringing" | "answered" | "completed";
  simulated: boolean;
};

export type InboundWebhookPayload = {
  provider: string;
  providerCallId: string;
  fromNumber: string;
  toNumber: string;
  status: string;
  eventId: string;
  signature?: string;
};

export type TelephonyAdapter = {
  mode: "development" | "disabled" | "live";
  createCall(request: CreateCallRequest): Promise<CreateCallResult>;
  receiveInboundWebhook(payload: InboundWebhookPayload): Promise<{ accepted: boolean; reason?: string }>;
  updateCallStatus(providerCallId: string, status: string): Promise<{ providerCallId: string; status: string }>;
  fetchRecording(providerCallId: string): Promise<{ storagePath: string | null; available: boolean }>;
  fetchTranscript(providerCallId: string): Promise<{ transcriptText: string | null; available: boolean }>;
  validateWebhook(payload: InboundWebhookPayload): boolean;
};
