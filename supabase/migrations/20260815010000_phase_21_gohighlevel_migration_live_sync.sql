insert into public.permissions (key, description)
values
  ('integrations.ghl.read', 'Read GoHighLevel integration status, mappings, sync runs, and reconciliation'),
  ('integrations.ghl.manage', 'Manage GoHighLevel connection metadata and object enablement'),
  ('integrations.ghl.sync', 'Start read-only GoHighLevel sync, dry-run, and import jobs'),
  ('integrations.ghl.reconcile', 'Run and review GoHighLevel reconciliation'),
  ('integrations.ghl.exceptions.manage', 'Resolve or ignore GoHighLevel sync exceptions'),
  ('integrations.ghl.credentials.manage', 'Manage server-only GoHighLevel credential references'),
  ('integrations.ghl.audit.read', 'Read GoHighLevel integration audit and event history')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'integrations.ghl.read',
  'integrations.ghl.manage',
  'integrations.ghl.sync',
  'integrations.ghl.reconcile',
  'integrations.ghl.exceptions.manage',
  'integrations.ghl.credentials.manage',
  'integrations.ghl.audit.read'
)
where r.name in ('owner', 'administrator')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('integrations.ghl.read')
where r.name = 'manager'
on conflict (role_id, permission_id) do nothing;

create table public.ghl_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  display_name text not null,
  ghl_location_id text not null,
  credential_env_key text,
  connection_type text not null default 'private_integration' check (connection_type in ('private_integration', 'oauth_future', 'mock')),
  status text not null default 'disabled' check (status in ('healthy', 'syncing', 'warning', 'error', 'disabled')),
  sync_mode text not null default 'development' check (sync_mode in ('disabled', 'development', 'read_only', 'two_way_future')),
  objects_enabled jsonb not null default '{"contacts":true,"custom_fields":true,"tags":true,"users":true,"pipelines":true,"opportunities":true,"calendars":true,"appointments":true,"conversations":true,"messages":true,"payments":true}'::jsonb,
  token_present boolean not null default false,
  last_successful_sync_at timestamptz,
  last_full_sync_at timestamptz,
  last_webhook_at timestamptz,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, ghl_location_id),
  unique (organization_id, location_id, display_name)
);

create table public.external_record_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  provider text not null default 'gohighlevel',
  connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  external_object_type text not null,
  external_id text not null,
  internal_object_type text not null,
  internal_id uuid not null,
  external_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  checksum text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_object_type, external_id)
);

create table public.ghl_sync_cursors (
  connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  object_type text not null,
  cursor_value text,
  last_external_updated_at timestamptz,
  last_page_token text,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (connection_id, object_type)
);

create table public.ghl_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  sync_type text not null check (sync_type in ('full_import', 'incremental', 'webhook', 'reconciliation', 'manual_object_sync', 'dry_run', 'connection_test')),
  object_type text,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'partial', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_fetched integer not null default 0 check (records_fetched >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  records_unchanged integer not null default 0 check (records_unchanged >= 0),
  records_skipped integer not null default 0 check (records_skipped >= 0),
  records_failed integer not null default 0 check (records_failed >= 0),
  pages_fetched integer not null default 0 check (pages_fetched >= 0),
  error_summary text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ghl_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  sync_run_id uuid not null references public.ghl_sync_runs(id) on delete cascade,
  object_type text not null,
  cursor_value text,
  page_token text,
  status text not null default 'queued' check (status in ('queued', 'locked', 'running', 'completed', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ghl_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.ghl_connections(id) on delete cascade,
  sync_run_id uuid references public.ghl_sync_runs(id) on delete set null,
  object_type text,
  external_id text,
  action text not null,
  result text not null check (result in ('created', 'updated', 'unchanged', 'skipped', 'failed', 'mapped', 'received')),
  reason text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ghl_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.ghl_connections(id) on delete set null,
  provider_event_id text,
  event_type text not null,
  external_object_id text,
  payload_hash text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_summary text,
  metadata_safe jsonb not null default '{}'::jsonb,
  unique (connection_id, provider_event_id),
  unique (connection_id, payload_hash)
);

create table public.ghl_sync_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  connection_id uuid references public.ghl_connections(id) on delete cascade,
  sync_run_id uuid references public.ghl_sync_runs(id) on delete set null,
  exception_type text not null check (exception_type in ('duplicate_contact', 'missing_contact_dependency', 'unknown_calendar', 'unknown_status', 'unmapped_user', 'payment_mapping_ambiguous', 'missing_external_record', 'invalid_phone', 'invalid_email', 'permission_scope_missing', 'api_unsupported', 'stale_mapping', 'duplicate_mapping')),
  object_type text,
  external_id text,
  status text not null default 'open' check (status in ('open', 'review', 'resolved', 'ignored')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  summary text not null,
  resolution_notes text,
  resolved_by uuid references public.user_profiles(id) on delete set null,
  resolved_at timestamptz,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ghl_custom_field_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  external_field_id text not null,
  external_field_name text not null,
  internal_field_key text,
  data_type text not null default 'text',
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_field_id)
);

create table public.ghl_user_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  external_user_id text not null,
  internal_user_id uuid references public.user_profiles(id) on delete set null,
  external_name text not null,
  external_email text,
  linked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_user_id)
);

create index ghl_connections_org_status_idx on public.ghl_connections (organization_id, status, sync_mode);
create index ghl_connections_location_idx on public.ghl_connections (location_id);
create index external_record_mappings_internal_idx on public.external_record_mappings (organization_id, internal_object_type, internal_id);
create index external_record_mappings_provider_idx on public.external_record_mappings (provider, external_object_type, external_id);
create index ghl_sync_runs_connection_status_idx on public.ghl_sync_runs (connection_id, status, started_at desc);
create index ghl_sync_jobs_claim_idx on public.ghl_sync_jobs (status, run_at, attempts);
create index ghl_sync_events_connection_idx on public.ghl_sync_events (connection_id, object_type, created_at desc);
create index ghl_webhook_events_status_idx on public.ghl_webhook_events (status, received_at desc);
create index ghl_sync_exceptions_connection_status_idx on public.ghl_sync_exceptions (connection_id, status, severity, created_at desc);
create index ghl_custom_field_mappings_connection_idx on public.ghl_custom_field_mappings (connection_id, enabled);
create index ghl_user_mappings_connection_idx on public.ghl_user_mappings (connection_id, linked);

drop trigger if exists ghl_connections_set_updated_at on public.ghl_connections;
create trigger ghl_connections_set_updated_at before update on public.ghl_connections for each row execute function public.set_updated_at();
drop trigger if exists external_record_mappings_set_updated_at on public.external_record_mappings;
create trigger external_record_mappings_set_updated_at before update on public.external_record_mappings for each row execute function public.set_updated_at();
drop trigger if exists ghl_sync_cursors_set_updated_at on public.ghl_sync_cursors;
create trigger ghl_sync_cursors_set_updated_at before update on public.ghl_sync_cursors for each row execute function public.set_updated_at();
drop trigger if exists ghl_sync_jobs_set_updated_at on public.ghl_sync_jobs;
create trigger ghl_sync_jobs_set_updated_at before update on public.ghl_sync_jobs for each row execute function public.set_updated_at();
drop trigger if exists ghl_sync_exceptions_set_updated_at on public.ghl_sync_exceptions;
create trigger ghl_sync_exceptions_set_updated_at before update on public.ghl_sync_exceptions for each row execute function public.set_updated_at();
drop trigger if exists ghl_custom_field_mappings_set_updated_at on public.ghl_custom_field_mappings;
create trigger ghl_custom_field_mappings_set_updated_at before update on public.ghl_custom_field_mappings for each row execute function public.set_updated_at();
drop trigger if exists ghl_user_mappings_set_updated_at on public.ghl_user_mappings;
create trigger ghl_user_mappings_set_updated_at before update on public.ghl_user_mappings for each row execute function public.set_updated_at();

alter table public.ghl_connections enable row level security;
alter table public.external_record_mappings enable row level security;
alter table public.ghl_sync_cursors enable row level security;
alter table public.ghl_sync_runs enable row level security;
alter table public.ghl_sync_jobs enable row level security;
alter table public.ghl_sync_events enable row level security;
alter table public.ghl_webhook_events enable row level security;
alter table public.ghl_sync_exceptions enable row level security;
alter table public.ghl_custom_field_mappings enable row level security;
alter table public.ghl_user_mappings enable row level security;

create policy "ghl connections read" on public.ghl_connections for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read'));
create policy "ghl connections manage" on public.ghl_connections for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.manage'));

create policy "ghl mappings read" on public.external_record_mappings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read'));
create policy "ghl mappings manage" on public.external_record_mappings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync'));

create policy "ghl cursors read" on public.ghl_sync_cursors for select using (exists (select 1 from public.ghl_connections c where c.id = connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read')));
create policy "ghl cursors manage" on public.ghl_sync_cursors for all using (exists (select 1 from public.ghl_connections c where c.id = connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync'))) with check (exists (select 1 from public.ghl_connections c where c.id = connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync')));

create policy "ghl sync runs read" on public.ghl_sync_runs for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read'));
create policy "ghl sync runs manage" on public.ghl_sync_runs for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync'));

create policy "ghl sync jobs read" on public.ghl_sync_jobs for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read'));
create policy "ghl sync jobs manage" on public.ghl_sync_jobs for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync'));

create policy "ghl sync events read" on public.ghl_sync_events for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.audit.read'));
create policy "ghl sync events manage" on public.ghl_sync_events for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync'));

create policy "ghl webhook events read" on public.ghl_webhook_events for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.audit.read'));
create policy "ghl webhook events manage" on public.ghl_webhook_events for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.sync'));

create policy "ghl exceptions read" on public.ghl_sync_exceptions for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read'));
create policy "ghl exceptions manage" on public.ghl_sync_exceptions for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.exceptions.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.exceptions.manage'));

create policy "ghl custom fields read" on public.ghl_custom_field_mappings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read'));
create policy "ghl custom fields manage" on public.ghl_custom_field_mappings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.manage'));

create policy "ghl user mappings read" on public.ghl_user_mappings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.read'));
create policy "ghl user mappings manage" on public.ghl_user_mappings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.manage'));

insert into public.system_feature_flags (organization_id, feature_key, mode, live_enabled, configured, status, description, metadata_safe)
select o.id, 'ghl_read_only_sync', 'development', false, false, 'disabled', 'Controls read-only GoHighLevel mirror sync. Must be explicitly configured before real imports.', '{"phase":21,"provider":"gohighlevel","write_gate":"GHL_ALLOW_WRITES"}'::jsonb
from public.organizations o
on conflict (organization_id, feature_key) do nothing;

insert into public.system_feature_flags (organization_id, feature_key, mode, live_enabled, configured, status, description, metadata_safe)
select o.id, 'ghl_two_way_sync', 'development', false, false, 'blocked', 'Future GoHighLevel two-way sync gate. Phase 21 must keep this disabled.', '{"phase":21,"provider":"gohighlevel","phase_21_allowed":false}'::jsonb
from public.organizations o
on conflict (organization_id, feature_key) do nothing;
