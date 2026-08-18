-- Phase 21B.1: HighLevel OAuth installation foundation for webhook authorization.

create table if not exists public.ghl_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  ghl_connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  state_hash text not null unique,
  redirect_uri text not null,
  expected_ghl_location_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'used', 'expired', 'invalidated')),
  created_by uuid references public.user_profiles(id) on delete set null,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ghl_oauth_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  ghl_connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  expected_ghl_location_id text not null,
  ghl_location_id text,
  company_id text,
  marketplace_app_id text,
  install_id text,
  oauth_user_id text,
  oauth_user_type text,
  scopes text[] not null default '{}',
  access_token_expires_at timestamptz,
  installed_at timestamptz,
  last_refreshed_at timestamptz,
  last_install_event_at timestamptz,
  last_uninstall_event_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'healthy', 'location_mismatch', 'refresh_failed', 'inactive', 'uninstalled')),
  status_reason text,
  webhook_ready boolean not null default false,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ghl_connection_id),
  unique (organization_id, expected_ghl_location_id)
);

create table if not exists public.ghl_oauth_credentials (
  installation_id uuid primary key references public.ghl_oauth_installations(id) on delete cascade,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  encryption_version text not null default 'aes-256-gcm:v1',
  refresh_lock_token text,
  refresh_in_progress_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ghl_oauth_states_connection_idx on public.ghl_oauth_states (ghl_connection_id, status, expires_at);
create index if not exists ghl_oauth_installations_connection_status_idx on public.ghl_oauth_installations (ghl_connection_id, status);
create index if not exists ghl_oauth_installations_location_idx on public.ghl_oauth_installations (ghl_location_id);

drop trigger if exists ghl_oauth_states_set_updated_at on public.ghl_oauth_states;
create trigger ghl_oauth_states_set_updated_at before update on public.ghl_oauth_states for each row execute function public.set_updated_at();
drop trigger if exists ghl_oauth_installations_set_updated_at on public.ghl_oauth_installations;
create trigger ghl_oauth_installations_set_updated_at before update on public.ghl_oauth_installations for each row execute function public.set_updated_at();
drop trigger if exists ghl_oauth_credentials_set_updated_at on public.ghl_oauth_credentials;
create trigger ghl_oauth_credentials_set_updated_at before update on public.ghl_oauth_credentials for each row execute function public.set_updated_at();

alter table public.ghl_oauth_states enable row level security;
alter table public.ghl_oauth_installations enable row level security;
alter table public.ghl_oauth_credentials enable row level security;

create policy "ghl oauth states read" on public.ghl_oauth_states for select
  using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.credentials.manage'));
create policy "ghl oauth states manage" on public.ghl_oauth_states for all
  using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.credentials.manage'))
  with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.credentials.manage'));

create policy "ghl oauth installations read" on public.ghl_oauth_installations for select
  using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.credentials.manage'));
create policy "ghl oauth installations manage" on public.ghl_oauth_installations for all
  using (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.credentials.manage'))
  with check (organization_id in (select public.current_organization_ids()) and public.has_permission('integrations.ghl.credentials.manage'));

-- No client-facing policies are created for public.ghl_oauth_credentials.
-- Service-role server code is the only intended reader/writer for encrypted tokens.
