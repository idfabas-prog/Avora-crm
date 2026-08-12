insert into public.permissions (key, description)
values
  ('workflows.read', 'Read workflows and workflow enrollments'),
  ('workflows.create', 'Create workflow drafts'),
  ('workflows.edit', 'Edit workflow drafts and settings'),
  ('workflows.publish', 'Publish workflow versions'),
  ('workflows.pause', 'Pause and archive workflows'),
  ('workflows.enroll', 'Manually enroll CRM records into workflows'),
  ('workflows.stop', 'Stop workflow enrollments'),
  ('workflows.logs.read', 'Read workflow execution logs')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workflows.read',
  'workflows.create',
  'workflows.edit',
  'workflows.publish',
  'workflows.pause',
  'workflows.enroll',
  'workflows.stop',
  'workflows.logs.read'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workflows.read',
  'workflows.create',
  'workflows.edit',
  'workflows.pause',
  'workflows.enroll',
  'workflows.stop',
  'workflows.logs.read'
)
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workflows.read',
  'workflows.enroll',
  'workflows.stop',
  'workflows.logs.read'
)
where r.name = 'salesperson'
on conflict do nothing;

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'custom' check (category in ('lead_nurture', 'appointment', 'sales', 'treatment_follow_up', 'reactivation', 'payment', 'internal_operations', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  version integer not null default 1 check (version > 0),
  active_version_id uuid,
  location_scope text not null default 'all' check (location_scope in ('all', 'specific')),
  enrollment_policy text not null default 'one_active_per_contact' check (enrollment_policy in ('allow_multiple', 'one_per_contact', 'one_active_per_contact', 'one_per_triggering_record')),
  re_enrollment_policy text not null default 'after_completion' check (re_enrollment_policy in ('never', 'after_completion', 'always')),
  failure_policy text not null default 'retry_then_stop' check (failure_policy in ('retry_then_stop', 'continue', 'stop')),
  test_mode boolean not null default true,
  max_sms_per_minute integer not null default 10 check (max_sms_per_minute > 0),
  max_enrollments_per_batch integer not null default 100 check (max_enrollments_per_batch > 0),
  quiet_hours_start time not null default '20:00',
  quiet_hours_end time not null default '08:00',
  respect_business_days boolean not null default false,
  stop_conditions jsonb not null default '[]'::jsonb,
  goal_config jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (organization_id, name)
);

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  definition_json jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  validation_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (workflow_id, version_number)
);

alter table public.workflows
  add constraint workflows_active_version_id_fkey
  foreign key (active_version_id) references public.workflow_versions(id) on delete set null;

create table public.workflow_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workflow_id, location_id)
);

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.workflow_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workflow_version_id uuid not null references public.workflow_versions(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'waiting', 'completed', 'stopped', 'failed', 'cancelled')),
  enrollment_key text,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  stopped_at timestamptz,
  current_node_id text,
  trigger_event_id uuid references public.domain_events(id) on delete set null,
  test_mode boolean not null default false,
  stop_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workflow_enrollments_unique_key_idx
on public.workflow_enrollments (organization_id, workflow_id, enrollment_key);

create table public.workflow_execution_steps (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.workflow_enrollments(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'completed', 'skipped', 'failed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  attempt_number integer not null default 1 check (attempt_number > 0),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  next_node_id text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index workflow_execution_steps_idempotency_idx
on public.workflow_execution_steps (idempotency_key);

create table public.workflow_event_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid references public.workflows(id) on delete cascade,
  enrollment_id uuid references public.workflow_enrollments(id) on delete cascade,
  execution_step_id uuid references public.workflow_execution_steps(id) on delete set null,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workflow_scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workflow_version_id uuid not null references public.workflow_versions(id) on delete restrict,
  enrollment_id uuid not null references public.workflow_enrollments(id) on delete cascade,
  node_id text not null,
  run_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'completed', 'failed', 'cancelled')),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  last_error text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workflow_scheduled_jobs_idempotency_idx
on public.workflow_scheduled_jobs (organization_id, idempotency_key);

create table public.workflow_action_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enrollment_id uuid not null references public.workflow_enrollments(id) on delete cascade,
  execution_step_id uuid references public.workflow_execution_steps(id) on delete cascade,
  node_id text not null,
  action_type text not null,
  idempotency_key text not null,
  status text not null default 'started' check (status in ('started', 'completed', 'skipped', 'failed')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, idempotency_key)
);

create table public.workflow_test_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workflow_version_id uuid references public.workflow_versions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create trigger workflows_set_updated_at before update on public.workflows for each row execute function public.set_updated_at();
create trigger workflow_enrollments_set_updated_at before update on public.workflow_enrollments for each row execute function public.set_updated_at();
create trigger workflow_scheduled_jobs_set_updated_at before update on public.workflow_scheduled_jobs for each row execute function public.set_updated_at();

create index workflows_organization_status_idx on public.workflows (organization_id, status);
create index workflows_active_version_idx on public.workflows (active_version_id);
create index workflow_versions_workflow_status_idx on public.workflow_versions (workflow_id, status);
create index workflow_locations_location_idx on public.workflow_locations (location_id);
create index domain_events_type_processed_idx on public.domain_events (organization_id, event_type, processed_at);
create index domain_events_entity_idx on public.domain_events (entity_type, entity_id);
create index workflow_enrollments_workflow_status_idx on public.workflow_enrollments (workflow_id, status);
create index workflow_enrollments_version_idx on public.workflow_enrollments (workflow_version_id);
create index workflow_enrollments_contact_idx on public.workflow_enrollments (contact_id);
create index workflow_enrollments_location_idx on public.workflow_enrollments (location_id);
create index workflow_execution_steps_enrollment_idx on public.workflow_execution_steps (enrollment_id, created_at desc);
create index workflow_event_logs_enrollment_idx on public.workflow_event_logs (enrollment_id, created_at desc);
create index workflow_event_logs_workflow_idx on public.workflow_event_logs (workflow_id, created_at desc);
create index workflow_scheduled_jobs_due_idx on public.workflow_scheduled_jobs (status, run_at);
create index workflow_scheduled_jobs_enrollment_idx on public.workflow_scheduled_jobs (enrollment_id);
create index workflow_action_executions_enrollment_idx on public.workflow_action_executions (enrollment_id);
create index workflow_test_runs_workflow_idx on public.workflow_test_runs (workflow_id, created_at desc);

alter table public.workflows enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_locations enable row level security;
alter table public.domain_events enable row level security;
alter table public.workflow_enrollments enable row level security;
alter table public.workflow_execution_steps enable row level security;
alter table public.workflow_event_logs enable row level security;
alter table public.workflow_scheduled_jobs enable row level security;
alter table public.workflow_action_executions enable row level security;
alter table public.workflow_test_runs enable row level security;

create policy "tenant workflows read" on public.workflows for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.read'));
create policy "tenant workflows create" on public.workflows for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.create'));
create policy "tenant workflows edit" on public.workflows for update
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workflows.edit') or public.has_permission('workflows.publish') or public.has_permission('workflows.pause')))
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('workflows.edit') or public.has_permission('workflows.publish') or public.has_permission('workflows.pause')));

create policy "tenant workflow versions read" on public.workflow_versions for select
using (exists (select 1 from public.workflows w where w.id = workflow_id and w.organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.read')));
create policy "tenant workflow versions create" on public.workflow_versions for insert
with check (exists (select 1 from public.workflows w where w.id = workflow_id and w.organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit')));
create policy "tenant workflow versions update drafts" on public.workflow_versions for update
using (exists (select 1 from public.workflows w where w.id = workflow_id and w.organization_id in (select public.current_organization_ids()) and (public.has_permission('workflows.edit') or public.has_permission('workflows.publish'))))
with check (exists (select 1 from public.workflows w where w.id = workflow_id and w.organization_id in (select public.current_organization_ids()) and (public.has_permission('workflows.edit') or public.has_permission('workflows.publish'))));

create policy "tenant workflow locations access" on public.workflow_locations for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.read'))
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('workflows.edit')
  and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = workflow_locations.location_id)
);

create policy "tenant domain events read" on public.domain_events for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.logs.read'));
create policy "tenant domain events insert" on public.domain_events for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.enroll'));
create policy "tenant domain events update processed" on public.domain_events for update
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit'));

create policy "tenant workflow enrollments read" on public.workflow_enrollments for select
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workflows.read') or public.has_permission('workflows.logs.read')));
create policy "tenant workflow enrollments insert" on public.workflow_enrollments for insert
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('workflows.enroll')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = workflow_enrollments.location_id))
);
create policy "tenant workflow enrollments update" on public.workflow_enrollments for update
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workflows.stop') or public.has_permission('workflows.edit')))
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('workflows.stop') or public.has_permission('workflows.edit')));

create policy "tenant workflow execution steps read" on public.workflow_execution_steps for select
using (exists (select 1 from public.workflow_enrollments e where e.id = enrollment_id and e.organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.logs.read')));
create policy "tenant workflow execution steps manage" on public.workflow_execution_steps for all
using (exists (select 1 from public.workflow_enrollments e where e.id = enrollment_id and e.organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit')))
with check (exists (select 1 from public.workflow_enrollments e where e.id = enrollment_id and e.organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit')));

create policy "tenant workflow logs read" on public.workflow_event_logs for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.logs.read'));
create policy "tenant workflow logs write" on public.workflow_event_logs for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit'));

create policy "tenant workflow jobs read" on public.workflow_scheduled_jobs for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.logs.read'));
create policy "tenant workflow jobs manage" on public.workflow_scheduled_jobs for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit'));

create policy "tenant workflow action executions read" on public.workflow_action_executions for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.logs.read'));
create policy "tenant workflow action executions write" on public.workflow_action_executions for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit'));

create policy "tenant workflow test runs read" on public.workflow_test_runs for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.logs.read'));
create policy "tenant workflow test runs create" on public.workflow_test_runs for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workflows.edit'));

create or replace function public.claim_due_workflow_jobs(batch_size integer default 10, worker_id text default gen_random_uuid()::text)
returns setof public.workflow_scheduled_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select id
    from public.workflow_scheduled_jobs
    where status = 'scheduled'
      and run_at <= now()
      and attempts < max_attempts
    order by run_at asc
    limit batch_size
    for update skip locked
  )
  update public.workflow_scheduled_jobs jobs
  set status = 'running',
      locked_at = now(),
      locked_by = worker_id,
      attempts = jobs.attempts + 1,
      updated_at = now()
  from claimed
  where jobs.id = claimed.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_due_workflow_jobs(integer, text) from public;
revoke all on function public.claim_due_workflow_jobs(integer, text) from anon;
revoke all on function public.claim_due_workflow_jobs(integer, text) from authenticated;
grant execute on function public.claim_due_workflow_jobs(integer, text) to service_role;
