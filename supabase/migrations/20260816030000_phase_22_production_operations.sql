insert into public.permissions (key, description)
values
  ('system.health.read', 'Read production health dashboard and worker heartbeat status'),
  ('system.workers.manage', 'Manage production worker leases and operational scheduler locks'),
  ('system.smoke.read', 'Read production smoke-test results'),
  ('system.deployment.read', 'Read deployment and release events')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'system.health.read',
  'system.workers.manage',
  'system.smoke.read',
  'system.deployment.read'
)
where r.name in ('owner', 'administrator')
on conflict (role_id, permission_id) do nothing;

alter table public.system_incidents
  add column if not exists source text not null default 'application',
  add column if not exists message text,
  add column if not exists opened_at timestamptz;

update public.system_incidents
set opened_at = coalesce(opened_at, started_at),
    message = coalesce(message, summary)
where opened_at is null or message is null;

alter table public.system_incidents
  alter column opened_at set default now(),
  alter column message set not null;

create table public.system_worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  worker_id text not null,
  worker_type text not null check (worker_type in ('ghl_continuous', 'ghl_queue', 'workflow', 'campaign', 'maintenance', 'smoke_test')),
  environment text not null default 'development' check (environment in ('development', 'test', 'staging', 'production')),
  status text not null default 'healthy' check (status in ('healthy', 'warning', 'degraded', 'down', 'stopping')),
  current_object_type text,
  current_location_id uuid references public.locations(id) on delete set null,
  current_connection_id uuid references public.ghl_connections(id) on delete set null,
  last_heartbeat_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id)
);

create table public.system_scheduler_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  lock_key text not null,
  worker_id text not null,
  environment text not null default 'development' check (environment in ('development', 'test', 'staging', 'production')),
  lease_expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lock_key)
);

create table public.system_smoke_test_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  environment text not null default 'development' check (environment in ('development', 'test', 'staging', 'production')),
  status text not null check (status in ('healthy', 'warning', 'degraded', 'down')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  checks jsonb not null default '[]'::jsonb,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.system_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  target_table text not null,
  retention_days integer not null check (retention_days > 0),
  enabled boolean not null default true,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, target_table)
);

create table public.system_deployment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  environment text not null default 'development' check (environment in ('development', 'test', 'staging', 'production')),
  app_version text not null,
  deployment_id text,
  status text not null default 'deployed' check (status in ('planned', 'deployed', 'rolled_back', 'failed')),
  deployed_at timestamptz not null default now(),
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index system_worker_heartbeats_org_type_idx on public.system_worker_heartbeats (organization_id, worker_type, status, last_heartbeat_at desc);
create index system_worker_heartbeats_connection_idx on public.system_worker_heartbeats (current_connection_id, last_heartbeat_at desc);
create index system_scheduler_locks_due_idx on public.system_scheduler_locks (lock_key, lease_expires_at);
create index system_smoke_test_runs_env_status_idx on public.system_smoke_test_runs (environment, status, started_at desc);
create index system_retention_policies_org_target_idx on public.system_retention_policies (organization_id, target_table);
create index system_deployment_events_env_version_idx on public.system_deployment_events (environment, deployed_at desc, app_version);
create index if not exists ghl_sync_jobs_connection_status_run_at_idx on public.ghl_sync_jobs (connection_id, status, run_at);
create index if not exists ghl_sync_jobs_running_lock_idx on public.ghl_sync_jobs (status, locked_at, updated_at) where status in ('locked', 'running');
create index if not exists ghl_sync_runs_type_status_idx on public.ghl_sync_runs (sync_type, status, started_at desc);
create index if not exists ghl_webhook_events_status_received_idx on public.ghl_webhook_events (status, received_at desc);
create index if not exists contacts_location_updated_idx on public.contacts (location_id, updated_at);
create index if not exists payments_location_created_idx on public.payments (location_id, created_at);

drop trigger if exists system_worker_heartbeats_set_updated_at on public.system_worker_heartbeats;
create trigger system_worker_heartbeats_set_updated_at before update on public.system_worker_heartbeats for each row execute function public.set_updated_at();
drop trigger if exists system_scheduler_locks_set_updated_at on public.system_scheduler_locks;
create trigger system_scheduler_locks_set_updated_at before update on public.system_scheduler_locks for each row execute function public.set_updated_at();
drop trigger if exists system_retention_policies_set_updated_at on public.system_retention_policies;
create trigger system_retention_policies_set_updated_at before update on public.system_retention_policies for each row execute function public.set_updated_at();

alter table public.system_worker_heartbeats enable row level security;
alter table public.system_scheduler_locks enable row level security;
alter table public.system_smoke_test_runs enable row level security;
alter table public.system_retention_policies enable row level security;
alter table public.system_deployment_events enable row level security;

create policy "system worker heartbeats read" on public.system_worker_heartbeats for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.health.read') or public.has_permission('system.read')));
create policy "system worker heartbeats manage" on public.system_worker_heartbeats for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.workers.manage') or public.has_permission('system.manage'))) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.workers.manage') or public.has_permission('system.manage')));

create policy "system scheduler locks read" on public.system_scheduler_locks for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.health.read') or public.has_permission('system.read')));
create policy "system scheduler locks manage" on public.system_scheduler_locks for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.workers.manage') or public.has_permission('system.manage'))) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.workers.manage') or public.has_permission('system.manage')));

create policy "system smoke runs read" on public.system_smoke_test_runs for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.smoke.read') or public.has_permission('system.read')));
create policy "system smoke runs manage" on public.system_smoke_test_runs for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage')) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage'));

create policy "system retention policies read" on public.system_retention_policies for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.read'));
create policy "system retention policies manage" on public.system_retention_policies for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage')) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage'));

create policy "system deployment events read" on public.system_deployment_events for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and (public.has_permission('system.deployment.read') or public.has_permission('system.read')));
create policy "system deployment events manage" on public.system_deployment_events for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage')) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage'));

create or replace function public.claim_system_scheduler_lock(
  p_lock_key text,
  p_worker_id text,
  p_environment text default 'development',
  p_lease_seconds integer default 120,
  p_organization_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_claimed boolean := false;
begin
  insert into public.system_scheduler_locks (
    organization_id,
    lock_key,
    worker_id,
    environment,
    lease_expires_at,
    heartbeat_at,
    metadata_safe
  )
  values (
    p_organization_id,
    p_lock_key,
    p_worker_id,
    p_environment,
    v_now + make_interval(secs => greatest(p_lease_seconds, 1)),
    v_now,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (lock_key) do update
  set worker_id = excluded.worker_id,
      environment = excluded.environment,
      lease_expires_at = excluded.lease_expires_at,
      heartbeat_at = excluded.heartbeat_at,
      metadata_safe = excluded.metadata_safe,
      organization_id = coalesce(excluded.organization_id, public.system_scheduler_locks.organization_id)
  where public.system_scheduler_locks.lease_expires_at <= v_now
     or public.system_scheduler_locks.worker_id = p_worker_id
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

insert into public.system_retention_policies (organization_id, target_table, retention_days, metadata_safe)
select o.id, policy.target_table, policy.retention_days, jsonb_build_object('phase', '22', 'deletes_business_records', false)
from public.organizations o
cross join (
  values
    ('ghl_sync_jobs', 30),
    ('ghl_webhook_events', 30),
    ('ghl_sync_exceptions_resolved', 90),
    ('system_worker_heartbeats', 14),
    ('system_smoke_test_runs', 90),
    ('system_deployment_events', 365)
) as policy(target_table, retention_days)
on conflict (organization_id, target_table) do nothing;
