import { providerCallIdempotencyKey } from "../../calls/metrics.ts";
import type { CreateCallRequest, CreateCallResult, InboundWebhookPayload, TelephonyAdapter } from "./types";

export class DevelopmentTelephonyAdapter implements TelephonyAdapter {
  mode = "development" as const;

  async createCall(request: CreateCallRequest): Promise<CreateCallResult> {
    const base = request.idempotencyKey ?? `${request.organizationId}:${request.contactId ?? request.toNumber}:${request.toNumber}`;
    return {
      provider: "development",
      providerCallId: providerCallIdempotencyKey("development", base),
      status: "queued",
      simulated: true
    };
  }

  async receiveInboundWebhook(payload: InboundWebhookPayload) {
    return { accepted: this.validateWebhook(payload), reason: this.validateWebhook(payload) ? undefined : "Invalid development webhook payload" };
  }

  async updateCallStatus(providerCallId: string, status: string) {
    return { providerCallId, status };
  }

  async fetchRecording() {
    return { storagePath: null, available: false };
  }

  async fetchTranscript() {
    return { transcriptText: null, available: false };
  }

  validateWebhook(payload: InboundWebhookPayload) {
    return payload.provider === "development" && payload.eventId.length > 0 && payload.providerCallId.length > 0;
  }
}
