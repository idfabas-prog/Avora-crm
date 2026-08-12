import { notFound } from "next/navigation";
import { AddAppointmentForm, AppointmentStatusActions } from "@/components/crm/AppointmentForms";
import { EditContactForm } from "@/components/crm/ContactForms";
import { NoteForm } from "@/components/crm/NoteForm";
import { AddTaskForm, TaskStatusForm } from "@/components/crm/TaskForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatCurrency, formatDate, formatDateTime, formatTime, fromDbStatus } from "@/lib/crm/constants";
import { formatPhoneNumber } from "@/lib/communications/phone";
import { formatMoney } from "@/lib/financial/money";
import { getFinancialSummary } from "@/lib/financial/queries";

const tabs = ["Timeline", "Messages", "Appointments", "Opportunities", "Notes", "Tasks", "Sales", "Treatments", "Files"];

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
    { data: smsPreference },
    { data: sales },
    { data: payments },
    { data: refunds },
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
    supabase.from("contact_communication_preferences").select("allowed, opted_out, opt_out_at").eq("contact_id", id).eq("channel", "sms").maybeSingle(),
    supabase.from("sales").select("id, sale_date, status, total_amount_cents, paid_amount_cents, balance_due_cents, currency, sale_items(description)").eq("contact_id", id).order("sale_date", { ascending: false }),
    supabase.from("payments").select("id, amount_cents, currency, payment_method, payment_provider, status, received_at, simulated").eq("contact_id", id).order("received_at", { ascending: false }),
    supabase.from("refunds").select("id, amount_cents, status, reason, refunded_at").eq("contact_id", id).order("refunded_at", { ascending: false }),
    getFinancialSummary(supabase, { organizationId: profile.organizationId, locationIds: profile.locations.map((item) => item.id), contactId: id })
  ]);

  const location = Array.isArray(contact.locations) ? contact.locations[0] : contact.locations;
  const assigned = Array.isArray(contact.user_profiles) ? contact.user_profiles[0] : contact.user_profiles;
  const userOptions = (users ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const locationOptions = profile.locations.map((item) => ({ id: item.id, name: item.name }));
  const contactOptions = (allContacts ?? []).map((item) => ({ id: item.id, name: `${item.first_name} ${item.last_name}` }));
  const opportunityOptions = (allOpportunities ?? []).map((item) => ({ id: item.id, name: item.name }));
  const appointmentTypeOptions = (appointmentTypes ?? []).map((item) => ({ id: item.id, name: item.name, duration_minutes: item.duration_minutes }));

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
            <h2>Prepared for Later</h2>
            <p className="quiet-text">Treatments and files remain structured placeholders for future phases.</p>
          </section>
        </div>
      </section>
    </div>
  );
}
