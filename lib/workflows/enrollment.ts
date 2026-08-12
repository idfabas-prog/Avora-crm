export type EnrollmentPolicy = "allow_multiple" | "one_per_contact" | "one_active_per_contact" | "one_per_triggering_record";

export function enrollmentKeyFor(policy: EnrollmentPolicy, input: { contactId?: string | null; triggeringEntityType?: string | null; triggeringEntityId?: string | null }) {
  if (policy === "allow_multiple") return null;
  if (policy === "one_per_triggering_record") {
    return input.triggeringEntityId ? `${input.triggeringEntityType ?? "record"}:${input.triggeringEntityId}` : null;
  }
  return input.contactId ? `contact:${input.contactId}` : null;
}

export function canReEnroll(reEnrollmentPolicy: string, previousStatus?: string | null) {
  if (!previousStatus) return true;
  if (reEnrollmentPolicy === "always") return true;
  if (reEnrollmentPolicy === "after_completion") return ["completed", "stopped", "failed", "cancelled"].includes(previousStatus);
  return false;
}
