import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { applyAppointmentStatusBackfill, buildAppointmentStatusBackfillApplyPreview } from "@/lib/integrations/gohighlevel/appointment-status-backfill";
import {
  safeAppointmentStatusBackfillRequestError,
  validateAppointmentStatusBackfillPreviewRequest,
  validateAppointmentStatusBackfillRequest
} from "@/lib/integrations/gohighlevel/appointment-status-backfill-request";
import { assertGhlReadMode } from "@/lib/integrations/gohighlevel/config";
import { assertGhlPermission, ghlLocationAllowed } from "@/lib/integrations/gohighlevel/permissions";
import { createSyncRun } from "@/lib/integrations/gohighlevel/sync";
import type { GhlConnection } from "@/lib/integrations/gohighlevel/types";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const mode = payload && typeof payload === "object" && "mode" in payload && payload.mode === "apply" ? "apply" : "preview";
    const requestInput = mode === "apply"
      ? validateAppointmentStatusBackfillRequest(payload)
      : validateAppointmentStatusBackfillPreviewRequest(payload);
    const profile = await requireCurrentProfile();
    assertGhlPermission(profile, "integrations.ghl.sync");
    assertGhlReadMode();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ghl_connections")
      .select("*")
      .eq("id", requestInput.connectionId)
      .eq("organization_id", profile.organizationId)
      .single();

    if (error || !data) throw new Error("GoHighLevel connection not found");

    const connection = data as GhlConnection;
    if (!ghlLocationAllowed(profile, connection.location_id)) {
      throw new Error("GoHighLevel connection is not available for this user");
    }

    if (mode === "preview") {
      const preview = await buildAppointmentStatusBackfillApplyPreview(supabase, profile, connection);
      return NextResponse.json({
        ok: true,
        mode: "preview",
        preview: {
          mappings: preview.mappingsRead,
          providerEvents: preview.providerAppointmentsFetched,
          providerStatusesResolved: preview.providerStatusesResolved,
          candidates: preview.applyCandidateCount,
          wouldChange: preview.wouldChangeCount,
          unresolved: preview.unresolvedCount,
          proposed: preview.proposedNormalizedBreakdown,
          current: preview.currentStatusBreakdown,
          invariantOk: preview.dryRunWouldChangeEqualsApplyCandidates,
          ghlWritesPerformed: false,
          normalizedBusinessRecordsWritten: false
        }
      });
    }

    const applyInput = requestInput as ReturnType<typeof validateAppointmentStatusBackfillRequest>;
    const report = await applyAppointmentStatusBackfill(supabase, profile, connection, {
      expectedCandidateCount: applyInput.expectedCandidateCount
    });
    const runId = await createSyncRun(supabase, profile, connection, "manual_object_sync", "appointment", {
      fetched: report.providerAppointmentsFetched,
      created: 0,
      updated: report.appointmentStatusChangedCount,
      unchanged: Math.max(0, report.mappingsRead - report.appointmentStatusChangedCount),
      skipped: report.unresolvedCount,
      failed: report.failedCount,
      pages: report.providerPagesFetched
    }, {
      appointment_status_backfill_apply: report,
      normalized_business_records_written: report.appointmentStatusChangedCount > 0,
      status_update_candidates: report.applyCandidateCount,
      mapping_metadata_updated: report.mappingMetadataUpdatedCount,
      ghl_writes_performed: false
    });

    if (report.failedCount > 0) {
      await supabase
        .from("ghl_sync_runs")
        .update({ status: "partial", error_summary: `${report.failedCount} appointment status backfill updates failed` })
        .eq("id", runId);
    }

    revalidatePath("/settings/integrations/gohighlevel");
    revalidatePath("/integrations/gohighlevel");
    revalidatePath("/integrations/gohighlevel/runs");

    return NextResponse.json({
      ok: true,
      runId,
      report: {
        totalAppointments: report.reconciliation.total,
        scheduled: report.reconciliation.scheduled,
        completed: report.reconciliation.completed,
        cancelled: report.reconciliation.cancelled,
        noShow: report.reconciliation.no_show,
        candidates: report.applyCandidateCount,
        changed: report.appointmentStatusChangedCount,
        metadataUpdated: report.mappingMetadataUpdatedCount,
        failed: report.failedCount
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeAppointmentStatusBackfillRequestError(error) },
      { status: 400 }
    );
  }
}
