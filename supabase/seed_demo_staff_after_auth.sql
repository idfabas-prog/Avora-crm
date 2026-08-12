-- Run after creating matching Supabase Auth users with these fictional emails:
-- maya.bennett@avora.example, sofia.reyes@avora.example,
-- julian.hart@avora.example, nina.caldwell@avora.example.

with demo_staff(email, full_name, title, role_name) as (
  values
    ('maya.bennett@avora.example', 'Maya Bennett', 'Revenue Director', 'owner'),
    ('sofia.reyes@avora.example', 'Sofia Reyes', 'Sales Manager', 'manager'),
    ('julian.hart@avora.example', 'Julian Hart', 'Senior Sales Consultant', 'salesperson'),
    ('nina.caldwell@avora.example', 'Nina Caldwell', 'Patient Success Lead', 'administrator')
)
insert into public.user_profiles (id, organization_id, role_id, full_name, email, title)
select
  au.id,
  '10000000-0000-4000-8000-000000000001',
  r.id,
  ds.full_name,
  ds.email,
  ds.title
from demo_staff ds
join auth.users au on au.email = ds.email
join public.roles r
  on r.organization_id = '10000000-0000-4000-8000-000000000001'
 and r.name = ds.role_name
on conflict (id) do update
set
  role_id = excluded.role_id,
  full_name = excluded.full_name,
  email = excluded.email,
  title = excluded.title;

insert into public.user_locations (user_id, location_id)
select up.id, l.id
from public.user_profiles up
join public.locations l on l.organization_id = up.organization_id
where up.email in (
  'maya.bennett@avora.example',
  'sofia.reyes@avora.example',
  'julian.hart@avora.example',
  'nina.caldwell@avora.example'
)
on conflict do nothing;
