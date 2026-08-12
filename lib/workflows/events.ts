import type { DomainEvent } from "./types.ts";

type SupabaseLike = {
  from: (table: string) => unknown;
};

export function domainEventKey(event: DomainEvent) {
  const entity = event.entityId ?? "none";
  const occurred = event.occurredAt?.toISOString() ?? "";
  return `${event.eventType}:${event.entityType}:${entity}:${occurred || "instant"}`;
}

export async function recordDomainEvent(supabase: SupabaseLike, event: DomainEvent) {
  if (!event.organizationId) {
    throw new Error("Domain event organization is required");
  }
  const occurredAt = event.occurredAt ?? new Date();

  const table = supabase.from("domain_events") as {
    upsert: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
      };
    };
  };

  return table
    .upsert({
      organization_id: event.organizationId,
      event_type: event.eventType,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      idempotency_key: domainEventKey({ ...event, occurredAt }),
      payload: event.payload,
      occurred_at: occurredAt.toISOString()
    }, { onConflict: "organization_id,idempotency_key" })
    .select("id")
    .single();
}
