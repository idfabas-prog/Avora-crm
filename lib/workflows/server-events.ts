"use server";

import { createClient } from "@/lib/supabase/server";
import { recordDomainEvent } from "@/lib/workflows/events";
import type { DomainEvent } from "@/lib/workflows/types";

export async function emitDomainEvent(event: DomainEvent) {
  try {
    const supabase = await createClient();
    await recordDomainEvent(supabase, event);
  } catch {
    // Domain events should not make the originating CRM action fail.
    // The workflow event bus can be replayed from audit data if a migration is not applied yet.
  }
}
