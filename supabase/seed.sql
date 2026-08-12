insert into public.organizations (id, name, slug)
values ('10000000-0000-4000-8000-000000000001', 'Avora', 'avora')
on conflict (slug) do nothing;

insert into public.locations (id, organization_id, name, slug, city, state)
values
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', 'Miami', 'miami', 'Miami', 'FL'),
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001', 'Tampa', 'tampa', 'Tampa', 'FL'),
  ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000001', 'Jacksonville', 'jacksonville', 'Jacksonville', 'FL')
on conflict (organization_id, slug) do nothing;

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
on conflict (key) do nothing;

insert into public.roles (id, organization_id, name, description)
values
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', 'owner', 'Full organization owner'),
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000001', 'administrator', 'Operational administrator'),
  ('10000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000001', 'manager', 'Location and team manager'),
  ('10000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000001', 'salesperson', 'Sales team member'),
  ('10000000-0000-4000-8000-000000000205', '10000000-0000-4000-8000-000000000001', 'provider', 'Treatment provider')
on conflict (organization_id, name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.organization_id = '10000000-0000-4000-8000-000000000001'
  and (
    r.name in ('owner', 'administrator')
    or (r.name = 'manager' and p.key in ('contacts.read', 'contacts.write', 'opportunities.read', 'opportunities.write', 'tasks.read', 'tasks.write', 'staff.manage'))
    or (r.name = 'salesperson' and p.key in ('contacts.read', 'contacts.write', 'opportunities.read', 'opportunities.write', 'tasks.read', 'tasks.write'))
    or (r.name = 'provider' and p.key in ('contacts.read', 'opportunities.read', 'tasks.read', 'tasks.write'))
  )
on conflict do nothing;

insert into public.pipelines (id, organization_id, name)
values ('10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000001', 'Hair Restoration')
on conflict (organization_id, name) do nothing;

insert into public.pipeline_stages (id, organization_id, pipeline_id, name, position, is_closed, is_won)
values
  ('10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'New Lead', 1, false, false),
  ('10000000-0000-4000-8000-000000000402', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Contacted', 2, false, false),
  ('10000000-0000-4000-8000-000000000403', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Consult Booked', 3, false, false),
  ('10000000-0000-4000-8000-000000000404', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Confirmed', 4, false, false),
  ('10000000-0000-4000-8000-000000000405', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Showed', 5, false, false),
  ('10000000-0000-4000-8000-000000000406', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Proposal', 6, false, false),
  ('10000000-0000-4000-8000-000000000407', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Sold', 7, true, true),
  ('10000000-0000-4000-8000-000000000408', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Treatment', 8, false, false),
  ('10000000-0000-4000-8000-000000000409', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Follow-Up', 9, false, false),
  ('10000000-0000-4000-8000-000000000410', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Lost', 10, true, false),
  ('10000000-0000-4000-8000-000000000411', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000301', 'Not Candidate', 11, true, false)
on conflict (pipeline_id, position) do nothing;

-- Create matching Auth users first, then update these IDs or insert profiles
-- from your live Supabase user IDs.
insert into public.contacts (id, organization_id, location_id, first_name, last_name, phone, email, lead_source, status, lifetime_value_cents, last_activity_at)
values
  ('10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 'Isabella', 'Martin', '(305) 555-0148', 'isabella.m@example.com', 'Meta Ads', 'consult_booked', 1240000, now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000102', 'Camila', 'Stone', '(813) 555-0182', 'camila.s@example.com', 'Referral', 'sold', 1890000, now() - interval '2 hours'),
  ('10000000-0000-4000-8000-000000000503', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000103', 'Danielle', 'Cross', '(904) 555-0129', 'danielle.c@example.com', 'Google Search', 'contacted', 0, now() - interval '3 hours')
on conflict do nothing;

insert into public.opportunities (organization_id, location_id, contact_id, pipeline_id, stage_id, name, value_cents, status, last_activity_at)
values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000501', '10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000403', 'Hair Restoration - Isabella Martin', 1240000, 'open', now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000502', '10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000407', 'Hair Restoration - Camila Stone', 1890000, 'won', now() - interval '2 hours'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000503', '10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000402', 'Hair Restoration - Danielle Cross', 960000, 'open', now() - interval '3 hours');

insert into public.tasks (organization_id, location_id, contact_id, title, status, due_at)
values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000501', 'Confirm consult reminders', 'open', now() + interval '1 day'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000502', 'Send treatment prep checklist', 'open', now() + interval '2 days');
