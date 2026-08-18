insert into public.permissions (key, description)
values
  ('campaigns.read', 'Read lifecycle campaigns and campaign dashboards'),
  ('campaigns.create', 'Create draft lifecycle campaigns'),
  ('campaigns.edit', 'Edit draft and paused lifecycle campaigns'),
  ('campaigns.approve', 'Approve lifecycle campaign launches'),
  ('campaigns.launch', 'Launch or schedule lifecycle campaigns'),
  ('campaigns.pause', 'Pause lifecycle campaigns'),
  ('campaigns.cancel', 'Cancel lifecycle campaigns'),
  ('campaigns.recipients.read', 'Read lifecycle campaign recipients'),
  ('campaigns.analytics.read', 'Read lifecycle campaign analytics'),
  ('segments.read', 'Read patient and lead segments'),
  ('segments.manage', 'Create and manage patient and lead segments'),
  ('suppression.read', 'Read suppression lists'),
  ('suppression.manage', 'Manage suppression list membership'),
  ('campaigns.settings.manage', 'Manage lifecycle campaign safety settings')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'campaigns.read',
  'campaigns.create',
  'campaigns.edit',
  'campaigns.approve',
  'campaigns.launch',
  'campaigns.pause',
  'campaigns.cancel',
  'campaigns.recipients.read',
  'campaigns.analytics.read',
  'segments.read',
  'segments.manage',
  'suppression.read',
  'suppression.manage',
  'campaigns.settings.manage'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'campaigns.read',
  'campaigns.create',
  'campaigns.edit',
  'campaigns.pause',
  'campaigns.cancel',
  'campaigns.recipients.read',
  'campaigns.analytics.read',
  'segments.read',
  'segments.manage',
  'suppression.read'
)
where r.name = 'manager'
on conflict do nothing;

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  segment_type text not null default 'dynamic' check (segment_type in ('dynamic', 'static')),
  rules_json jsonb not null default '{"logic":"and","conditions":[]}'::jsonb,
  location_scope jsonb not null default '{"mode":"all_allowed","location_ids":[]}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.segment_members (
  segment_id uuid not null references public.segments(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  added_by uuid references public.user_profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (segment_id, contact_id)
);

create index segment_members_contact_idx on public.segment_members (contact_id);

create table public.suppression_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  suppression_type text not null default 'campaign_exclusion' check (suppression_type in ('global_sms', 'do_not_contact', 'legal_hold', 'internal_test', 'campaign_exclusion')),
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.suppression_list_members (
  suppression_list_id uuid not null references public.suppression_lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  reason text not null,
  added_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (suppression_list_id, contact_id)
);

create index suppression_list_members_contact_idx on public.suppression_list_members (contact_id);

create table public.campaign_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  max_sms_per_minute integer not null default 50 check (max_sms_per_minute > 0),
  max_sms_per_hour integer not null default 500 check (max_sms_per_hour > 0),
  daily_contact_frequency_cap integer not null default 2 check (daily_contact_frequency_cap >= 0),
  weekly_contact_frequency_cap integer not null default 5 check (weekly_contact_frequency_cap >= 0),
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '20:00',
  quiet_hours_end time not null default '09:00',
  weekends_enabled boolean not null default true,
  booking_attribution_window_days integer not null default 7 check (booking_attribution_window_days > 0),
  sale_attribution_window_days integer not null default 30 check (sale_attribution_window_days > 0),
  approval_required boolean not null default true,
  max_recipients_per_campaign integer not null default 5000 check (max_recipients_per_campaign > 0),
  simulation_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  campaign_type text not null check (campaign_type in ('bulk_message', 'workflow_enrollment', 'reactivation', 'announcement', 'promotion', 'reminder', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  segment_id uuid references public.segments(id) on delete set null,
  workflow_id uuid references public.workflows(id) on delete set null,
  channel text not null default 'sms' check (channel in ('sms', 'workflow', 'email', 'internal')),
  message_classification text not null default 'marketing' check (message_classification in ('transactional', 'marketing', 'operational', 'review_request', 'reactivation', 'campaign')),
  scheduled_at timestamptz,
  recurrence_rule text,
  location_scope jsonb not null default '{"mode":"all_allowed","location_ids":[]}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  approved_by uuid references public.user_profiles(id) on delete set null,
  approved_at timestamptz,
  launched_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index campaigns_org_status_idx on public.campaigns (organization_id, status, scheduled_at);
create index campaigns_segment_idx on public.campaigns (segment_id);
create index campaigns_workflow_idx on public.campaigns (workflow_id);

create table public.campaign_variants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  message_body text,
  sms_template_id uuid references public.sms_templates(id) on delete set null,
  weight_percent integer not null default 100 check (weight_percent >= 0 and weight_percent <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (message_body is not null or sms_template_id is not null),
  unique (campaign_id, name)
);

create table public.campaign_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  run_number integer not null check (run_number > 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  recipients_total integer not null default 0 check (recipients_total >= 0),
  recipients_eligible integer not null default 0 check (recipients_eligible >= 0),
  recipients_skipped integer not null default 0 check (recipients_skipped >= 0),
  sent integer not null default 0 check (sent >= 0),
  failed integer not null default 0 check (failed >= 0),
  replied integer not null default 0 check (replied >= 0),
  booked integer not null default 0 check (booked >= 0),
  sold integer not null default 0 check (sold >= 0),
  collected_revenue_cents integer not null default 0 check (collected_revenue_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (campaign_id, run_number)
);

create index campaign_runs_org_status_idx on public.campaign_runs (organization_id, status, started_at desc);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_run_id uuid references public.campaign_runs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  variant_id uuid references public.campaign_variants(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'sent', 'delivered', 'replied', 'converted', 'failed', 'skipped', 'cancelled')),
  eligibility_status text not null default 'pending' check (eligibility_status in ('pending', 'eligible', 'opted_out', 'suppressed', 'frequency_capped', 'invalid_phone', 'unauthorized_location', 'quiet_hours_deferred', 'campaign_inactive', 'contact_fatigue')),
  exclusion_reason text,
  scheduled_send_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  replied_at timestamptz,
  booked_at timestamptz,
  sold_at timestamptz,
  revenue_cents integer not null default 0 check (revenue_cents >= 0),
  provider_message_id text,
  workflow_enrollment_id uuid references public.workflow_enrollments(id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create unique index campaign_recipients_run_contact_idx
on public.campaign_recipients (campaign_run_id, contact_id)
where campaign_run_id is not null;

create unique index campaign_recipients_provider_message_idx
on public.campaign_recipients (provider_message_id)
where provider_message_id is not null;

create index campaign_recipients_campaign_status_idx on public.campaign_recipients (organization_id, campaign_id, status);
create index campaign_recipients_location_idx on public.campaign_recipients (organization_id, location_id);
create index campaign_recipients_contact_idx on public.campaign_recipients (organization_id, contact_id);

create table public.campaign_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_run_id uuid not null references public.campaign_runs(id) on delete cascade,
  campaign_recipient_id uuid not null references public.campaign_recipients(id) on delete cascade,
  run_at timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'completed', 'failed', 'cancelled', 'deferred')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (campaign_recipient_id)
);

create index campaign_jobs_due_idx on public.campaign_jobs (organization_id, status, run_at);

create table public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_run_id uuid references public.campaign_runs(id) on delete cascade,
  campaign_recipient_id uuid references public.campaign_recipients(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  event_type text not null check (event_type in ('snapshot_created', 'scheduled', 'sent', 'delivered', 'failed', 'replied', 'booked', 'sold', 'refunded', 'workflow_enrolled', 'skipped', 'suppressed', 'frequency_capped', 'cancelled')),
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index campaign_events_idempotency_idx
on public.campaign_events (organization_id, idempotency_key)
where idempotency_key is not null;

create index campaign_events_contact_idx on public.campaign_events (organization_id, contact_id, event_at desc);
create index campaign_events_campaign_idx on public.campaign_events (organization_id, campaign_id, event_at desc);

create trigger segments_set_updated_at before update on public.segments for each row execute function public.set_updated_at();
create trigger suppression_lists_set_updated_at before update on public.suppression_lists for each row execute function public.set_updated_at();
create trigger campaign_settings_set_updated_at before update on public.campaign_settings for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create trigger campaign_variants_set_updated_at before update on public.campaign_variants for each row execute function public.set_updated_at();
create trigger campaign_recipients_set_updated_at before update on public.campaign_recipients for each row execute function public.set_updated_at();
create trigger campaign_jobs_set_updated_at before update on public.campaign_jobs for each row execute function public.set_updated_at();

alter table public.segments enable row level security;
alter table public.segment_members enable row level security;
alter table public.suppression_lists enable row level security;
alter table public.suppression_list_members enable row level security;
alter table public.campaign_settings enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_variants enable row level security;
alter table public.campaign_runs enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_jobs enable row level security;
alter table public.campaign_events enable row level security;

create policy "tenant segments read" on public.segments for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('segments.read'));
create policy "tenant segments manage" on public.segments for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('segments.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('segments.manage'));

create policy "tenant segment members read" on public.segment_members for select using (
  exists (select 1 from public.segments s where s.id = segment_id and s.organization_id in (select public.current_organization_ids()) and public.has_permission('segments.read'))
);
create policy "tenant segment members manage" on public.segment_members for all using (
  exists (select 1 from public.segments s where s.id = segment_id and s.organization_id in (select public.current_organization_ids()) and public.has_permission('segments.manage'))
) with check (
  exists (select 1 from public.segments s where s.id = segment_id and s.organization_id in (select public.current_organization_ids()) and public.has_permission('segments.manage'))
);

create policy "tenant suppression lists read" on public.suppression_lists for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('suppression.read'));
create policy "tenant suppression lists manage" on public.suppression_lists for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('suppression.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('suppression.manage'));

create policy "tenant suppression members read" on public.suppression_list_members for select using (
  exists (select 1 from public.suppression_lists sl where sl.id = suppression_list_id and sl.organization_id in (select public.current_organization_ids()) and public.has_permission('suppression.read'))
);
create policy "tenant suppression members manage" on public.suppression_list_members for all using (
  exists (select 1 from public.suppression_lists sl where sl.id = suppression_list_id and sl.organization_id in (select public.current_organization_ids()) and public.has_permission('suppression.manage'))
) with check (
  exists (select 1 from public.suppression_lists sl where sl.id = suppression_list_id and sl.organization_id in (select public.current_organization_ids()) and public.has_permission('suppression.manage'))
);

create policy "tenant campaign settings read" on public.campaign_settings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.read'));
create policy "tenant campaign settings manage" on public.campaign_settings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.settings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.settings.manage'));

create policy "tenant campaigns read" on public.campaigns for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.read'));
create policy "tenant campaigns create" on public.campaigns for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.create'));
create policy "tenant campaigns edit" on public.campaigns for update using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.edit')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.edit'));

create policy "tenant campaign variants read" on public.campaign_variants for select using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.read')));
create policy "tenant campaign variants manage" on public.campaign_variants for all using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.edit'))) with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.edit')));

create policy "tenant campaign runs read" on public.campaign_runs for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.analytics.read'));
create policy "tenant campaign runs manage" on public.campaign_runs for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.launch')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.launch'));

create policy "tenant campaign recipients read" on public.campaign_recipients for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('campaigns.recipients.read')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = campaign_recipients.location_id))
);
create policy "tenant campaign recipients manage" on public.campaign_recipients for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('campaigns.launch')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = campaign_recipients.location_id))
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('campaigns.launch')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = campaign_recipients.location_id))
);

create policy "tenant campaign jobs read" on public.campaign_jobs for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.analytics.read'));
create policy "tenant campaign jobs manage" on public.campaign_jobs for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.launch')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.launch'));

create policy "tenant campaign events read" on public.campaign_events for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.analytics.read'));
create policy "tenant campaign events manage" on public.campaign_events for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('campaigns.launch'));

create or replace function public.claim_campaign_jobs(batch_size integer default 50)
returns setof public.campaign_jobs
language sql
as $$
  with candidate_jobs as (
    select cj.id
    from public.campaign_jobs cj
    join public.campaign_runs cr on cr.id = cj.campaign_run_id
    join public.campaigns c on c.id = cr.campaign_id
    where cj.status = 'scheduled'
      and cj.run_at <= now()
      and cr.status = 'running'
      and c.status = 'running'
      and cj.organization_id in (select public.current_organization_ids())
      and public.has_permission('campaigns.launch')
    order by cj.run_at, cj.created_at
    limit greatest(1, least(batch_size, 200))
    for update of cj skip locked
  )
  update public.campaign_jobs cj
  set status = 'running',
      attempts = cj.attempts + 1,
      locked_at = now()
  from candidate_jobs
  where cj.id = candidate_jobs.id
  returning cj.*;
$$;

create or replace function public.complete_campaign_job(target_job_id uuid, succeeded boolean, error_message text default null)
returns uuid
language plpgsql
as $$
declare
  changed_id uuid;
begin
  update public.campaign_jobs
  set status = case when succeeded then 'completed' else 'failed' end,
      completed_at = case when succeeded then now() else completed_at end,
      last_error = error_message
  where id = target_job_id
    and status = 'running'
    and organization_id in (select public.current_organization_ids())
    and public.has_permission('campaigns.launch')
  returning id into changed_id;

  return changed_id;
end;
$$;
