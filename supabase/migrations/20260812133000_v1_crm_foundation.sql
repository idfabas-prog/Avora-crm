create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  city text not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  full_name text not null,
  email text not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.user_locations (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  assigned_to uuid references public.user_profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  lead_source text,
  status text not null default 'new_lead',
  lifetime_value_cents integer not null default 0,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  author_id uuid references public.user_profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position integer not null,
  is_closed boolean not null default false,
  is_won boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, position),
  unique (pipeline_id, name)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  assigned_to uuid references public.user_profiles(id) on delete set null,
  name text not null,
  value_cents integer not null default 0,
  status text not null default 'open',
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  assigned_to uuid references public.user_profiles(id) on delete set null,
  title text not null,
  status text not null default 'open',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.user_profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index locations_organization_id_idx on public.locations(organization_id);
create index roles_organization_id_idx on public.roles(organization_id);
create index user_profiles_organization_id_idx on public.user_profiles(organization_id);
create index contacts_organization_id_idx on public.contacts(organization_id);
create index contacts_location_id_idx on public.contacts(location_id);
create index contacts_assigned_to_idx on public.contacts(assigned_to);
create index contacts_status_idx on public.contacts(status);
create index contact_notes_contact_id_idx on public.contact_notes(contact_id);
create index tags_organization_id_idx on public.tags(organization_id);
create index pipelines_organization_id_idx on public.pipelines(organization_id);
create index pipeline_stages_pipeline_id_idx on public.pipeline_stages(pipeline_id);
create index opportunities_organization_id_idx on public.opportunities(organization_id);
create index opportunities_stage_id_idx on public.opportunities(stage_id);
create index opportunities_contact_id_idx on public.opportunities(contact_id);
create index tasks_organization_id_idx on public.tasks(organization_id);
create index tasks_assigned_to_idx on public.tasks(assigned_to);
create index audit_logs_organization_id_idx on public.audit_logs(organization_id);

create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger locations_set_updated_at before update on public.locations for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger user_profiles_set_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger contact_notes_set_updated_at before update on public.contact_notes for each row execute function public.set_updated_at();
create trigger tags_set_updated_at before update on public.tags for each row execute function public.set_updated_at();
create trigger pipelines_set_updated_at before update on public.pipelines for each row execute function public.set_updated_at();
create trigger pipeline_stages_set_updated_at before update on public.pipeline_stages for each row execute function public.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

create or replace function public.current_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.user_profiles
  where id = auth.uid()
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.role_permissions rp on rp.role_id = up.role_id
    join public.permissions p on p.id = rp.permission_id
    where up.id = auth.uid()
      and p.key = permission_key
  )
$$;

alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_logs enable row level security;

create policy "organization members can read organizations" on public.organizations for select using (id in (select public.current_organization_ids()));
create policy "organization admins can manage organizations" on public.organizations for all using (id in (select public.current_organization_ids()) and public.has_permission('organization.manage')) with check (id in (select public.current_organization_ids()) and public.has_permission('organization.manage'));

create policy "members can read global permissions" on public.permissions for select using (auth.uid() is not null);

create policy "members can read organization profiles" on public.user_profiles for select using (organization_id in (select public.current_organization_ids()));
create policy "members can update their profile" on public.user_profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "tenant read locations" on public.locations for select using (organization_id in (select public.current_organization_ids()));
create policy "tenant manage locations" on public.locations for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('locations.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('locations.manage'));

create policy "tenant read roles" on public.roles for select using (organization_id in (select public.current_organization_ids()));
create policy "tenant manage roles" on public.roles for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('roles.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('roles.manage'));

create policy "tenant read role permissions" on public.role_permissions for select using (exists (select 1 from public.roles r where r.id = role_id and r.organization_id in (select public.current_organization_ids())));
create policy "tenant manage role permissions" on public.role_permissions for all using (exists (select 1 from public.roles r where r.id = role_id and r.organization_id in (select public.current_organization_ids())) and public.has_permission('roles.manage')) with check (exists (select 1 from public.roles r where r.id = role_id and r.organization_id in (select public.current_organization_ids())) and public.has_permission('roles.manage'));

create policy "tenant read user locations" on public.user_locations for select using (exists (select 1 from public.user_profiles up where up.id = user_id and up.organization_id in (select public.current_organization_ids())));
create policy "tenant manage user locations" on public.user_locations for all using (exists (select 1 from public.user_profiles up where up.id = user_id and up.organization_id in (select public.current_organization_ids())) and public.has_permission('staff.manage')) with check (exists (select 1 from public.user_profiles up where up.id = user_id and up.organization_id in (select public.current_organization_ids())) and public.has_permission('staff.manage'));

create policy "tenant contacts access" on public.contacts for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.write'));
create policy "tenant notes access" on public.contact_notes for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.write'));
create policy "tenant tags access" on public.tags for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.write'));
create policy "tenant contact tags access" on public.contact_tags for all using (exists (select 1 from public.contacts c where c.id = contact_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.read'))) with check (exists (select 1 from public.contacts c where c.id = contact_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('contacts.write')));

create policy "tenant pipelines access" on public.pipelines for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('opportunities.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('opportunities.write'));
create policy "tenant stages access" on public.pipeline_stages for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('opportunities.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('opportunities.write'));
create policy "tenant opportunities access" on public.opportunities for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('opportunities.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('opportunities.write'));
create policy "tenant tasks access" on public.tasks for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('tasks.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('tasks.write'));
create policy "tenant audit read" on public.audit_logs for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('audit.read'));
