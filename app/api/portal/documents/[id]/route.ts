import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentPatient } from "@/lib/portal/patient";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const patient = await requireCurrentPatient();
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: document, error } = await supabase
    .from("clinical_documents")
    .select("id, storage_bucket, storage_path")
    .eq("id", id)
    .eq("contact_id", patient.contactId)
    .eq("patient_visible", true)
    .eq("status", "active")
    .single();

  if (error || !document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message ?? "Signed URL unavailable" }, { status: 500 });
  }

  await supabase.from("audit_logs").insert({
    organization_id: patient.organizationId,
    actor_id: null,
    action: "Portal Document Viewed",
    entity_table: "clinical_documents",
    entity_id: document.id,
    metadata: { contact_id: patient.contactId }
  });

  return NextResponse.redirect(signed.signedUrl);
}
