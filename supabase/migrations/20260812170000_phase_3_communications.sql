insert into public.permissions (key, description)
values
  ('conversations.read', 'Read conversations and messages'),
  ('conversations.write', 'Update conversations and internal notes'),
  ('conversations.assign', 'Assign conversations'),
  ('messages.send', 'Send outbound messages'),
  ('templates.read', 'Read SMS templates'),
  ('templates.write', 'Create and update SMS templates'),
  ('calls.read', 'Read communication call records'),
  ('communications.settings.manage', 'Manage communication settings')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'conversations.read',
  'conversations.write',
  'conversations.assign',
  'messages.send',
  'templates.read',
  'templates.write',
  'calls.read',
  'communications.settings.manage'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'conversations.read',
  'conversations.write',
  'conversations.assign',
  'messages.send',
  'templates.read',
  'calls.read'
)
where r.name in ('manager', 'salesperson')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('conversations.read', 'conversations.write', 'templates.read', 'calls.read')
where r.name = 'provider'
on conflict do nothing;

create table public.contact_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel text not null default 'sms',
  allowed boolean not null default true,
  opted_out boolean not null default false,
  opt_out_at timestamptz,
  opt_in_at timestamptz,
  consent_source text,
  consent_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, channel)
);

create table public.communication_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  provider text not null default 'twilio',
  phone_number text not null,
  friendly_name text,
  messaging_service_sid text,
  supports_sms boolean not null default true,
  supports_voice boolean not null default false,
  active boolean not null default true,
  is_primary boolean not null default false,
  is_test_number boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, phone_number)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  status text not null default 'open',
  channel text not null default 'sms',
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sender_user_id uuid references public.user_profiles(id) on delete set null,
  direction text not null,
  channel text not null default 'sms',
  from_address text,
  to_address text,
  body text not null,
  provider text not null default 'development',
  provider_message_id text,
  status text not null default 'queued',
  error_code text,
  error_message text,
  is_internal_note boolean not null default false,
  simulated boolean not null default false,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  received_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index messages_provider_message_id_unique_idx
on public.messages(provider, provider_message_id)
where provider_message_id is not null;

create table public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  name text not null,
  category text not null,
  body text not null,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, name)
);

create table public.communication_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  messaging_enabled boolean not null default false,
  missed_call_text_back_enabled boolean not null default false,
  appointment_confirmation_enabled boolean not null default false,
  reminder_24h_enabled boolean not null default false,
  reminder_1h_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id)
);

create table public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  template_id uuid references public.sms_templates(id) on delete set null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  message_body text not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  provider text not null default 'twilio',
  provider_call_sid text unique,
  direction text not null,
  from_number text,
  to_number text,
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  status text not null default 'initiated',
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  recording_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.communication_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  event_type text not null,
  provider_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_type, provider_event_id)
);

create index contact_comm_prefs_contact_id_idx on public.contact_communication_preferences(contact_id);
create index communication_numbers_location_id_idx on public.communication_numbers(location_id);
create index conversations_org_location_idx on public.conversations(organization_id, location_id);
create index conversations_contact_id_idx on public.conversations(contact_id);
create index conversations_assigned_user_id_idx on public.conversations(assigned_user_id);
create index conversations_last_message_at_idx on public.conversations(last_message_at desc);
create index messages_conversation_id_created_idx on public.messages(conversation_id, created_at desc);
create index messages_contact_id_idx on public.messages(contact_id);
create index messages_body_search_idx on public.messages using gin(to_tsvector('english', body));
create index sms_templates_org_location_idx on public.sms_templates(organization_id, location_id);
create index scheduled_messages_status_time_idx on public.scheduled_messages(status, scheduled_for);
create index calls_org_location_idx on public.calls(organization_id, location_id);
create index calls_contact_id_idx on public.calls(contact_id);
create index webhook_events_provider_idx on public.communication_webhook_events(provider, event_type, provider_event_id);

create trigger contact_comm_prefs_set_updated_at before update on public.contact_communication_preferences for each row execute function public.set_updated_at();
create trigger communication_numbers_set_updated_at before update on public.communication_numbers for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations for each row execute function public.set_updated_at();
create trigger messages_set_updated_at before update on public.messages for each row execute function public.set_updated_at();
create trigger sms_templates_set_updated_at before update on public.sms_templates for each row execute function public.set_updated_at();
create trigger communication_settings_set_updated_at before update on public.communication_settings for each row execute function public.set_updated_at();
create trigger scheduled_messages_set_updated_at before update on public.scheduled_messages for each row execute function public.set_updated_at();
create trigger calls_set_updated_at before update on public.calls for each row execute function public.set_updated_at();

alter table public.contact_communication_preferences enable row level security;
alter table public.communication_numbers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.sms_templates enable row level security;
alter table public.communication_settings enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.calls enable row level security;
alter table public.communication_webhook_events enable row level security;

create policy "tenant communication preferences access" on public.contact_communication_preferences for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.write'));

create policy "tenant communication numbers read" on public.communication_numbers for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.read'));
create policy "tenant communication numbers manage" on public.communication_numbers for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('communications.settings.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('communications.settings.manage'));

create policy "tenant conversations access" on public.conversations for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.write'));

create policy "tenant messages access" on public.messages for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.read'))
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('messages.send') or public.has_permission('conversations.write')));

create policy "tenant sms templates read" on public.sms_templates for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('templates.read'));
create policy "tenant sms templates manage" on public.sms_templates for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('templates.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('templates.write'));

create policy "tenant communication settings read" on public.communication_settings for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.read'));
create policy "tenant communication settings manage" on public.communication_settings for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('communications.settings.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('communications.settings.manage'));

create policy "tenant scheduled messages read" on public.scheduled_messages for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.read'));
create policy "tenant scheduled messages manage" on public.scheduled_messages for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('messages.send'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('messages.send'));

create policy "tenant calls read" on public.calls for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read'));
create policy "tenant calls manage" on public.calls for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('conversations.write'));
