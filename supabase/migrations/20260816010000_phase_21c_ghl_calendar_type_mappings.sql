create table if not exists public.ghl_calendar_type_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  connection_id uuid not null references public.ghl_connections(id) on delete cascade,
  external_calendar_id text not null,
  appointment_type_id uuid not null references public.appointment_types(id) on delete restrict,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_calendar_id)
);

create index if not exists ghl_calendar_type_mappings_org_idx
  on public.ghl_calendar_type_mappings (organization_id, active);

create index if not exists ghl_calendar_type_mappings_type_idx
  on public.ghl_calendar_type_mappings (appointment_type_id);

drop trigger if exists ghl_calendar_type_mappings_set_updated_at on public.ghl_calendar_type_mappings;
create trigger ghl_calendar_type_mappings_set_updated_at
before update on public.ghl_calendar_type_mappings
for each row execute function public.set_updated_at();

alter table public.ghl_calendar_type_mappings enable row level security;

create policy "ghl calendar type mappings read"
on public.ghl_calendar_type_mappings
for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('integrations.ghl.read')
);

create policy "ghl calendar type mappings manage"
on public.ghl_calendar_type_mappings
for all
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('integrations.ghl.sync')
)
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('integrations.ghl.sync')
);
