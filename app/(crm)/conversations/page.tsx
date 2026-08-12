import Link from "next/link";
import { ConversationControls, DevelopmentSimulator, InternalNoteForm, SmsComposer } from "@/components/crm/ConversationForms";
import { AddAppointmentForm } from "@/components/crm/AppointmentForms";
import { AddTaskForm } from "@/components/crm/TaskForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatCurrency, formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { formatPhoneNumber } from "@/lib/communications/phone";
import { ConversationAiActions } from "@/components/crm/AiForms";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const item = searchParams[key];
  return Array.isArray(item) ? item[0] : item;
}

export default async function ConversationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const activeConversationId = value(params, "conversation");
  const filter = value(params, "filter") ?? "all";
  const assignedFilter = value(params, "assigned_user_id");
  const q = value(params, "q");

  let listQuery = supabase
    .from("conversations")
    .select(`
      id,
      location_id,
      contact_id,
      assigned_user_id,
      status,
      channel,
      last_message_at,
      unread_count,
      contacts(first_name, last_name, phone, email, lead_source, status, lifetime_value_cents),
      locations(name),
      assigned_user:user_profiles!conversations_assigned_user_id_fkey(full_name)
    `)
    .eq("organization_id", profile.organizationId);

  if (locationIds.length > 0) listQuery = listQuery.in("location_id", locationIds);
  if (filter === "unread") listQuery = listQuery.gt("unread_count", 0);
  if (filter === "mine") listQuery = listQuery.eq("assigned_user_id", profile.id);
  if (filter === "unassigned") listQuery = listQuery.is("assigned_user_id", null);
  if (["open", "pending", "closed"].includes(filter)) listQuery = listQuery.eq("status", filter);
  if (assignedFilter) listQuery = listQuery.eq("assigned_user_id", assignedFilter);

  const { data: conversations, error } = await listQuery.order("last_message_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);

  const activeConversation = conversations?.find((item) => item.id === activeConversationId) ?? conversations?.[0] ?? null;

  const [
    { data: messages },
    { data: rawUsers },
    { data: rawTemplates },
    { data: preference },
    { data: appointments },
    { data: opportunities },
    { data: contacts },
    { data: appointmentTypes },
    { data: aiSummaries }
  ] = await Promise.all([
    activeConversation
      ? supabase.from("messages").select("id, direction, body, status, is_internal_note, simulated, created_at, sent_at, received_at, delivered_at, failed_at, sender_user:user_profiles!messages_sender_user_id_fkey(full_name)").eq("conversation_id", activeConversation.id).order("created_at", { ascending: true }).range(0, 99)
      : Promise.resolve({ data: [] }),
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("sms_templates").select("id, name, body").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    activeConversation ? supabase.from("contact_communication_preferences").select("allowed, opted_out").eq("contact_id", activeConversation.contact_id).eq("channel", "sms").maybeSingle() : Promise.resolve({ data: null }),
    activeConversation ? supabase.from("appointments").select("id, start_at, appointment_types(name), provider:user_profiles!appointments_provider_id_fkey(full_name)").eq("contact_id", activeConversation.contact_id).gte("start_at", new Date().toISOString()).order("start_at").limit(1) : Promise.resolve({ data: [] }),
    activeConversation ? supabase.from("opportunities").select("id, name, pipeline_stages(name)").eq("contact_id", activeConversation.contact_id).order("updated_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", profile.organizationId).order("last_name"),
    supabase.from("appointment_types").select("id, name, duration_minutes").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    activeConversation ? supabase.from("ai_cached_summaries").select("summary_type, content_json, generated_at").eq("organization_id", profile.organizationId).eq("entity_type", "conversation").eq("entity_id", activeConversation.id) : Promise.resolve({ data: [] })
  ]);

  const filteredConversations = q
    ? (conversations ?? []).filter((conversation) => {
        const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
        return `${contact?.first_name ?? ""} ${contact?.last_name ?? ""} ${contact?.phone ?? ""}`.toLowerCase().includes(q.toLowerCase());
      })
    : conversations ?? [];
  const userOptions = (rawUsers ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const templateOptions = (rawTemplates ?? []).map((template) => ({ id: template.id, name: template.name, body: template.body }));
  const contactOptions = (contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }));
  const locationOptions = profile.locations.map((location) => ({ id: location.id, name: location.name }));
  const appointmentTypeOptions = (appointmentTypes ?? []).map((type) => ({ id: type.id, name: type.name, duration_minutes: type.duration_minutes }));
  const opportunityOptions = (opportunities ?? []).map((opportunity) => ({ id: opportunity.id, name: opportunity.name }));
  const activeContact = activeConversation ? (Array.isArray(activeConversation.contacts) ? activeConversation.contacts[0] : activeConversation.contacts) : null;
  const activeLocation = activeConversation ? (Array.isArray(activeConversation.locations) ? activeConversation.locations[0] : activeConversation.locations) : null;
  const activeAssigned = activeConversation ? (Array.isArray(activeConversation.assigned_user) ? activeConversation.assigned_user[0] : activeConversation.assigned_user) : null;

  return (
    <div className="page-stack">
      <PageHeader description="Unified SMS inbox with development-safe sending, templates, assignment, unread state, and contact context." title="Conversations" />
      <form className="query-toolbar">
        <input className="search-input" defaultValue={q ?? ""} name="q" placeholder="Search contacts or phone" />
        <select defaultValue={filter} name="filter">
          {["all", "unread", "mine", "unassigned", "open", "pending", "closed"].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select defaultValue={assignedFilter ?? ""} name="assigned_user_id"><option value="">All assigned</option>{userOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <button type="submit">Apply</button>
      </form>
      <section className="conversations-layout">
        <aside className="conversation-list">
          {filteredConversations.map((conversation) => {
            const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
            const location = Array.isArray(conversation.locations) ? conversation.locations[0] : conversation.locations;
            const assigned = Array.isArray(conversation.assigned_user) ? conversation.assigned_user[0] : conversation.assigned_user;
            return (
              <Link className={activeConversation?.id === conversation.id ? "conversation-list-item active" : "conversation-list-item"} href={`/conversations?conversation=${conversation.id}`} key={conversation.id}>
                <strong>{contact ? `${contact.first_name} ${contact.last_name}` : "Unknown contact"}</strong>
                <span>{formatPhoneNumber(contact?.phone)} · {location?.name ?? "No location"}</span>
                <span>{assigned?.full_name ?? "Unassigned"} · {formatDateTime(conversation.last_message_at)}</span>
                <div><StatusBadge status={conversation.status} />{conversation.unread_count > 0 ? <b>{conversation.unread_count}</b> : null}</div>
              </Link>
            );
          })}
        </aside>
        <main className="conversation-thread">
          {activeConversation && activeContact ? (
            <>
              <div className="conversation-header">
                <div><h2>{activeContact.first_name} {activeContact.last_name}</h2><p>{formatPhoneNumber(activeContact.phone)} · {activeLocation?.name ?? "No location"}</p></div>
                <ConversationControls assignedUserId={activeConversation.assigned_user_id} conversationId={activeConversation.id} users={userOptions} />
              </div>
              <div className="message-thread">
                {(messages ?? []).map((message) => {
                  const sender = Array.isArray(message.sender_user) ? message.sender_user[0] : message.sender_user;
                  return (
                    <article className={message.is_internal_note ? "message-bubble note" : `message-bubble ${message.direction}`} key={message.id}>
                      <p>{message.body}</p>
                      <span>{message.is_internal_note ? `Internal note · ${sender?.full_name ?? "Staff"}` : message.status}{message.simulated ? " · simulated" : ""} · {formatDateTime(message.created_at)}</span>
                    </article>
                  );
                })}
              </div>
              <SmsComposer conversationId={activeConversation.id} optedOut={Boolean(preference?.opted_out || preference?.allowed === false)} templates={templateOptions} />
              <InternalNoteForm conversationId={activeConversation.id} />
              <DevelopmentSimulator conversationId={activeConversation.id} />
              <ConversationAiActions conversationId={activeConversation.id} summaries={aiSummaries ?? []} />
            </>
          ) : <p className="quiet-text">No conversations found.</p>}
        </main>
        <aside className="conversation-detail">
          {activeConversation && activeContact ? (
            <>
              <h2>Contact Context</h2>
              <dl>
                <div><dt>Name</dt><dd>{activeContact.first_name} {activeContact.last_name}</dd></div>
                <div><dt>Phone</dt><dd>{formatPhoneNumber(activeContact.phone)}</dd></div>
                <div><dt>Email</dt><dd>{activeContact.email ?? "No email"}</dd></div>
                <div><dt>Assigned</dt><dd>{activeAssigned?.full_name ?? "Unassigned"}</dd></div>
                <div><dt>Lead Source</dt><dd>{activeContact.lead_source ?? "—"}</dd></div>
                <div><dt>Status</dt><dd>{fromDbStatus(activeContact.status)}</dd></div>
                <div><dt>Lifetime Value</dt><dd>{formatCurrency(activeContact.lifetime_value_cents)}</dd></div>
                <div><dt>SMS</dt><dd>{preference?.opted_out ? "Opted out" : "Allowed"}</dd></div>
              </dl>
              <Link className="primary-button" href={`/contacts/${activeConversation.contact_id}`}>Open Contact</Link>
              <details><summary className="summary-action">Create Task</summary><AddTaskForm contactId={activeConversation.contact_id} contacts={contactOptions} locations={locationOptions} opportunities={opportunityOptions} users={userOptions} /></details>
              <details><summary className="summary-action">Create Appointment</summary><AddAppointmentForm appointmentTypes={appointmentTypeOptions} contacts={contactOptions} locations={locationOptions} providers={userOptions} /></details>
              <div className="record-list">
                {(appointments ?? []).map((appointment) => {
                  const type = Array.isArray(appointment.appointment_types) ? appointment.appointment_types[0] : appointment.appointment_types;
                  return <article key={appointment.id}><strong>Upcoming Appointment</strong><p>{type?.name ?? "Appointment"} · {formatDateTime(appointment.start_at)}</p></article>;
                })}
                {(opportunities ?? []).map((opportunity) => {
                  const stage = Array.isArray(opportunity.pipeline_stages) ? opportunity.pipeline_stages[0] : opportunity.pipeline_stages;
                  return <article key={opportunity.id}><strong>Opportunity</strong><p>{opportunity.name} · {stage?.name ?? "No stage"}</p></article>;
                })}
              </div>
            </>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
