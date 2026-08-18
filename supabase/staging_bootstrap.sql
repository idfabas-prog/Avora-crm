-- Dev Dashboard staging bootstrap.
--
-- Purpose:
--   Minimal tenant/user bootstrap for a fully migrated staging Supabase project.
--
-- Before running:
--   Create the staging user in Supabase Auth before running this file.
--
-- Safety:
--   - Staging/bootstrap data only.
--   - No patient data.
--   - No GoHighLevel credentials or connections.
--   - No campaign/live-send data.
--   - No full demo seed data.

do $$
declare
  staging_user_id_text constant text := 'PASTE-STAGING-USER-UUID-HERE';
  staging_user_id uuid;
  staging_user_email text;
  org_id uuid;
  miami_location_id uuid;
  owner_role_id uuid;
begin
  if staging_user_id_text = 'PASTE-STAGING-USER-UUID-HERE' then
    raise exception 'Replace PASTE-STAGING-USER-UUID-HERE with the staging Supabase Auth user UUID before running this bootstrap.';
  end if;

  staging_user_id := staging_user_id_text::uuid;

  select au.email
  into staging_user_email
  from auth.users au
  where au.id = staging_user_id;

  if staging_user_email is null then
    raise exception 'No Supabase Auth user exists for UUID %. Create the staging Auth user first, then rerun this bootstrap.', staging_user_id;
  end if;

  insert into public.organizations (name, slug)
  values ('Dev Dashboard Staging', 'avora')
  on conflict (slug) do update
  set
    name = excluded.name,
    updated_at = now()
  returning id into org_id;

  insert into public.locations (organization_id, name, slug, city, state)
  values (org_id, 'Miami Staging', 'miami', 'Miami', 'FL')
  on conflict (organization_id, slug) do update
  set
    name = excluded.name,
    city = excluded.city,
    state = excluded.state,
    updated_at = now()
  returning id into miami_location_id;

  insert into public.permissions (key, description)
  values
    ('organization.manage', 'Manage organization settings'),
    ('locations.manage', 'Manage locations'),
    ('roles.manage', 'Manage roles and permissions'),
    ('staff.manage', 'Manage staff membership'),
    ('contacts.read', 'Read contacts'),
    ('contacts.write', 'Create and update contacts'),
    ('opportunities.read', 'Read opportunities'),
    ('opportunities.write', 'Create and update opportunities'),
    ('tasks.read', 'Read tasks'),
    ('tasks.write', 'Create and update tasks'),
    ('audit.read', 'Read audit logs')
  on conflict (key) do update
  set description = excluded.description;

  insert into public.roles (organization_id, name, description)
  values
    (org_id, 'owner', 'Full staging organization owner'),
    (org_id, 'administrator', 'Staging operational administrator'),
    (org_id, 'manager', 'Staging location and team manager'),
    (org_id, 'salesperson', 'Staging sales team member'),
    (org_id, 'provider', 'Staging treatment provider')
  on conflict (organization_id, name) do update
  set
    description = excluded.description,
    updated_at = now();

  select r.id
  into owner_role_id
  from public.roles r
  where r.organization_id = org_id
    and r.name = 'owner';

  insert into public.role_permissions (role_id, permission_id)
  select owner_role_id, p.id
  from public.permissions p
  on conflict (role_id, permission_id) do nothing;

  if exists (
    select 1
    from public.user_profiles up
    where up.organization_id = org_id
      and lower(trim(up.email)) = lower(trim(staging_user_email))
      and up.id <> staging_user_id
  ) then
    raise exception 'A different user profile already uses email % in the staging organization.', staging_user_email;
  end if;

  insert into public.user_profiles (
    id,
    organization_id,
    role_id,
    full_name,
    email,
    title
  )
  values (
    staging_user_id,
    org_id,
    owner_role_id,
    'Staging Owner',
    staging_user_email,
    'Owner'
  )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    role_id = excluded.role_id,
    full_name = excluded.full_name,
    email = excluded.email,
    title = excluded.title,
    updated_at = now();

  insert into public.user_locations (user_id, location_id)
  values (staging_user_id, miami_location_id)
  on conflict (user_id, location_id) do nothing;
end $$;

select
  'staging_bootstrap_ready' as check_name,
  o.slug as organization_slug,
  l.slug as location_slug,
  up.email as owner_email,
  r.name as owner_role,
  count(rp.permission_id) as owner_permission_count
from public.organizations o
cross join (
  select nullif('PASTE-STAGING-USER-UUID-HERE', 'PASTE-STAGING-USER-UUID-HERE')::uuid as staging_user_id
) bootstrap_user
join public.locations l on l.organization_id = o.id and l.slug = 'miami'
join public.user_profiles up on up.organization_id = o.id and up.id = bootstrap_user.staging_user_id
join public.roles r on r.id = up.role_id
left join public.role_permissions rp on rp.role_id = r.id
where o.slug = 'avora'
  and up.full_name = 'Staging Owner'
  and r.name = 'owner'
group by o.slug, l.slug, up.email, r.name;

