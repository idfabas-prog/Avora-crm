insert into public.permissions (key, description)
values
  ('system.read', 'Read system health and production-readiness status'),
  ('system.manage', 'Manage system settings, maintenance mode, and read-only mode'),
  ('system.security.read', 'Read security events and access-review signals'),
  ('system.security.manage', 'Manage security-event review state'),
  ('system.features.manage', 'Manage production feature gates'),
  ('system.jobs.read', 'Read background-job health'),
  ('system.incidents.manage', 'Manage operational incidents'),
  ('system.audit.read', 'Read production audit and access-review reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'system.read',
  'system.manage',
  'system.security.read',
  'system.security.manage',
  'system.features.manage',
  'system.jobs.read',
  'system.incidents.manage',
  'system.audit.read'
)
where r.name in ('owner', 'administrator')
on conflict (role_id, permission_id) do nothing;

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment text not null default 'development' check (environment in ('development', 'test', 'staging', 'production')),
  maintenance_mode boolean not null default false,
  read_only_mode boolean not null default false,
  support_message text not null default 'Avora is operating normally.',
  deployment_version text,
  last_backup_verified_at timestamptz,
  updated_by uuid references public.user_profiles(id) on delete set null,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table public.system_feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  mode text not null default 'development' check (mode in ('development', 'test', 'staging', 'production')),
  live_enabled boolean not null default false,
  configured boolean not null default false,
  status text not null default 'disabled' check (status in ('disabled', 'configured', 'test_ready', 'live_enabled', 'blocked')),
  description text not null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, feature_key)
);

create table public.system_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  incident_type text not null,
  severity text not null check (severity in ('SEV-1', 'SEV-2', 'SEV-3', 'SEV-4')),
  status text not null default 'open' check (status in ('open', 'monitoring', 'resolved', 'closed')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  summary text not null,
  owner_user_id uuid references public.user_profiles(id) on delete set null,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  source text not null default 'application',
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  request_id text,
  ip_hash text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.user_profiles(id) on delete set null
);

create table public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  check_key text not null,
  category text not null,
  status text not null check (status in ('pass', 'warning', 'fail')),
  summary text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  last_checked_at timestamptz not null default now(),
  metadata_safe jsonb not null default '{}'::jsonb,
  unique (organization_id, check_key)
);

create table public.launch_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  check_key text not null,
  category text not null,
  status text not null check (status in ('pass', 'warning', 'fail')),
  blocker boolean not null default false,
  summary text not null,
  remediation text not null,
  evidence_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, check_key)
);

create table public.system_job_failures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  job_type text not null,
  job_table text,
  job_id uuid,
  status text not null default 'failed' check (status in ('failed', 'dead_letter', 'recovered', 'ignored')),
  attempts integer not null default 1 check (attempts >= 0),
  next_retry_at timestamptz,
  last_error_safe text not null,
  request_id text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index system_job_failures_job_uidx
on public.system_job_failures (job_type, coalesce(job_table, ''), coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid))
where status in ('failed', 'dead_letter');

create index system_feature_flags_org_idx on public.system_feature_flags (organization_id, live_enabled, status);
create index system_incidents_org_status_idx on public.system_incidents (organization_id, status, severity, started_at desc);
create index security_events_org_status_idx on public.security_events (organization_id, status, severity, created_at desc);
create index system_health_checks_org_status_idx on public.system_health_checks (organization_id, status, category);
create index launch_readiness_checks_org_status_idx on public.launch_readiness_checks (organization_id, status, blocker, category);
create index system_job_failures_org_status_idx on public.system_job_failures (organization_id, status, job_type, created_at desc);

drop trigger if exists system_settings_set_updated_at on public.system_settings;
create trigger system_settings_set_updated_at before update on public.system_settings for each row execute function public.set_updated_at();
drop trigger if exists system_feature_flags_set_updated_at on public.system_feature_flags;
create trigger system_feature_flags_set_updated_at before update on public.system_feature_flags for each row execute function public.set_updated_at();
drop trigger if exists system_incidents_set_updated_at on public.system_incidents;
create trigger system_incidents_set_updated_at before update on public.system_incidents for each row execute function public.set_updated_at();
drop trigger if exists launch_readiness_checks_set_updated_at on public.launch_readiness_checks;
create trigger launch_readiness_checks_set_updated_at before update on public.launch_readiness_checks for each row execute function public.set_updated_at();
drop trigger if exists system_job_failures_set_updated_at on public.system_job_failures;
create trigger system_job_failures_set_updated_at before update on public.system_job_failures for each row execute function public.set_updated_at();

alter table public.system_settings enable row level security;
alter table public.system_feature_flags enable row level security;
alter table public.system_incidents enable row level security;
alter table public.security_events enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.launch_readiness_checks enable row level security;
alter table public.system_job_failures enable row level security;

create policy "system settings read" on public.system_settings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('system.read'));
create policy "system settings manage" on public.system_settings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('system.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('system.manage'));

create policy "system feature flags read" on public.system_feature_flags for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('system.read'));
create policy "system feature flags manage" on public.system_feature_flags for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('system.features.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('system.features.manage'));

create policy "system incidents read" on public.system_incidents for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.read'));
create policy "system incidents manage" on public.system_incidents for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.incidents.manage')) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.incidents.manage'));

create policy "security events read" on public.security_events for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.security.read'));
create policy "security events manage" on public.security_events for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.security.manage')) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.security.manage'));

create policy "system health checks read" on public.system_health_checks for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.read'));
create policy "system health checks manage" on public.system_health_checks for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage')) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage'));

create policy "launch readiness read" on public.launch_readiness_checks for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('system.read'));
create policy "launch readiness manage" on public.launch_readiness_checks for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('system.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('system.manage'));

create policy "system job failures read" on public.system_job_failures for select using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.jobs.read'));
create policy "system job failures manage" on public.system_job_failures for all using ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage')) with check ((organization_id is null or organization_id in (select public.current_organization_ids())) and public.has_permission('system.manage'));
