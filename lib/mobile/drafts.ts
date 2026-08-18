export type DraftRecord = {
  draftType: "clinical_note" | "task" | "contact_note" | "campaign_future" | "form_input";
  route: string;
  payload: Record<string, unknown>;
  sensitivity?: "standard" | "clinical" | "financial";
};

export function createDraftKey(draft: Pick<DraftRecord, "draftType" | "route"> & { entityId?: string | null }) {
  return [draft.draftType, draft.route, draft.entityId ?? "new"].join(":");
}

export function redactDraftPreview(draft: DraftRecord) {
  if (draft.sensitivity === "clinical" || draft.sensitivity === "financial") {
    return "Sensitive draft saved";
  }
  const keys = Object.keys(draft.payload).slice(0, 3);
  return keys.length ? `Draft fields: ${keys.join(", ")}` : "Draft saved";
}
