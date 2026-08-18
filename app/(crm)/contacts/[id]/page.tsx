import { notFound } from "next/navigation";
import Link from "next/link";
import { AddAppointmentForm, AppointmentStatusActions } from "@/components/crm/AppointmentForms";
import { EditContactForm } from "@/components/crm/ContactForms";
import { NoteForm } from "@/components/crm/NoteForm";
import { AddTaskForm, TaskStatusForm } from "@/components/crm/TaskForms";
import { ManualEnrollmentForm, StopEnrollmentForm } from "@/components/crm/WorkflowForms";
import { ClinicalDocumentMetadataForm, ClinicalNoteActions, ClinicalNoteForm, ClinicalPhotoMetadataForm, EntitlementAdjustmentForm, TreatmentPlanForm, TreatmentSessionForm } from "@/components/crm/ClinicalForms";
import { AttributionCorrectionForm, ContactAttributionForm } from "@/components/crm/MarketingForms";
import { MembershipEnrollmentForm, PatientPortalDisableForm, PatientPortalInviteForm, PaymentPlanForm } from "@/components/crm/PortalForms";
import { ClickToCallForm } from "@/components/crm/CallForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasCallPermission } from "@/lib/calls/permissions";
import { hasClinicalPermission } from "@/lib/clinical/permissions";
import { formatCurrency, formatDate, formatDateTime, formatTime, fromDbStatus } from "@/lib/crm/constants";
import { formatPhoneNumber } from "@/lib/communications/phone";
import { formatMoney } from "@/lib/financial/money";
import { getFinancialSummary } from "@/lib/financial/queries";
import { hasWorkflowPermission } from "@/lib/workflows/permissions";
import { hasMarketingPermission } from "@/lib/marketing/permissions";
import { hasCampaignPermission } from "@/lib/campaigns/permissions";
import { hasPortalPermission } from "@/lib/portal/permissions";
import { statusLabels } from "@/lib/workflows/constants";
import { AiSummaryList, ContactAiActions, LeadScoreCards } from "@/components/crm/AiForms";

const tabs = ["Timeline", "Messages", "Calls", "Appointments", "Opportunities", "Notes", "Tasks", "Sales", "Workflows", "Treatments", "Files"];

export default async function ContactProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  const { data: contact, error } = await supabase
    .from("contacts")
    .select(`
      id, organization_id, location_id, assigned_to, first_name, last_name, phone, email, lead_source, status, lifetime_value_cents, last_activity_at, created_at,
      locations(name),
      user_profiles(full_name)
    `)
    .eq("id", id)
    .eq("organization_id", profile.organizationId)
    .single();

  if (error || !contact) {
    notFound();
  }

  const canViewClinical = hasClinicalPermission(profile, "clinical.read");
  const canWriteClinical = hasClinicalPermission(profile, "clinical.write");
  const canReadClinicalNotes = hasClinicalPermission(profile, "clinical.notes.read");
  const canManageEntitlements = hasClinicalPermission(profile, "clinical.entitlements.adjust");
  const canViewMarketing = hasMarketingPermission(profile, "marketing.attribution.read");
  const canManageMarketing = hasMarketingPermission(profile, "marketing.attribution.manage");
  const canViewCampaigns = hasCampaignPermission(profile, "campaigns.recipients.read");
  const canViewCalls = hasCallPermission(profile, "calls.read");
  const canViewPortal = hasPortalPermission(profile, "portal.read");
  const canManagePortal = hasPortalPermission(profile, "portal.manage");
  const canManageMemberships = hasPortalPermission(profile, "memberships.manage");
  const canManagePaymentPlans = hasPortalPermission(profile, "payment_plans.manage");

  const [
    { data: users },
    { data: notes },
    { data: opportunities },
    { data: appointments },
    { data: tasks },
    { data: appointmentTypes },
    { data: auditLogs },
    { data: allContacts },
    { data: allOpportunities },
    { data: conversations },
    { data: messages },
    { data: callHistory },
    { data: smsPreference },
    { data: sales },
    { data: payments },
    { data: refunds },
    { data: workflows },
    { data: workflowEnrollments },
    { data: leadScores },
    { data: aiSummaries },
    { data: clinicalProfiles },
    { data: packageEntitlements },
    { data: treatmentPlans },
    { data: treatmentPlanItems },
    { data: treatmentSessions },
    { data: clinicalNotes },
    { data: clinicalAddenda },
    { data: consentRecords },
    { data: clinicalPhotos },
    { data: clinicalDocuments },
    { data: treatmentFollowups },
    { data: clinicalServices },
    { data: marketingAttributions },
    { data: marketingSources },
    { data: marketingCampaigns },
    { data: lifecycleCampaignRecipients },
    { data: patientAccounts },
    { data: membershipPlans },
    { data: patientMemberships },
    { data: paymentPlans },
    financialSummary
  ] = await Promise.all([
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("contact_notes").select("id, body, created_at, user_profiles(full_name)").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("opportunities").select("id, name, value_cents, status, last_activity_at, pipeline_stages(name)").eq("contact_id", id).order("updated_at", { ascending: false }),
    supabase.from("appointments").select("id, start_at, end_at, status, notes, appointment_types(id, name, duration_minutes), provider:user_profiles!appointments_provider_id_fkey(full_name), created_by_user:user_profiles!appointments_created_by_fkey(full_name), locations(name)").eq("contact_id", id).order("start_at", { ascending: false }),
    supabase.from("tasks").select("id, title, status, due_at, user_profiles(full_name)").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("appointment_types").select("id, name, duration_minutes").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    supabase.from("audit_logs").select("id, action, entity_table, entity_id, created_at, metadata").eq("organization_id", profile.organizationId).or(`entity_id.eq.${id},metadata->>contact_id.eq.${id}`).order("created_at", { ascending: false }).limit(30),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", profile.organizationId).order("last_name"),
    supabase.from("opportunities").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("conversations").select("id, status, last_message_at, unread_count").eq("contact_id", id).order("last_message_at", { ascending: false }),
    supabase.from("messages").select("id, conversation_id, direction, body, status, simulated, is_internal_note, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(20),
    canViewCalls ? supabase.from("calls").select("id, direction, status, disposition, started_at, duration_seconds, recording_id, transcript_status, handled_by:user_profiles!calls_handled_by_user_id_fkey(full_name), call_queues(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("started_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    supabase.from("contact_communication_preferences").select("allowed, opted_out, opt_out_at").eq("contact_id", id).eq("channel", "sms").maybeSingle(),
    supabase.from("sales").select("id, sale_date, status, total_amount_cents, paid_amount_cents, balance_due_cents, currency, sale_items(description)").eq("contact_id", id).order("sale_date", { ascending: false }),
    supabase.from("payments").select("id, amount_cents, currency, payment_method, payment_provider, status, received_at, simulated").eq("contact_id", id).order("received_at", { ascending: false }),
    supabase.from("refunds").select("id, amount_cents, status, reason, refunded_at").eq("contact_id", id).order("refunded_at", { ascending: false }),
    supabase.from("workflows").select("id, name").eq("organization_id", profile.organizationId).eq("status", "active").order("name"),
    supabase.from("workflow_enrollments").select("id, status, current_node_id, enrolled_at, completed_at, stopped_at, stop_reason, workflows(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(25),
    supabase.from("lead_scores").select("id, score, label, factors_json, calculated_at").eq("contact_id", id).eq("organization_id", profile.organizationId).order("calculated_at", { ascending: false }).limit(1),
    supabase.from("ai_cached_summaries").select("summary_type, content_json, generated_at").eq("organization_id", profile.organizationId).eq("entity_type", "contact").eq("entity_id", id),
    canViewClinical ? supabase.from("clinical_profiles").select("id, clinical_status, primary_location_id, locations(name)").eq("contact_id", id).eq("organization_id", profile.organizationId) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.entitlements.read") ? supabase.from("package_entitlements").select("id, location_id, service_id, package_id, total_quantity, used_quantity, remaining_quantity, status, purchased_at, services(name), packages(name), locations(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.treatment_plans.read") ? supabase.from("treatment_plans").select("id, location_id, provider_id, name, description, status, start_date, target_completion_date, completed_at, provider:user_profiles!treatment_plans_provider_id_fkey(full_name), locations(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.treatment_plans.read") ? supabase.from("treatment_plan_items").select("id, treatment_plan_id, service_id, package_entitlement_id, planned_sessions, completed_sessions, interval_days, notes, services(name)").in("treatment_plan_id", ["00000000-0000-0000-0000-000000000000"]) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.sessions.read") ? supabase.from("treatment_sessions").select("id, location_id, treatment_plan_id, treatment_plan_item_id, package_entitlement_id, service_id, provider_id, status, documentation_status, scheduled_at, completed_at, session_number, treatment_area, services(name), locations(name), provider:user_profiles!treatment_sessions_provider_id_fkey(full_name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("scheduled_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canReadClinicalNotes ? supabase.from("clinical_notes").select("id, note_type, body, locked_at, signed_at, created_at, author:user_profiles!clinical_notes_author_user_id_fkey(full_name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canReadClinicalNotes ? supabase.from("clinical_note_addenda").select("id, clinical_note_id, addendum_text, created_at, author:user_profiles!clinical_note_addenda_author_user_id_fkey(full_name)").eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.consents.read") ? supabase.from("consent_records").select("id, status, signed_by_name, signed_at, consent_templates(name, version, consent_type)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.photos.read") ? supabase.from("clinical_photos").select("id, photo_type, body_area, capture_date, storage_path, notes, services(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("capture_date", { ascending: false }) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.documents.read") ? supabase.from("clinical_documents").select("id, document_type, filename, storage_path, uploaded_at, description, status").eq("contact_id", id).eq("organization_id", profile.organizationId).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [] }),
    hasClinicalPermission(profile, "clinical.sessions.read") ? supabase.from("treatment_followups").select("id, status, due_at, followup_type, notes, treatment_session_id").eq("contact_id", id).eq("organization_id", profile.organizationId).order("due_at", { ascending: true }) : Promise.resolve({ data: [] }),
    canViewClinical ? supabase.from("services").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name") : Promise.resolve({ data: [] }),
    canViewMarketing ? supabase.from("contact_attributions").select("id, source_id, campaign_id, attribution_type, utm_source, utm_medium, utm_campaign, landing_page, referrer, captured_at, is_primary, marketing_sources(name), marketing_campaigns(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("captured_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canViewMarketing ? supabase.from("marketing_sources").select("id, name").eq("organization_id", profile.organizationId).order("name") : Promise.resolve({ data: [] }),
    canViewMarketing ? supabase.from("marketing_campaigns").select("id, name").eq("organization_id", profile.organizationId).order("name") : Promise.resolve({ data: [] }),
    canViewCampaigns ? supabase.from("campaign_recipients").select("id, campaign_id, status, eligibility_status, exclusion_reason, scheduled_send_at, sent_at, delivered_at, replied_at, booked_at, sold_at, revenue_cents, campaigns(name, campaign_type), campaign_variants(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    canViewPortal ? supabase.from("patient_accounts").select("id, status, invited_at, activated_at, last_login_at").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canViewPortal ? supabase.from("membership_plans").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name") : Promise.resolve({ data: [] }),
    canViewPortal ? supabase.from("patient_memberships").select("id, status, start_date, next_billing_date, membership_plans(name)").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canViewPortal ? supabase.from("payment_plans").select("id, sale_id, status, total_amount_cents, next_due_date").eq("contact_id", id).eq("organization_id", profile.organizationId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    getFinancialSummary(supabase, { organizationId: profile.organizationId, locationIds: profile.locations.map((item) => item.id), contactId: id })
  ]);

  const location = Array.isArray(contact.locations) ? contact.locations[0] : contact.locations;
  const assigned = Array.isArray(contact.user_profiles) ? contact.user_profiles[0] : contact.user_profiles;
  const userOptions = (users ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const locationOptions = profile.locations.map((item) => ({ id: item.id, name: item.name }));
  const contactOptions = (allContacts ?? []).map((item) => ({ id: item.id, name: `${item.first_name} ${item.last_name}` }));
  const opportunityOptions = (allOpportunities ?? []).map((item) => ({ id: item.id, name: item.name }));
  const appointmentTypeOptions = (appointmentTypes ?? []).map((item) => ({ id: item.id, name: item.name, duration_minutes: item.duration_minutes }));
  const workflowOptions = (workflows ?? []).map((workflow) => ({ id: workflow.id, name: workflow.name }));
  const clinicalServiceOptions = (clinicalServices ?? []).map((service) => ({ id: service.id, name: service.name }));
  const entitlementOptions = (packageEntitlements ?? []).map((entitlement) => {
    const service = Array.isArray(entitlement.services) ? entitlement.services[0] : entitlement.services;
    const pack = Array.isArray(entitlement.packages) ? entitlement.packages[0] : entitlement.packages;
    return { id: entitlement.id, name: `${service?.name ?? pack?.name ?? "Entitlement"} (${entitlement.remaining_quantity}/${entitlement.total_quantity} remaining)` };
  });
  const planOptions = (treatmentPlans ?? []).map((plan) => ({ id: plan.id, name: plan.name }));
  const planItemOptions = (treatmentPlanItems ?? []).map((item) => {
    const service = Array.isArray(item.services) ? item.services[0] : item.services;
    return { id: item.id, name: `${service?.name ?? "Plan item"} (${item.completed_sessions}/${item.planned_sessions})` };
  });
  const marketingSourceOptions = (marketingSources ?? []).map((source) => ({ id: source.id, name: source.name }));
  const marketingCampaignOptions = (marketingCampaigns ?? []).map((campaign) => ({ id: campaign.id, name: campaign.name }));
  const membershipPlanOptions = (membershipPlans ?? []).map((plan) => ({ id: plan.id, name: plan.name }));
  const paymentPlanSaleOptions = (sales ?? []).filter((sale) => sale.balance_due_cents > 0).map((sale) => ({ id: sale.id, name: `${formatMoney(sale.balance_due_cents, sale.currency)} balance · ${formatDate(sale.sale_date)}`, balanceCents: sale.balance_due_cents }));
  const patientAccount = patientAccounts?.[0];
  const primaryAttribution = (marketingAttributions ?? []).find((item) => item.is_primary);
  const firstTouch = [...(marketingAttributions ?? [])].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())[0];
  const lastTouch = marketingAttributions?.[0];

  return (
    <div className="page-stack">
      <PageHeader description="Live contact record with related activity, notes, appointments, opportunities, and tasks." title={`${contact.first_name} ${contact.last_name}`} />
      <section className="profile-hero">
        <div>
          <StatusBadge status={fromDbStatus(contact.status)} />
          <h2>{contact.first_name} {contact.last_name}</h2>
          <p>{formatPhoneNumber(contact.phone)} · {contact.email ?? "No email"}</p>
        </div>
        <dl>
          <div><dt>Location</dt><dd>{location?.name ?? "Unassigned"}</dd></div>
          <div><dt>Assigned</dt><dd>{assigned?.full_name ?? "Unassigned"}</dd></div>
          <div><dt>Lead Source</dt><dd>{contact.lead_source ?? "—"}</dd></div>
          <div><dt>Net Collected LTV</dt><dd>{formatMoney(financialSummary.netCollectedCents)}</dd></div>
          <div><dt>Created</dt><dd>{formatDate(contact.created_at)}</dd></div>
        </dl>
      </section>
      <details className="panel">
        <summary className="summary-action">Edit Contact</summary>
        <EditContactForm
          contact={{
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            phone: contact.phone,
            email: contact.email,
            location_id: contact.location_id,
            lead_source: contact.lead_source,
            assigned_to: contact.assigned_to,
            status: fromDbStatus(contact.status)
          }}
          locations={locationOptions}
          users={userOptions}
        />
      </details>
      <section className="panel">
        <div className="panel-header"><h2>AI Summary</h2><ContactAiActions contactId={contact.id} /></div>
        <LeadScoreCards scores={leadScores ?? []} />
        <AiSummaryList context="contact" summaries={aiSummaries ?? []} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Marketing Attribution</h2><span>Primary, first touch, and last touch</span></div>
        {canViewMarketing ? (
          <div className="dashboard-grid">
            <div className="record-list">
              {[
                { label: "Primary Lead Source", attribution: primaryAttribution },
                { label: "First Touch", attribution: firstTouch },
                { label: "Last Touch", attribution: lastTouch }
              ].map(({ label, attribution }) => {
                const item = attribution;
                const source = item ? (Array.isArray(item.marketing_sources) ? item.marketing_sources[0] : item.marketing_sources) : null;
                const campaign = item ? (Array.isArray(item.marketing_campaigns) ? item.marketing_campaigns[0] : item.marketing_campaigns) : null;
                return (
                  <article key={String(label)}>
                    <strong>{label}</strong>
                    <p>{source?.name ?? "Unknown"} · {campaign?.name ?? "No campaign"}</p>
                    <span>{item ? `${fromDbStatus(item.attribution_type)} · ${formatDateTime(item.captured_at)}` : "No attribution captured"}</span>
                    {item?.landing_page ? <span>{item.landing_page}</span> : null}
                  </article>
                );
              })}
            </div>
            <div className="record-list">
              {canManageMarketing ? (
                <details>
                  <summary className="summary-action">Add Attribution Event</summary>
                  <ContactAttributionForm campaigns={marketingCampaignOptions} contactId={contact.id} sources={marketingSourceOptions} />
                </details>
              ) : null}
              {(marketingAttributions ?? []).map((attribution) => {
                const source = Array.isArray(attribution.marketing_sources) ? attribution.marketing_sources[0] : attribution.marketing_sources;
                const campaign = Array.isArray(attribution.marketing_campaigns) ? attribution.marketing_campaigns[0] : attribution.marketing_campaigns;
                return (
                  <article key={attribution.id}>
                    <strong>{source?.name ?? "Unknown"} · {campaign?.name ?? "No campaign"}</strong>
                    <p>{fromDbStatus(attribution.attribution_type)} · {formatDateTime(attribution.captured_at)}{attribution.is_primary ? " · primary" : ""}</p>
                    <span>{[attribution.utm_source, attribution.utm_medium, attribution.utm_campaign].filter(Boolean).join(" / ") || "No UTM values"}</span>
                    {canManageMarketing ? <details><summary className="summary-action">Correct</summary><AttributionCorrectionForm campaigns={marketingCampaignOptions} oldAttributionId={attribution.id} sources={marketingSourceOptions} /></details> : null}
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="quiet-text">Marketing attribution details are restricted for this role.</p>
        )}
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Lifecycle Campaign History</h2><span>Recipient snapshots, skips, and simulated sends</span></div>
        {canViewCampaigns ? (
          <div className="record-list">
            {(lifecycleCampaignRecipients ?? []).map((recipient) => {
              const campaign = Array.isArray(recipient.campaigns) ? recipient.campaigns[0] : recipient.campaigns;
              const variant = Array.isArray(recipient.campaign_variants) ? recipient.campaign_variants[0] : recipient.campaign_variants;
              return (
                <article key={recipient.id}>
                  <strong>{campaign?.name ?? "Lifecycle campaign"}</strong>
                  <p>{fromDbStatus(recipient.status)} - {fromDbStatus(recipient.eligibility_status)}{variant?.name ? ` - ${variant.name}` : ""}</p>
                  <span>{recipient.exclusion_reason ?? "No exclusion"} - sent {recipient.sent_at ? formatDateTime(recipient.sent_at) : "not sent"} - revenue {formatMoney(recipient.revenue_cents ?? 0)}</span>
                  <Link className="strong-link" href={`/marketing/campaigns/${recipient.campaign_id}`}>Open campaign</Link>
                </article>
              );
            })}
            {lifecycleCampaignRecipients?.length ? null : <p className="quiet-text">No lifecycle campaign recipient snapshots are recorded for this contact.</p>}
          </div>
        ) : (
          <p className="quiet-text">Lifecycle campaign history is restricted for this role.</p>
        )}
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Patient Portal</h2><span>Portal access, memberships, and payment plans</span></div>
        {canViewPortal ? (
          <div className="dashboard-grid">
            <div className="record-list">
              <article>
                <strong>Portal Status</strong>
                <p>{patientAccount ? fromDbStatus(patientAccount.status) : "Not invited"}</p>
                <span>
                  {patientAccount?.last_login_at
                    ? `Last login ${formatDateTime(patientAccount.last_login_at)}`
                    : patientAccount?.invited_at
                      ? `Invited ${formatDateTime(patientAccount.invited_at)}`
                      : "No patient portal account has been created."}
                </span>
                {canManagePortal ? (
                  <div className="toolbar">
                    <PatientPortalInviteForm contactId={contact.id} />
                    {patientAccount ? <PatientPortalDisableForm accountId={patientAccount.id} contactId={contact.id} /> : null}
                  </div>
                ) : null}
              </article>
              {(patientMemberships ?? []).map((membership) => {
                const plan = Array.isArray(membership.membership_plans) ? membership.membership_plans[0] : membership.membership_plans;
                return <article key={membership.id}><strong>{plan?.name ?? "Membership"}</strong><p>{fromDbStatus(membership.status)}</p><span>Started {formatDate(membership.start_date)}{membership.next_billing_date ? ` · Next billing ${formatDate(membership.next_billing_date)}` : ""}</span></article>;
              })}
              {(paymentPlans ?? []).map((plan) => <article key={plan.id}><strong>{formatMoney(plan.total_amount_cents)} payment plan</strong><p>{fromDbStatus(plan.status)}</p><span>{plan.next_due_date ? `Next due ${formatDate(plan.next_due_date)}` : "No next due date"}</span></article>)}
            </div>
            <div className="record-list">
              {canManageMemberships ? (
                <details>
                  <summary className="summary-action">Enroll Membership</summary>
                  <MembershipEnrollmentForm contactId={contact.id} plans={membershipPlanOptions} />
                </details>
              ) : null}
              {canManagePaymentPlans && paymentPlanSaleOptions.length > 0 ? (
                <details>
                  <summary className="summary-action">Create Payment Plan</summary>
                  <PaymentPlanForm sales={paymentPlanSaleOptions} />
                </details>
              ) : null}
              <article>
                <strong>Patient Privacy</strong>
                <p>Portal access is separated from staff CRM access and does not expose commissions, royalties, staff notes, workflow internals, or private clinical notes.</p>
              </article>
            </div>
          </div>
        ) : (
          <p className="quiet-text">Patient portal details are restricted for this role.</p>
        )}
      </section>
      <section className="panel">
        <div className="tabs">{tabs.map((tab, index) => <button className={index === 0 ? "active" : undefined} key={tab} type="button">{tab}</button>)}</div>
        <div className="profile-grid">
          <section>
            <h2>Timeline</h2>
            <div className="timeline">
              <article><span /><div><strong>Contact Created</strong><p>{formatDateTime(contact.created_at)}</p></div></article>
              {(messages ?? []).slice(0, 8).map((message) => <article key={message.id}><span /><div><strong>{message.is_internal_note ? "Internal Note" : message.direction === "inbound" ? "Inbound SMS" : "Outbound SMS"}</strong><p>{formatDateTime(message.created_at)} · {message.status}{message.simulated ? " · simulated" : ""}</p></div></article>)}
              {(auditLogs ?? []).map((log) => <article key={log.id}><span /><div><strong>{log.action}</strong><p>{formatDateTime(log.created_at)} · {log.entity_table}</p></div></article>)}
            </div>
          </section>
          <section>
            <h2>Messages</h2>
            <p className={smsPreference?.opted_out ? "form-error" : "quiet-text"}>{smsPreference?.opted_out ? `SMS opted out ${formatDateTime(smsPreference.opt_out_at)}` : "SMS is available when consent and location configuration allow it."}</p>
            <div className="record-list">
              {(conversations ?? []).map((conversation) => <article key={conversation.id}><strong>Conversation</strong><p>{conversation.status} · {formatDateTime(conversation.last_message_at)} · {conversation.unread_count} unread</p><a className="strong-link" href={`/conversations?conversation=${conversation.id}`}>Open conversation</a></article>)}
              {(messages ?? []).map((message) => <article key={message.id}><strong>{message.is_internal_note ? "Internal note" : message.direction === "inbound" ? "Inbound SMS" : "Outbound SMS"}</strong><p>{message.body}</p><span>{message.status}{message.simulated ? " · simulated" : ""} · {formatDateTime(message.created_at)}</span></article>)}
            </div>
          </section>
          <section>
            <h2>Calls</h2>
            {canViewCalls ? (
              <>
                {hasCallPermission(profile, "calls.make") ? (
                  <details>
                    <summary className="summary-action">Call Contact</summary>
                    <ClickToCallForm contacts={[{ id: contact.id, name: `${contact.first_name} ${contact.last_name}`, phone: contact.phone }]} defaultContactId={contact.id} defaultPhone={contact.phone} locations={locationOptions} />
                  </details>
                ) : null}
                <div className="record-list">
                  {(callHistory ?? []).map((call) => {
                    const handledBy = Array.isArray(call.handled_by) ? call.handled_by[0] : call.handled_by;
                    const queue = Array.isArray(call.call_queues) ? call.call_queues[0] : call.call_queues;
                    return (
                      <article key={call.id}>
                        <strong>{call.direction === "inbound" ? "Inbound Call" : "Outbound Call"}</strong>
                        <p>{formatDateTime(call.started_at)} - {fromDbStatus(call.status)} - {call.duration_seconds ?? 0}s</p>
                        <span>{call.disposition ?? "No disposition"} - {handledBy?.full_name ?? "Unassigned"}{queue?.name ? ` - ${queue.name}` : ""}{call.recording_id ? " - recording" : ""}{call.transcript_status === "available" ? " - transcript" : ""}</span>
                        <Link className="strong-link" href={`/calls/${call.id}`}>Open call</Link>
                      </article>
                    );
                  })}
                  {callHistory?.length ? null : <p className="quiet-text">No call history is recorded for this contact yet.</p>}
                </div>
              </>
            ) : (
              <p className="quiet-text">Call history is restricted for this role.</p>
            )}
          </section>
          <section>
            <h2>Notes</h2>
            <NoteForm contactId={contact.id} />
            <div className="record-list">
              {(notes ?? []).map((note) => {
                const author = Array.isArray(note.user_profiles) ? note.user_profiles[0] : note.user_profiles;
                return <article key={note.id}><strong>{author?.full_name ?? "Unknown author"}</strong><p>{note.body}</p><span>{formatDateTime(note.created_at)}</span></article>;
              })}
            </div>
          </section>
          <section>
            <h2>Appointments</h2>
            <AddAppointmentForm appointmentTypes={appointmentTypeOptions} contacts={contactOptions} locations={locationOptions} providers={userOptions} />
            <div className="record-list">
              {(appointments ?? []).map((appointment) => {
                const type = Array.isArray(appointment.appointment_types) ? appointment.appointment_types[0] : appointment.appointment_types;
                const provider = Array.isArray(appointment.provider) ? appointment.provider[0] : appointment.provider;
                return <article key={appointment.id}><strong>{type?.name ?? "Appointment"}</strong><p>{formatDateTime(appointment.start_at)} - {formatTime(appointment.end_at)} · {provider?.full_name ?? "Unassigned"}</p><StatusBadge status={fromDbStatus(appointment.status)} /><AppointmentStatusActions appointmentId={appointment.id} /></article>;
              })}
            </div>
          </section>
          <section>
            <h2>Opportunities</h2>
            <div className="record-list">
              {(opportunities ?? []).map((opportunity) => {
                const stage = Array.isArray(opportunity.pipeline_stages) ? opportunity.pipeline_stages[0] : opportunity.pipeline_stages;
                return <article key={opportunity.id}><strong>{opportunity.name}</strong><p>{formatCurrency(opportunity.value_cents)} · {stage?.name ?? opportunity.status}</p><span>{formatDateTime(opportunity.last_activity_at)}</span></article>;
              })}
            </div>
          </section>
          <section>
            <h2>Sales</h2>
            <div className="placeholder-metrics compact">
              <div><strong>{formatMoney(financialSummary.grossSalesCents)}</strong><span>Gross Sales</span></div>
              <div><strong>{formatMoney(financialSummary.collectedCents)}</strong><span>Collected</span></div>
              <div><strong>{formatMoney(financialSummary.refundedCents)}</strong><span>Refunded</span></div>
              <div><strong>{formatMoney(financialSummary.outstandingCents)}</strong><span>Balance</span></div>
            </div>
            <div className="record-list">
              {(sales ?? []).map((sale) => <article key={sale.id}><strong>{formatMoney(sale.total_amount_cents, sale.currency)} sale</strong><p>{formatDateTime(sale.sale_date)} · {fromDbStatus(sale.status)} · balance {formatMoney(sale.balance_due_cents, sale.currency)}</p><span>{(sale.sale_items ?? []).map((item) => item.description).join(", ")}</span></article>)}
              {(payments ?? []).map((payment) => <article key={payment.id}><strong>{formatMoney(payment.amount_cents, payment.currency)} payment</strong><p>{formatDateTime(payment.received_at)} · {fromDbStatus(payment.payment_method)} · {payment.payment_provider}{payment.simulated ? " · simulated" : ""}</p><StatusBadge status={fromDbStatus(payment.status)} /></article>)}
              {(refunds ?? []).map((refund) => <article key={refund.id}><strong>{formatMoney(refund.amount_cents)} refund</strong><p>{formatDateTime(refund.refunded_at)} · {refund.reason ?? "No reason"}</p><StatusBadge status={fromDbStatus(refund.status)} /></article>)}
            </div>
          </section>
          <section>
            <h2>Tasks</h2>
            <AddTaskForm contactId={contact.id} contacts={contactOptions} locations={locationOptions} opportunities={opportunityOptions} users={userOptions} />
            <div className="record-list">
              {(tasks ?? []).map((task) => {
                const owner = Array.isArray(task.user_profiles) ? task.user_profiles[0] : task.user_profiles;
                return <article key={task.id}><strong>{task.title}</strong><p>{owner?.full_name ?? "Unassigned"} · Due {formatDateTime(task.due_at)}</p><TaskStatusForm currentStatus={fromDbStatus(task.status)} taskId={task.id} /></article>;
              })}
            </div>
          </section>
          <section>
            <h2>Workflows</h2>
            {hasWorkflowPermission(profile, "workflows.enroll") ? (
              <div className="record-list">
                {workflowOptions.map((workflow) => (
                  <details key={workflow.id}>
                    <summary className="summary-action">Enroll in {workflow.name}</summary>
                    <ManualEnrollmentForm contacts={[{ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }]} workflowId={workflow.id} />
                  </details>
                ))}
              </div>
            ) : null}
            <div className="record-list">
              {(workflowEnrollments ?? []).map((enrollment) => {
                const workflow = Array.isArray(enrollment.workflows) ? enrollment.workflows[0] : enrollment.workflows;
                return (
                  <article key={enrollment.id}>
                    <strong>{workflow?.name ?? "Workflow"}</strong>
                    <p>{statusLabels[String(enrollment.status)] ?? enrollment.status} Â· current step {enrollment.current_node_id ?? "not started"}</p>
                    <span>Enrolled {formatDateTime(enrollment.enrolled_at)}</span>
                    {["active", "waiting", "failed"].includes(String(enrollment.status)) && hasWorkflowPermission(profile, "workflows.stop") ? (
                      <details><summary className="summary-action">Stop Enrollment</summary><StopEnrollmentForm enrollmentId={enrollment.id} /></details>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
          <section>
            <h2>Treatments</h2>
            {canViewClinical ? (
              <>
                <div className="clinical-kpi-grid">
                  <article className="settings-card"><strong>{(clinicalProfiles ?? []).length}</strong><span>Clinical Profiles</span></article>
                  <article className="settings-card"><strong>{(treatmentPlans ?? []).length}</strong><span>Treatment Plans</span></article>
                  <article className="settings-card"><strong>{(treatmentSessions ?? []).length}</strong><span>Sessions</span></article>
                  <article className="settings-card"><strong>{(packageEntitlements ?? []).reduce((sum, item) => sum + Number(item.remaining_quantity ?? 0), 0)}</strong><span>Remaining Units</span></article>
                </div>
                {canWriteClinical ? (
                  <div className="record-list">
                    <details>
                      <summary className="summary-action">Create Treatment Plan</summary>
                      <TreatmentPlanForm contactId={contact.id} entitlements={entitlementOptions} locations={locationOptions} providers={userOptions} services={clinicalServiceOptions} />
                    </details>
                    <details>
                      <summary className="summary-action">Create Treatment Session</summary>
                      <TreatmentSessionForm contactId={contact.id} entitlements={entitlementOptions} locations={locationOptions} planItems={planItemOptions} plans={planOptions} providers={userOptions} services={clinicalServiceOptions} />
                    </details>
                  </div>
                ) : null}
                <div className="record-list">
                  {(packageEntitlements ?? []).map((entitlement) => {
                    const service = Array.isArray(entitlement.services) ? entitlement.services[0] : entitlement.services;
                    const pack = Array.isArray(entitlement.packages) ? entitlement.packages[0] : entitlement.packages;
                    const location = Array.isArray(entitlement.locations) ? entitlement.locations[0] : entitlement.locations;
                    const total = Number(entitlement.total_quantity ?? 0);
                    const used = Number(entitlement.used_quantity ?? 0);
                    const percent = total ? Math.round((used / total) * 100) : 0;
                    return (
                      <article key={entitlement.id}>
                        <strong>{service?.name ?? pack?.name ?? "Package Entitlement"}</strong>
                        <p>{location?.name ?? "Unassigned"} · {used}/{total} used · {entitlement.remaining_quantity} remaining</p>
                        <div className="entitlement-meter"><span style={{ width: `${percent}%` }} /></div>
                        {canManageEntitlements ? <EntitlementAdjustmentForm entitlementId={entitlement.id} /> : null}
                      </article>
                    );
                  })}
                  {(treatmentPlans ?? []).map((plan) => {
                    const provider = Array.isArray(plan.provider) ? plan.provider[0] : plan.provider;
                    return <article key={plan.id}><strong>{plan.name}</strong><p>{fromDbStatus(plan.status)} · Provider {provider?.full_name ?? "Unassigned"} · Started {formatDate(plan.start_date)}</p><span>{plan.description ?? "No description"}</span></article>;
                  })}
                  {(treatmentSessions ?? []).map((session) => {
                    const service = Array.isArray(session.services) ? session.services[0] : session.services;
                    const provider = Array.isArray(session.provider) ? session.provider[0] : session.provider;
                    return <article key={session.id}><strong>{service?.name ?? "Treatment Session"}</strong><p>{formatDateTime(session.scheduled_at)} · {provider?.full_name ?? "Unassigned"} · {session.treatment_area ?? "Area not set"}</p><StatusBadge status={fromDbStatus(session.status)} /><a className="strong-link" href={`/clinical/sessions/${session.id}`}>Open clinical session</a></article>;
                  })}
                </div>
              </>
            ) : (
              <p className="quiet-text">Clinical details are restricted for this role.</p>
            )}
          </section>
          <section>
            <h2>Clinical Notes</h2>
            {canReadClinicalNotes ? (
              <>
                {hasClinicalPermission(profile, "clinical.notes.write") ? <ClinicalNoteForm contactId={contact.id} locationId={contact.location_id} /> : null}
                <div className="record-list">
                  {(clinicalNotes ?? []).map((note) => {
                    const author = Array.isArray(note.author) ? note.author[0] : note.author;
                    const noteAddenda = (clinicalAddenda ?? []).filter((addendum) => addendum.clinical_note_id === note.id);
                    return (
                      <article key={note.id}>
                        <strong>{fromDbStatus(note.note_type)} · {author?.full_name ?? "Unknown"}</strong>
                        <p>{note.body}</p>
                        <span>{formatDateTime(note.created_at)} · {note.locked_at ? `Signed ${formatDateTime(note.signed_at)}` : "Draft"}</span>
                        {hasClinicalPermission(profile, "clinical.notes.sign") || hasClinicalPermission(profile, "clinical.notes.write") ? <ClinicalNoteActions locked={Boolean(note.locked_at)} noteId={note.id} /> : null}
                        {noteAddenda.map((addendum) => <p className="quiet-text" key={addendum.id}>Addendum {formatDateTime(addendum.created_at)}: {addendum.addendum_text}</p>)}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="quiet-text">Clinical notes are restricted for this role.</p>
            )}
          </section>
          <section>
            <h2>Files</h2>
            {canViewClinical ? (
              <>
                <div className="record-list">
                  {hasClinicalPermission(profile, "clinical.photos.write") ? (
                    <details>
                      <summary className="summary-action">Add Photo Metadata</summary>
                      <ClinicalPhotoMetadataForm contactId={contact.id} locationId={contact.location_id} services={clinicalServiceOptions} />
                    </details>
                  ) : null}
                  {hasClinicalPermission(profile, "clinical.documents.write") ? (
                    <details>
                      <summary className="summary-action">Add Document Metadata</summary>
                      <ClinicalDocumentMetadataForm contactId={contact.id} locationId={contact.location_id} />
                    </details>
                  ) : null}
                </div>
                <div className="photo-timeline">
                  {(clinicalPhotos ?? []).map((photo) => {
                    const service = Array.isArray(photo.services) ? photo.services[0] : photo.services;
                    return <article className="settings-card" key={photo.id}><strong>{fromDbStatus(photo.photo_type)}</strong><p>{service?.name ?? "Service"} · {photo.body_area ?? "Area not set"}</p><span>{formatDate(photo.capture_date)} · {photo.storage_path}</span></article>;
                  })}
                </div>
                <div className="record-list">
                  {(clinicalDocuments ?? []).map((document) => <article key={document.id}><strong>{document.filename}</strong><p>{fromDbStatus(document.document_type)} · {fromDbStatus(document.status)}</p><span>{document.storage_path}</span></article>)}
                  {(consentRecords ?? []).map((consent) => {
                    const template = Array.isArray(consent.consent_templates) ? consent.consent_templates[0] : consent.consent_templates;
                    return <article key={consent.id}><strong>{template?.name ?? "Consent"}</strong><p>{fromDbStatus(consent.status)} · version {template?.version ?? 1}</p><span>{consent.signed_at ? `Signed ${formatDate(consent.signed_at)}` : "Pending"}</span></article>;
                  })}
                  {(treatmentFollowups ?? []).map((followup) => <article key={followup.id}><strong>{fromDbStatus(followup.followup_type)}</strong><p>Due {formatDateTime(followup.due_at)} · {fromDbStatus(followup.status)}</p><span>{followup.notes ?? "No notes"}</span></article>)}
                </div>
              </>
            ) : (
              <p className="quiet-text">Clinical files are restricted for this role.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
