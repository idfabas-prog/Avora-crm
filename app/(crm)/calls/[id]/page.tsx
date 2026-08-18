import { notFound } from "next/navigation";
import Link from "next/link";
import { CallDispositionForm, CallNoteForm } from "@/components/crm/CallForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { canReadCallRecording, canReadCallTranscript, hasCallPermission } from "@/lib/calls/permissions";
import { contactName, getCallById, personName, relationName } from "@/lib/calls/reports";
import { deterministicCallScore } from "@/lib/calls/metrics";
import { formatPhoneNumber } from "@/lib/communications/phone";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  if (!hasCallPermission(profile, "calls.read")) {
    return <div className="page-stack"><PageHeader description="Your role does not include call access." title="Call Detail" /></div>;
  }

  const call = await getCallById(supabase, profile.organizationId, id);
  if (!call) notFound();

  const [
    { data: notes },
    { data: dispositions },
    { data: recordings },
    { data: transcripts },
    { data: voicemails },
    { data: attributions }
  ] = await Promise.all([
    supabase.from("call_notes").select("id, body, created_at, author:user_profiles!call_notes_author_id_fkey(full_name)").eq("call_id", id).order("created_at", { ascending: false }),
    supabase.from("call_dispositions").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("sort_order"),
    canReadCallRecording(profile) ? supabase.from("call_recordings").select("id, provider_recording_id, duration_seconds, consent_status, recording_status, storage_bucket, storage_path, created_at").eq("call_id", id) : Promise.resolve({ data: [] }),
    canReadCallTranscript(profile) ? supabase.from("call_transcripts").select("id, transcript_text, status, language, confidence, summary_json, created_at").eq("call_id", id) : Promise.resolve({ data: [] }),
    supabase.from("voicemails").select("id, duration_seconds, transcript_text, transcript_status, created_at").eq("call_id", id),
    hasCallPermission(profile, "calls.analytics.read") ? supabase.from("call_attributions").select("id, attribution_type, revenue_cents, refund_cents, marketing_sources(name), marketing_campaigns(name)").eq("call_id", id) : Promise.resolve({ data: [] })
  ]);

  const transcript = transcripts?.[0];
  const score = transcript?.transcript_text
    ? deterministicCallScore({ transcriptText: transcript.transcript_text, disposition: call.disposition, followUpCreated: (notes ?? []).length > 0, bookedAppointment: call.metadata?.booked === true })
    : null;

  return (
    <div className="page-stack">
      <PageHeader action={<Link className="secondary-button" href="/calls">Back to Calls</Link>} description="Sensitive call details, private recording metadata, transcript foundation, and AI summary cache." title={contactName(call)} />
      <section className="profile-hero">
        <div>
          <StatusBadge status={call.status.replaceAll("_", " ")} />
          <h2>{call.direction === "inbound" ? "Inbound Call" : "Outbound Call"}</h2>
          <p>{formatPhoneNumber(call.from_number)} {"->"} {formatPhoneNumber(call.to_number)}</p>
        </div>
        <dl>
          <div><dt>Location</dt><dd>{relationName(call.locations)}</dd></div>
          <div><dt>Queue</dt><dd>{relationName(call.call_queues)}</dd></div>
          <div><dt>Handled By</dt><dd>{personName(call.handled_by ?? call.assigned_user)}</dd></div>
          <div><dt>Disposition</dt><dd>{call.disposition ?? "Not set"}</dd></div>
          <div><dt>Duration</dt><dd>{call.duration_seconds ?? 0}s</dd></div>
          <div><dt>Started</dt><dd>{call.started_at ? new Date(call.started_at).toLocaleString() : "Unknown"}</dd></div>
        </dl>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Outcome</h2><span>Human-confirmed disposition</span></div>
          {hasCallPermission(profile, "calls.manage") ? <CallDispositionForm callId={call.id} currentDisposition={call.disposition} dispositions={dispositions ?? []} /> : <p className="quiet-text">Disposition changes are restricted.</p>}
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Attribution</h2><span>Snapshot at call time</span></div>
          <div className="record-list">
            {(attributions ?? []).map((attribution) => {
              const source = Array.isArray(attribution.marketing_sources) ? attribution.marketing_sources[0] : attribution.marketing_sources;
              const campaign = Array.isArray(attribution.marketing_campaigns) ? attribution.marketing_campaigns[0] : attribution.marketing_campaigns;
              return <article key={attribution.id}><strong>{attribution.attribution_type.replaceAll("_", " ")}</strong><p>{source?.name ?? "No source"} - {campaign?.name ?? "No campaign"}</p><span>{formatMoney((attribution.revenue_cents ?? 0) - (attribution.refund_cents ?? 0))} net collected</span></article>;
            })}
            {(attributions ?? []).length === 0 ? <p className="quiet-text">No call attribution visible for this role.</p> : null}
          </div>
        </section>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Recording</h2><span>Private metadata only</span></div>
          {canReadCallRecording(profile) ? (
            <div className="record-list">
              {(recordings ?? []).map((recording) => <article key={recording.id}><strong>{recording.recording_status}</strong><p>{recording.provider_recording_id ?? "No provider recording id"} - {recording.duration_seconds ?? 0}s</p><span>{recording.storage_path ? "Private storage path configured" : "No demo audio stored"}</span></article>)}
            </div>
          ) : <p className="quiet-text">Recording metadata is restricted for this role.</p>}
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Transcript & AI</h2><span>Development demo text only</span></div>
          {canReadCallTranscript(profile) ? (
            <div className="record-list">
              {(transcripts ?? []).map((item) => <article key={item.id}><strong>{item.status}</strong><p>{item.transcript_text}</p>{score ? <span>Deterministic coaching score: {score.score}</span> : null}</article>)}
              {(voicemails ?? []).map((item) => <article key={item.id}><strong>Voicemail</strong><p>{item.transcript_text ?? "No voicemail transcript"}</p><span>{item.duration_seconds ?? 0}s</span></article>)}
            </div>
          ) : <p className="quiet-text">Transcripts are restricted for this role.</p>}
        </section>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Call Notes</h2><span>Separate from clinical notes</span></div>
        {hasCallPermission(profile, "calls.answer") ? <details><summary className="summary-action">Add Call Note</summary><CallNoteForm callId={call.id} contactId={call.contact_id} /></details> : null}
        <div className="record-list">
          {(notes ?? []).map((note) => {
            const author = Array.isArray(note.author) ? note.author[0] : note.author;
            return <article key={note.id}><strong>{author?.full_name ?? "Team member"}</strong><p>{note.body}</p><span>{new Date(note.created_at).toLocaleString()}</span></article>;
          })}
        </div>
      </section>
    </div>
  );
}
