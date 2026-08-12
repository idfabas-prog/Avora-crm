insert into public.permissions (key, description)
values
  ('appointments.read', 'Read appointments and appointment types'),
  ('appointments.write', 'Create and update appointments')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('appointments.read', 'appointments.write')
where r.name in ('owner', 'administrator', 'manager', 'salesperson', 'provider')
on conflict do nothing;

create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  default_location_id uuid references public.locations(id) on delete set null,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  active boolean not null default true,
  category text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider_id uuid references public.user_profiles(id) on delete set null,
  appointment_type_id uuid not null references public.appointment_types(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled',
  notes text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index appointment_types_organization_id_idx on public.appointment_types(organization_id);
create index appointment_types_default_location_id_idx on public.appointment_types(default_location_id);
create index appointments_organization_id_idx on public.appointments(organization_id);
create index appointments_location_id_idx on public.appointments(location_id);
create index appointments_contact_id_idx on public.appointments(contact_id);
create index appointments_provider_id_idx on public.appointments(provider_id);
create index appointments_type_id_idx on public.appointments(appointment_type_id);
create index appointments_start_at_idx on public.appointments(start_at);
create index appointments_status_idx on public.appointments(status);

create trigger appointment_types_set_updated_at before update on public.appointment_types for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();

alter table public.appointment_types enable row level security;
alter table public.appointments enable row level security;

create policy "tenant appointment types read" on public.appointment_types
for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('appointments.read')
);

create policy "tenant appointment types manage" on public.appointment_types
for all
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('locations.manage')
)
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('locations.manage')
);

create policy "tenant appointments access" on public.appointments
for all
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('appointments.read')
)
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('appointments.write')
);

create policy "tenant audit insert" on public.audit_logs
for insert
with check (
  organization_id in (select public.current_organization_ids())
);
