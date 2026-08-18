insert into public.permissions (key, description)
values
  ('calls.read', 'Read call records and call-center activity'),
  ('calls.make', 'Create simulated outbound call records'),
  ('calls.answer', 'Answer and handle inbound queue calls'),
  ('calls.manage', 'Manage call records, assignments, and dispositions'),
  ('calls.queues.read', 'Read call queues and queue performance'),
  ('calls.queues.manage', 'Manage call queues and queue members'),
  ('calls.recordings.read', 'Read private call recording metadata'),
  ('calls.transcripts.read', 'Read private call transcripts'),
  ('calls.ai_summary', 'Generate AI call summaries and coaching'),
  ('calls.analytics.read', 'Read call-center analytics'),
  ('calls.settings.manage', 'Manage call-center settings'),
  ('calls.dispositions.manage', 'Manage call dispositions'),
  ('calls.scripts.manage', 'Manage call scripts')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on (
  r.name in ('owner', 'administrator')
  or (r.name = 'manager' and p.key in (
    'calls.read',
    'calls.make',
    'calls.answer',
    'calls.manage',
    'calls.queues.read',
    'calls.queues.manage',
    'calls.recordings.read',
    'calls.transcripts.read',
    'calls.ai_summary',
    'calls.analytics.read',
    'calls.settings.manage',
    'calls.dispositions.manage',
    'calls.scripts.manage'
  ))
  or (r.name = 'salesperson' and p.key in (
    'calls.read',
    'calls.make',
    'calls.answer',
    'calls.queues.read',
    'calls.ai_summary'
  ))
  or (r.name = 'provider' and p.key in ('calls.read'))
)
on conflict do nothing;

alter table public.communication_numbers
  add column if not exists external_phone_number_id text,
  add column if not exists is_tracking_number boolean not null default false,
  add column if not exists source_id uuid references public.marketing_sources(id) on delete set null,
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null;

create unique index if not exists communication_numbers_provider_external_phone_number_idx
on public.communication_numbers(provider, external_phone_number_id)
where external_phone_number_id is not null;

alter table public.calls
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null,
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  add column if not exists marketing_source_id uuid references public.marketing_sources(id) on delete set null,
  add column if not exists provider_call_id text,
  add column if not exists disposition text,
  add column if not exists disposition_id uuid,
  add column if not exists ring_duration_seconds integer,
  add column if not exists handled_by_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists queue_id uuid,
  add column if not exists recording_id uuid,
  add column if not exists voicemail_id uuid,
  add column if not exists transcript_status text,
  add column if not exists simulated boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.calls
set provider_call_id = provider_call_sid
where provider_call_id is null
  and provider_call_sid is not null;

create unique index if not exists calls_provider_call_id_idx
on public.calls(provider, provider_call_id)
where provider_call_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calls_direction_check' and conrelid = 'public.calls'::regclass) then
    alter table public.calls
      add constraint calls_direction_check
      check (direction in ('inbound', 'outbound'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'calls_status_check' and conrelid = 'public.calls'::regclass) then
    alter table public.calls
      add constraint calls_status_check
      check (status in ('initiated', 'queued', 'ringing', 'answered', 'completed', 'missed', 'failed', 'busy', 'no_answer', 'voicemail', 'cancelled'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'calls_transcript_status_check' and conrelid = 'public.calls'::regclass) then
    alter table public.calls
      add constraint calls_transcript_status_check
      check (transcript_status is null or transcript_status in ('not_requested', 'pending', 'available', 'failed', 'restricted'));
  end if;
end $$;

create table if not exists public.call_dispositions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'general',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.call_queues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  description text,
  strategy text not null default 'round_robin' check (strategy in ('round_robin', 'longest_idle', 'simultaneous', 'priority_order', 'manual_assignment')),
  active boolean not null default true,
  max_wait_seconds integer check (max_wait_seconds is null or max_wait_seconds > 0),
  voicemail_enabled boolean not null default true,
  overflow_queue_id uuid references public.call_queues(id) on delete set null,
  after_hours_mode text not null default 'voicemail' check (after_hours_mode in ('voicemail', 'overflow', 'closed_message')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.call_queue_members (
  queue_id uuid not null references public.call_queues(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  priority integer not null default 100,
  active boolean not null default true,
  available boolean not null default true,
  last_offered_at timestamptz,
  last_answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (queue_id, user_id)
);

create table if not exists public.call_queue_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  queue_id uuid not null references public.call_queues(id) on delete cascade,
  event_type text not null check (event_type in ('entered_queue', 'offered', 'accepted', 'declined', 'timed_out', 'overflowed', 'voicemail')),
  user_id uuid references public.user_profiles(id) on delete set null,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.missed_call_callbacks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  call_id uuid not null references public.calls(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_to uuid references public.user_profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'assigned', 'called_back', 'connected', 'booked', 'closed')),
  priority integer not null default 50 check (priority >= 0),
  last_follow_up_at timestamptz,
  due_at timestamptz,
  task_id uuid references public.tasks(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (call_id)
);

create unique index if not exists missed_call_callbacks_idempotency_idx
on public.missed_call_callbacks(organization_id, idempotency_key)
where idempotency_key is not null;

create table if not exists public.voicemails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  call_id uuid not null references public.calls(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  provider_voicemail_id text,
  storage_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  transcript_text text,
  transcript_status text not null default 'pending' check (transcript_status in ('not_requested', 'pending', 'available', 'failed', 'restricted')),
  simulated boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists voicemails_provider_voicemail_id_idx
on public.voicemails(organization_id, provider_voicemail_id)
where provider_voicemail_id is not null;

create table if not exists public.call_recording_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  recording_enabled boolean not null default false,
  consent_mode text not null default 'not_configured' check (consent_mode in ('not_configured', 'one_party', 'two_party', 'announcement')),
  announcement_required boolean not null default true,
  retention_days integer check (retention_days is null or retention_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id)
);

create unique index if not exists call_recording_settings_org_default_idx
on public.call_recording_settings(organization_id)
where location_id is null;

create table if not exists public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  provider_recording_id text,
  storage_bucket text,
  storage_path text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  consent_status text not null default 'not_recorded' check (consent_status in ('not_recorded', 'pending', 'announced', 'consented', 'restricted')),
  recording_status text not null default 'pending' check (recording_status in ('pending', 'available', 'failed', 'deleted', 'restricted')),
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_recordings_provider_recording_id_idx
on public.call_recordings(organization_id, provider_recording_id)
where provider_recording_id is not null;

create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  recording_id uuid references public.call_recordings(id) on delete set null,
  transcript_text text not null,
  language text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  provider text not null default 'development',
  status text not null default 'available' check (status in ('pending', 'available', 'failed', 'restricted')),
  summary_json jsonb not null default '{}'::jsonb,
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_transcripts_call_provider_idx
on public.call_transcripts(call_id, provider);

create table if not exists public.call_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  source_id uuid references public.marketing_sources(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  attribution_type text not null check (attribution_type in ('tracking_number', 'booking', 'sale', 'manual')),
  revenue_cents integer not null default 0 check (revenue_cents >= 0),
  refund_cents integer not null default 0 check (refund_cents >= 0),
  created_at timestamptz not null default now(),
  unique (call_id, attribution_type)
);

create table if not exists public.call_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  segment_id uuid references public.segments(id) on delete set null,
  static boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  require_disposition boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.call_list_members (
  call_list_id uuid not null references public.call_lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  order_index integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'called', 'connected', 'no_answer', 'skipped', 'completed')),
  last_call_id uuid references public.calls(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (call_list_id, contact_id)
);

create table if not exists public.call_scripts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'general',
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.call_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  author_id uuid references public.user_profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.call_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  call_id uuid references public.calls(id) on delete set null,
  payload_hash text not null,
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calls_disposition_id_fkey' and conrelid = 'public.calls'::regclass) then
    alter table public.calls
      add constraint calls_disposition_id_fkey
      foreign key (disposition_id) references public.call_dispositions(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'calls_queue_id_fkey' and conrelid = 'public.calls'::regclass) then
    alter table public.calls
      add constraint calls_queue_id_fkey
      foreign key (queue_id) references public.call_queues(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'calls_recording_id_fkey' and conrelid = 'public.calls'::regclass) then
    alter table public.calls
      add constraint calls_recording_id_fkey
      foreign key (recording_id) references public.call_recordings(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'calls_voicemail_id_fkey' and conrelid = 'public.calls'::regclass) then
    alter table public.calls
      add constraint calls_voicemail_id_fkey
      foreign key (voicemail_id) references public.voicemails(id) on delete set null;
  end if;
end $$;

create index if not exists calls_started_at_idx on public.calls(started_at desc);
create index if not exists calls_status_idx on public.calls(status);
create index if not exists calls_direction_idx on public.calls(direction);
create index if not exists calls_assigned_user_idx on public.calls(assigned_user_id);
create index if not exists calls_handled_by_user_idx on public.calls(handled_by_user_id);
create index if not exists calls_campaign_idx on public.calls(campaign_id);
create index if not exists calls_marketing_source_idx on public.calls(marketing_source_id);
create index if not exists call_queue_events_call_idx on public.call_queue_events(call_id, event_at);
create index if not exists missed_call_callbacks_status_due_idx on public.missed_call_callbacks(status, due_at);
create index if not exists call_attributions_sale_idx on public.call_attributions(sale_id);
create index if not exists call_list_members_status_idx on public.call_list_members(call_list_id, status, order_index);
create index if not exists call_notes_call_created_idx on public.call_notes(call_id, created_at desc);
create index if not exists call_webhook_events_call_idx on public.call_webhook_events(call_id);

create trigger call_dispositions_set_updated_at before update on public.call_dispositions for each row execute function public.set_updated_at();
create trigger call_queues_set_updated_at before update on public.call_queues for each row execute function public.set_updated_at();
create trigger call_queue_members_set_updated_at before update on public.call_queue_members for each row execute function public.set_updated_at();
create trigger missed_call_callbacks_set_updated_at before update on public.missed_call_callbacks for each row execute function public.set_updated_at();
create trigger call_recording_settings_set_updated_at before update on public.call_recording_settings for each row execute function public.set_updated_at();
create trigger call_recordings_set_updated_at before update on public.call_recordings for each row execute function public.set_updated_at();
create trigger call_transcripts_set_updated_at before update on public.call_transcripts for each row execute function public.set_updated_at();
create trigger call_lists_set_updated_at before update on public.call_lists for each row execute function public.set_updated_at();
create trigger call_list_members_set_updated_at before update on public.call_list_members for each row execute function public.set_updated_at();
create trigger call_scripts_set_updated_at before update on public.call_scripts for each row execute function public.set_updated_at();

create or replace function public.call_location_allowed(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_location_id is null
    or exists (
      select 1
      from public.user_locations ul
      where ul.user_id = auth.uid()
        and ul.location_id = target_location_id
    );
$$;

create or replace function public.is_missed_call(
  call_direction text,
  call_status text,
  answered_at timestamptz,
  queue_timed_out boolean default false,
  after_hours boolean default false
)
returns boolean
language sql
immutable
as $$
  select call_direction = 'inbound'
    and (
      call_status in ('missed', 'no_answer', 'voicemail')
      or (answered_at is null and call_status in ('completed', 'cancelled'))
      or queue_timed_out
      or after_hours
    );
$$;

create or replace function public.call_net_revenue_cents(target_call_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(revenue_cents - refund_cents), 0)::integer
  from public.call_attributions
  where call_id = target_call_id;
$$;

alter table public.call_dispositions enable row level security;
alter table public.call_queues enable row level security;
alter table public.call_queue_members enable row level security;
alter table public.call_queue_events enable row level security;
alter table public.missed_call_callbacks enable row level security;
alter table public.voicemails enable row level security;
alter table public.call_recording_settings enable row level security;
alter table public.call_recordings enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.call_attributions enable row level security;
alter table public.call_lists enable row level security;
alter table public.call_list_members enable row level security;
alter table public.call_scripts enable row level security;
alter table public.call_notes enable row level security;
alter table public.call_webhook_events enable row level security;

drop policy if exists "tenant calls read" on public.calls;
drop policy if exists "tenant calls manage" on public.calls;

create policy "tenant calls read" on public.calls for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('calls.read')
  and public.call_location_allowed(location_id)
);
create policy "tenant calls create" on public.calls for insert
with check (
  organization_id in (select public.current_organization_ids())
  and (public.has_permission('calls.make') or public.has_permission('calls.answer') or public.has_permission('calls.manage'))
  and public.call_location_allowed(location_id)
);
create policy "tenant calls update" on public.calls for update
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('calls.manage')
  and public.call_location_allowed(location_id)
)
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('calls.manage')
  and public.call_location_allowed(location_id)
);

create policy "tenant call dispositions read" on public.call_dispositions for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read'));
create policy "tenant call dispositions manage" on public.call_dispositions for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.dispositions.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.dispositions.manage'));

create policy "tenant call queues read" on public.call_queues for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.queues.read') and public.call_location_allowed(location_id));
create policy "tenant call queues manage" on public.call_queues for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.queues.manage') and public.call_location_allowed(location_id))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.queues.manage') and public.call_location_allowed(location_id));

create policy "tenant queue members read" on public.call_queue_members for select
using (exists (select 1 from public.call_queues cq where cq.id = queue_id and cq.organization_id in (select public.current_organization_ids()) and public.has_permission('calls.queues.read') and public.call_location_allowed(cq.location_id)));
create policy "tenant queue members manage" on public.call_queue_members for all
using (exists (select 1 from public.call_queues cq where cq.id = queue_id and cq.organization_id in (select public.current_organization_ids()) and public.has_permission('calls.queues.manage') and public.call_location_allowed(cq.location_id)))
with check (exists (select 1 from public.call_queues cq where cq.id = queue_id and cq.organization_id in (select public.current_organization_ids()) and public.has_permission('calls.queues.manage') and public.call_location_allowed(cq.location_id)));

create policy "tenant queue events read" on public.call_queue_events for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.queues.read') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));
create policy "tenant queue events manage" on public.call_queue_events for insert
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('calls.answer') or public.has_permission('calls.manage')) and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));

create policy "tenant missed callbacks read" on public.missed_call_callbacks for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read') and public.call_location_allowed(location_id));
create policy "tenant missed callbacks manage" on public.missed_call_callbacks for all
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('calls.answer') or public.has_permission('calls.manage')) and public.call_location_allowed(location_id))
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('calls.answer') or public.has_permission('calls.manage')) and public.call_location_allowed(location_id));

create policy "tenant voicemails read" on public.voicemails for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read') and public.call_location_allowed(location_id));
create policy "tenant voicemails manage" on public.voicemails for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage') and public.call_location_allowed(location_id));

create policy "tenant recording settings read" on public.call_recording_settings for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read') and public.call_location_allowed(location_id));
create policy "tenant recording settings manage" on public.call_recording_settings for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.settings.manage') and public.call_location_allowed(location_id))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.settings.manage') and public.call_location_allowed(location_id));

create policy "tenant recordings read private" on public.call_recordings for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.recordings.read') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));
create policy "tenant recordings manage" on public.call_recordings for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));

create policy "tenant transcripts read private" on public.call_transcripts for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.transcripts.read') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));
create policy "tenant transcripts manage" on public.call_transcripts for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));

create policy "tenant call attributions read" on public.call_attributions for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.analytics.read') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));
create policy "tenant call attributions manage" on public.call_attributions for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));

create policy "tenant call lists read" on public.call_lists for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read'));
create policy "tenant call lists manage" on public.call_lists for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage'));

create policy "tenant call list members read" on public.call_list_members for select
using (exists (select 1 from public.call_lists cl where cl.id = call_list_id and cl.organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read')));
create policy "tenant call list members manage" on public.call_list_members for all
using (exists (select 1 from public.call_lists cl where cl.id = call_list_id and cl.organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage')))
with check (exists (select 1 from public.call_lists cl where cl.id = call_list_id and cl.organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage')));

create policy "tenant call scripts read" on public.call_scripts for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read'));
create policy "tenant call scripts manage" on public.call_scripts for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.scripts.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.scripts.manage'));

create policy "tenant call notes read" on public.call_notes for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.read') and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));
create policy "tenant call notes manage" on public.call_notes for insert
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('calls.answer') or public.has_permission('calls.manage')) and exists (select 1 from public.calls c where c.id = call_id and public.call_location_allowed(c.location_id)));

create policy "tenant webhook events read" on public.call_webhook_events for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage'));
create policy "tenant webhook events manage" on public.call_webhook_events for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('calls.manage'));
