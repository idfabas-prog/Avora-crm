"use client";

import {
  cancelGhlFullImportAction,
  applyGhlCalendarTypeBackfillAction,
  previewGhlCalendarTypeBackfillAction,
  runGhlReconciliationAction,
  runGhlIncrementalSyncNowAction,
  saveGhlCalendarTypeMappingAction,
  startGhlAppointmentStatusBackfillDryRunAction,
  saveGhlConnection,
  startGhlDryRunAction,
  startGhlFullImportAction,
  resumeGhlFullImportAction,
  retryGhlFailedRecordsAction,
  testGhlConnectionAction,
  resolveGhlExceptionAction
} from "@/app/gohighlevel-actions";
import { ActionForm } from "@/components/crm/ActionForm";
import type { LocationOption } from "@/lib/auth/profile";
import { useState, useTransition } from "react";

type AppointmentStatusApplyPreviewPayload = {
  mappings: number;
  providerStatusesResolved: number;
  candidates: number;
  wouldChange: number;
  unresolved: number;
  invariantOk: boolean;
  proposed?: Record<string, number>;
  current?: Record<string, number>;
};

type AppointmentTypeOption = {
  id: string;
  name: string;
};

type CalendarTypeBackfillPreviewPayload = {
  appointmentsScanned: number;
  mapped: number;
  wouldUpdate: number;
  missingCalendarMapping: number;
  ambiguousMapping: number;
  alreadyCorrect: number;
  locationMismatch: number;
  providerAudit: {
    importedWithExternalProviderUser: number;
    mappedToInternalProvider: number;
    stillUnassigned: number;
    externalProviderMappedToInternalProvider: number;
    externalProviderStillUnassigned: number;
  };
};

export function GhlConnectionForm({ locations }: { locations: LocationOption[] }) {
  return (
    <ActionForm action={saveGhlConnection} submitLabel="Save Connection" successMessage="Connection saved">
      <div className="form-grid">
        <label><span>Connection Name</span><input name="display_name" placeholder="Miami GoHighLevel" required /></label>
        <label><span>Dev Dashboard Location</span><select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>GHL Location ID</span><input name="ghl_location_id" placeholder="loc_..." required /></label>
        <label><span>Sync Mode</span><select name="sync_mode" defaultValue="read_only"><option value="read_only">Read-only Live</option><option value="development">Development Mock</option><option value="disabled">Disabled</option></select></label>
      </div>
    </ActionForm>
  );
}

export function GhlConnectionActions({ connectionId }: { connectionId: string }) {
  return (
    <div className="inline-actions">
      <GhlTestConnectionForm connectionId={connectionId} />
      <ActionForm action={startGhlDryRunAction} className="inline-form" submitLabel="Dry Run / Preview Import" successMessage="Preview import completed">
        <input name="connection_id" type="hidden" value={connectionId} />
      </ActionForm>
      <ActionForm action={runGhlReconciliationAction} className="inline-form" submitLabel="Reconcile" successMessage="Reconciliation queued">
        <input name="connection_id" type="hidden" value={connectionId} />
      </ActionForm>
      <GhlAppointmentStatusBackfillDryRunForm connectionId={connectionId} />
    </div>
  );
}

export function GhlTestConnectionForm({ connectionId }: { connectionId: string }) {
  return (
    <ActionForm action={testGhlConnectionAction} className="inline-form" submitLabel="Test Connection" successMessage="Connection tested">
      <input name="connection_id" type="hidden" value={connectionId} />
    </ActionForm>
  );
}

export function GhlDryRunPreviewForm({ connectionId }: { connectionId: string }) {
  return (
    <ActionForm action={startGhlDryRunAction} submitLabel="Dry Run / Preview Import" successMessage="Preview import completed">
      <input name="connection_id" type="hidden" value={connectionId} />
    </ActionForm>
  );
}

export function GhlAppointmentStatusBackfillDryRunForm({ connectionId }: { connectionId: string }) {
  return (
    <ActionForm action={startGhlAppointmentStatusBackfillDryRunAction} className="inline-form" submitLabel="Appointment Status Dry Run" successMessage="Appointment status dry run completed">
      <input name="connection_id" type="hidden" value={connectionId} />
    </ActionForm>
  );
}

export function GhlAppointmentStatusBackfillApplyForm({ connectionId }: { connectionId: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<AppointmentStatusApplyPreviewPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const applyEnabled = Boolean(preview && preview.candidates > 0 && preview.invariantOk);

  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        setError(null);
        startTransition(async () => {
          try {
            if (!preview) throw new Error("Run Apply Preview before applying the appointment status backfill");
            if (!preview.invariantOk) throw new Error("Apply Preview did not match the dry-run candidate count. Run Appointment Status Dry Run again.");
            if (preview.candidates < 1) throw new Error("Apply Preview found zero status backfill candidates");
            const response = await fetch("/api/integrations/gohighlevel/appointment-status-backfill", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode: "apply", connectionId, confirmation, expectedCandidateCount: preview.candidates })
            });
            const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; report?: { candidates?: number; changed?: number; metadataUpdated?: number; failed?: number } } | null;
            if (!response.ok || !payload?.ok) {
              throw new Error(payload?.error || `Appointment status backfill failed with HTTP ${response.status}`);
            }
            setMessage(`Appointment status backfill completed. Candidates ${payload.report?.candidates ?? 0}; changed ${payload.report?.changed ?? 0}; metadata updated ${payload.report?.metadataUpdated ?? 0}; failed ${payload.report?.failed ?? 0}.`);
            setConfirmation("");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Appointment status backfill failed");
          }
        });
      }}
    >
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            try {
              const response = await fetch("/api/integrations/gohighlevel/appointment-status-backfill", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode: "preview", connectionId })
              });
              const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; preview?: AppointmentStatusApplyPreviewPayload } | null;
              if (!response.ok || !payload?.ok || !payload.preview) {
                throw new Error(payload?.error || `Appointment status apply preview failed with HTTP ${response.status}`);
              }
              setPreview(payload.preview);
              setMessage(`Apply Preview ready. Mappings ${payload.preview.mappings}; resolved ${payload.preview.providerStatusesResolved}; candidates ${payload.preview.candidates}; unresolved ${payload.preview.unresolved}.`);
            } catch (caught) {
              setPreview(null);
              setError(caught instanceof Error ? caught.message : "Appointment status apply preview failed");
            }
          });
        }}
        type="button"
      >
        {pending ? "Checking..." : "Apply Preview"}
      </button>
      {preview ? (
        <div className="mini-list">
          <span>Apply Preview: mappings {preview.mappings}; resolved {preview.providerStatusesResolved}; candidates {preview.candidates}; would change {preview.wouldChange}; unresolved {preview.unresolved}</span>
          <span>Current statuses: {Object.entries(preview.current ?? {}).map(([key, value]) => `${key}: ${value}`).join("; ")}</span>
          <span>Proposed statuses: {Object.entries(preview.proposed ?? {}).map(([key, value]) => `${key}: ${value}`).join("; ")}</span>
        </div>
      ) : null}
      <label>
        <span>Confirmation</span>
        <input
          name="confirmation"
          onChange={(event) => setConfirmation(event.currentTarget.value)}
          placeholder="Type APPLY STATUS BACKFILL"
          required
          value={confirmation}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <button className="primary-button" disabled={pending || !applyEnabled} type="submit">
        {pending ? "Saving..." : "Apply Appointment Status Backfill"}
      </button>
    </form>
  );
}

export function GhlCalendarTypeMappingForm({
  appointmentTypes,
  connectionId,
  currentAppointmentTypeId,
  externalCalendarId
}: {
  appointmentTypes: AppointmentTypeOption[];
  connectionId: string;
  currentAppointmentTypeId?: string | null;
  externalCalendarId: string;
}) {
  return (
    <ActionForm action={saveGhlCalendarTypeMappingAction} className="inline-form" submitLabel="Save Type Mapping" successMessage="Calendar type mapping saved">
      <input name="connection_id" type="hidden" value={connectionId} />
      <input name="external_calendar_id" type="hidden" value={externalCalendarId} />
      <select defaultValue={currentAppointmentTypeId ?? ""} name="appointment_type_id" required>
        <option value="">Choose appointment type</option>
        {appointmentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
    </ActionForm>
  );
}

export function GhlCalendarTypeBackfillPreviewForm({ connectionId }: { connectionId: string }) {
  return (
    <ActionForm action={previewGhlCalendarTypeBackfillAction} className="inline-form" submitLabel="Preview Type Backfill" successMessage="Calendar type backfill preview saved to runs">
      <input name="connection_id" type="hidden" value={connectionId} />
    </ActionForm>
  );
}

export function GhlCalendarTypeBackfillApplyForm({ connectionId }: { connectionId: string }) {
  return (
    <ActionForm action={applyGhlCalendarTypeBackfillAction} submitLabel="Apply Type Backfill" successMessage="Calendar type backfill completed">
      <input name="connection_id" type="hidden" value={connectionId} />
      <label><span>Expected Candidate Count</span><input min={1} name="expected_candidate_count" placeholder="Preview count" required type="number" /></label>
      <label><span>Confirmation</span><input name="confirmation" placeholder="Type APPLY GHL CALENDAR TYPE BACKFILL" required /></label>
    </ActionForm>
  );
}

export function GhlCalendarTypeBackfillControls({ connectionId }: { connectionId: string }) {
  const [preview, setPreview] = useState<CalendarTypeBackfillPreviewPayload | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canApply = Boolean(preview && preview.wouldUpdate > 0);

  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        setError(null);
        startTransition(async () => {
          try {
            if (!preview) throw new Error("Run Preview Type Backfill first");
            const formData = new FormData();
            formData.set("connection_id", connectionId);
            formData.set("confirmation", confirmation);
            formData.set("expected_candidate_count", String(preview.wouldUpdate));
            const result = await applyGhlCalendarTypeBackfillAction(formData) as { changed: number; failed: number };
            setMessage(`Type backfill complete. Changed ${result.changed}; failed ${result.failed}.`);
            setConfirmation("");
            setPreview(null);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Calendar type backfill failed");
          }
        });
      }}
    >
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            try {
              const formData = new FormData();
              formData.set("connection_id", connectionId);
              const result = await previewGhlCalendarTypeBackfillAction(formData) as CalendarTypeBackfillPreviewPayload;
              setPreview(result);
              setMessage(`Preview ready. Scanned ${result.appointmentsScanned}; mapped ${result.mapped}; would update ${result.wouldUpdate}.`);
            } catch (caught) {
              setPreview(null);
              setError(caught instanceof Error ? caught.message : "Calendar type backfill preview failed");
            }
          });
        }}
        type="button"
      >
        {pending ? "Checking..." : "Preview Type Backfill"}
      </button>
      {preview ? (
        <div className="mini-list">
          <span>Appointments Scanned {preview.appointmentsScanned}</span>
          <span>Mapped {preview.mapped}</span>
          <span>Would Update {preview.wouldUpdate}</span>
          <span>Already Correct {preview.alreadyCorrect}</span>
          <span>Missing Calendar Mapping {preview.missingCalendarMapping}</span>
          <span>Ambiguous Mapping {preview.ambiguousMapping}</span>
          <span>Location Mismatch {preview.locationMismatch}</span>
          <span>External Provider/User {preview.providerAudit.importedWithExternalProviderUser}</span>
          <span>Mapped Internal Provider {preview.providerAudit.mappedToInternalProvider}</span>
          <span>Still Unassigned {preview.providerAudit.stillUnassigned}</span>
        </div>
      ) : null}
      <label><span>Confirmation</span><input name="confirmation" onChange={(event) => setConfirmation(event.currentTarget.value)} placeholder="Type APPLY GHL CALENDAR TYPE BACKFILL" required value={confirmation} /></label>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
      <button className="primary-button" disabled={pending || !canApply} type="submit">
        {pending ? "Saving..." : "Apply Type Backfill"}
      </button>
    </form>
  );
}

export function GhlFullImportForm({ connectionId }: { connectionId: string }) {
  return (
    <ActionForm action={startGhlFullImportAction} submitLabel="Start Full Import" successMessage="Read-only full import queued">
      <input name="connection_id" type="hidden" value={connectionId} />
      <label><span>Confirmation</span><input name="confirmation" placeholder="Type READ ONLY IMPORT" required /></label>
    </ActionForm>
  );
}

export function GhlImportControlForms({ connectionId }: { connectionId: string }) {
  return (
    <div className="inline-actions">
      <ActionForm action={resumeGhlFullImportAction} className="inline-form" submitLabel="Resume Import" successMessage="Read-only import resumed">
        <input name="connection_id" type="hidden" value={connectionId} />
      </ActionForm>
      <ActionForm action={cancelGhlFullImportAction} className="inline-form" submitLabel="Cancel Future Pages" successMessage="Future import pages paused">
        <input name="connection_id" type="hidden" value={connectionId} />
      </ActionForm>
    </div>
  );
}

export function GhlIncrementalSyncNowForm({ connectionId }: { connectionId: string }) {
  return (
    <ActionForm action={runGhlIncrementalSyncNowAction} className="inline-form" submitLabel="Run Incremental Sync Now" successMessage="Incremental read-only sync queued">
      <input name="connection_id" type="hidden" value={connectionId} />
    </ActionForm>
  );
}

export function GhlRetryFailedRecordsForm({ connectionId, runId }: { connectionId: string; runId: string }) {
  return (
    <ActionForm action={retryGhlFailedRecordsAction} className="inline-form" submitLabel="Retry Failed Records" successMessage="Targeted failed-record retry queued">
      <input name="connection_id" type="hidden" value={connectionId} />
      <input name="run_id" type="hidden" value={runId} />
    </ActionForm>
  );
}

export function GhlExceptionActionForm({ exceptionId }: { exceptionId: string }) {
  return (
    <ActionForm action={resolveGhlExceptionAction} className="inline-form" submitLabel="Update" successMessage="Exception updated">
      <input name="exception_id" type="hidden" value={exceptionId} />
      <select name="status" defaultValue="resolved"><option value="review">Review</option><option value="resolved">Resolved</option><option value="ignored">Ignored</option></select>
      <input name="resolution_notes" placeholder="Resolution note" />
    </ActionForm>
  );
}
