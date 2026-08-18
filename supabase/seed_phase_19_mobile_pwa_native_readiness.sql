with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
)
insert into public.mobile_settings (id, organization_id, pwa_enabled, patient_mobile_enabled, staff_mobile_enabled, push_enabled, install_prompt_enabled, role_navigation_json, native_readiness_json)
select
  '10000000-0000-4000-8000-000000019001'::uuid,
  org.id,
  true,
  true,
  true,
  false,
  true,
  '{"owner":["Home","Executive","Tasks","Calls","More"],"manager":["Home","Executive","Tasks","Calls","More"],"provider":["Today","Patients","Clinical","Tasks","More"],"salesperson":["Leads","Follow-Up","Calls","Tasks","More"],"patient":["Home","Appointments","Packages","Payments","More"]}'::jsonb,
  '{"capacitor_ready":true,"biometrics_future":true,"secure_storage_future":true,"no_native_binary":true}'::jsonb
from org
on conflict (organization_id) do update
set pwa_enabled = excluded.pwa_enabled,
    patient_mobile_enabled = excluded.patient_mobile_enabled,
    staff_mobile_enabled = excluded.staff_mobile_enabled,
    push_enabled = excluded.push_enabled,
    install_prompt_enabled = excluded.install_prompt_enabled,
    role_navigation_json = excluded.role_navigation_json,
    native_readiness_json = excluded.native_readiness_json,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
users as (
  select id, email from public.user_profiles where organization_id = (select id from org) and email in ('owner@avora-demo.com', 'provider@avora-demo.com', 'manager@avora-demo.com') order by email
),
patient as (
  select pa.id
  from public.patient_accounts pa
  join public.contacts c on c.id = pa.contact_id
  where pa.organization_id = (select id from org)
  order by c.created_at
  limit 1
)
insert into public.device_registrations (id, organization_id, user_id, patient_account_id, device_name, device_type, platform, push_provider, push_token_encrypted_or_server_only, active, push_enabled, last_seen_at, metadata_safe)
select seed.id, (select id from org), u.id, null::uuid, seed.device_name, seed.device_type, seed.platform, 'development', seed.token, true, seed.push_enabled, seed.last_seen_at, seed.metadata
from (
  values
    ('10000000-0000-4000-8000-000000019101'::uuid, 'owner@avora-demo.com', 'Owner iPhone Demo', 'phone', 'ios', 'demo-token-owner-not-real', true, '2026-08-14 13:00:00+00'::timestamptz, '{"demo":true,"fictional_device":true}'::jsonb),
    ('10000000-0000-4000-8000-000000019102'::uuid, 'provider@avora-demo.com', 'Provider iPhone Demo', 'phone', 'ios', 'demo-token-provider-not-real', true, '2026-08-14 13:05:00+00'::timestamptz, '{"demo":true,"fictional_device":true}'::jsonb),
    ('10000000-0000-4000-8000-000000019103'::uuid, 'manager@avora-demo.com', 'Front Desk iPad Demo', 'tablet', 'ipad', 'demo-token-front-desk-not-real', false, '2026-08-14 13:10:00+00'::timestamptz, '{"demo":true,"fictional_device":true}'::jsonb)
) as seed(id, email, device_name, device_type, platform, token, push_enabled, last_seen_at, metadata)
join users u on u.email = seed.email
on conflict (organization_id, user_id, lower(device_name)) where user_id is not null do update
set device_type = excluded.device_type,
    platform = excluded.platform,
    push_provider = excluded.push_provider,
    push_token_encrypted_or_server_only = excluded.push_token_encrypted_or_server_only,
    active = excluded.active,
    push_enabled = excluded.push_enabled,
    last_seen_at = excluded.last_seen_at,
    metadata_safe = excluded.metadata_safe,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
patient as (
  select pa.id
  from public.patient_accounts pa
  join public.contacts c on c.id = pa.contact_id
  where pa.organization_id = (select id from org)
  order by c.created_at
  limit 1
)
insert into public.device_registrations (id, organization_id, user_id, patient_account_id, device_name, device_type, platform, push_provider, push_token_encrypted_or_server_only, active, push_enabled, last_seen_at, metadata_safe)
select '10000000-0000-4000-8000-000000019104'::uuid, (select id from org), null::uuid, patient.id, 'Patient iPhone Demo', 'phone', 'ios', 'development', 'demo-token-patient-not-real', true, false, '2026-08-14 13:15:00+00'::timestamptz, '{"demo":true,"fictional_device":true}'::jsonb
from patient
on conflict (organization_id, patient_account_id, lower(device_name)) where patient_account_id is not null do update
set platform = excluded.platform,
    push_provider = excluded.push_provider,
    push_token_encrypted_or_server_only = excluded.push_token_encrypted_or_server_only,
    active = excluded.active,
    push_enabled = excluded.push_enabled,
    last_seen_at = excluded.last_seen_at,
    metadata_safe = excluded.metadata_safe,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
users as (select id, email from public.user_profiles where organization_id = (select id from org) and email in ('owner@avora-demo.com', 'manager@avora-demo.com', 'sales@avora-demo.com', 'provider@avora-demo.com')),
patient as (
  select pa.id from public.patient_accounts pa where pa.organization_id = (select id from org) order by pa.created_at limit 1
)
insert into public.mobile_notification_preferences (organization_id, user_id, patient_account_id, appointments, tasks, calls, messages, payments, campaigns, workforce, inventory, executive)
select (select id from org), u.id, null::uuid, true, true, true, true, false, false, true, true, u.email in ('owner@avora-demo.com', 'manager@avora-demo.com')
from users u
on conflict (organization_id, user_id) where user_id is not null do update
set appointments = excluded.appointments,
    tasks = excluded.tasks,
    calls = excluded.calls,
    messages = excluded.messages,
    payments = excluded.payments,
    campaigns = excluded.campaigns,
    workforce = excluded.workforce,
    inventory = excluded.inventory,
    executive = excluded.executive,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
patient as (
  select pa.id from public.patient_accounts pa where pa.organization_id = (select id from org) order by pa.created_at limit 1
)
insert into public.mobile_notification_preferences (organization_id, user_id, patient_account_id, appointments, tasks, calls, messages, payments, campaigns, workforce, inventory, executive)
select (select id from org), null::uuid, patient.id, true, false, false, true, true, false, false, false, false
from patient
on conflict (organization_id, patient_account_id) where patient_account_id is not null do update
set appointments = excluded.appointments,
    messages = excluded.messages,
    payments = excluded.payments,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
users as (select id, email from public.user_profiles where organization_id = (select id from org) and email in ('owner@avora-demo.com', 'provider@avora-demo.com', 'sales@avora-demo.com'))
insert into public.mobile_notifications (id, organization_id, user_id, patient_account_id, notification_type, title, body_safe, status, deep_link, metadata_safe)
select seed.id, (select id from org), u.id, null::uuid, seed.type, seed.title, seed.body, seed.status, seed.deep_link, '{"demo":true,"no_sensitive_payload":true}'::jsonb
from (
  values
    ('10000000-0000-4000-8000-000000019201'::uuid, 'owner@avora-demo.com', 'executive_alert', 'Executive alert', 'A location needs review in Avora.', 'unread', '/executive/alerts'),
    ('10000000-0000-4000-8000-000000019202'::uuid, 'provider@avora-demo.com', 'appointment_reminder', 'Appointment reminder', 'You have an upcoming Avora appointment.', 'unread', '/mobile/provider'),
    ('10000000-0000-4000-8000-000000019203'::uuid, 'sales@avora-demo.com', 'task_assigned', 'Task assigned', 'A new Avora task is ready.', 'read', '/mobile/tasks')
) as seed(id, email, type, title, body, status, deep_link)
join users u on u.email = seed.email
on conflict (id) do update
set notification_type = excluded.notification_type,
    title = excluded.title,
    body_safe = excluded.body_safe,
    status = excluded.status,
    deep_link = excluded.deep_link,
    metadata_safe = excluded.metadata_safe,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
patient as (select pa.id from public.patient_accounts pa where pa.organization_id = (select id from org) order by pa.created_at limit 1)
insert into public.mobile_notifications (id, organization_id, user_id, patient_account_id, notification_type, title, body_safe, status, deep_link, metadata_safe)
select '10000000-0000-4000-8000-000000019204'::uuid, (select id from org), null::uuid, patient.id, 'package_remaining', 'Package update', 'Your Avora package has an update.', 'unread', '/portal/packages', '{"demo":true,"no_sensitive_payload":true}'::jsonb
from patient
on conflict (id) do update
set title = excluded.title,
    body_safe = excluded.body_safe,
    status = excluded.status,
    deep_link = excluded.deep_link,
    metadata_safe = excluded.metadata_safe,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
provider_user as (select id from public.user_profiles where organization_id = (select id from org) and email = 'provider@avora-demo.com' limit 1)
insert into public.mobile_drafts (id, organization_id, user_id, patient_account_id, draft_type, route, entity_table, entity_id, draft_payload, sensitivity, expires_at)
select '10000000-0000-4000-8000-000000019301'::uuid, (select id from org), provider_user.id, null::uuid, 'clinical_note', '/clinical/sessions/demo', 'treatment_sessions', null::uuid, '{"note":"Fictional demo draft note. No real patient information."}'::jsonb, 'clinical', now() + interval '7 days'
from provider_user
on conflict (organization_id, user_id, draft_type, route, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)) where user_id is not null and discarded_at is null do update
set draft_payload = excluded.draft_payload,
    sensitivity = excluded.sensitivity,
    expires_at = excluded.expires_at,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
users as (select id, email from public.user_profiles where organization_id = (select id from org) and email in ('owner@avora-demo.com', 'provider@avora-demo.com', 'sales@avora-demo.com'))
insert into public.mobile_app_events (id, organization_id, user_id, patient_account_id, event_type, platform, route, metadata_safe, created_at)
select seed.id, (select id from org), u.id, null::uuid, seed.event_type, seed.platform, seed.route, seed.metadata, seed.created_at
from (
  values
    ('10000000-0000-4000-8000-000000019401'::uuid, 'owner@avora-demo.com', 'pwa_installed', 'ios', '/mobile', '{"demo":true}'::jsonb, '2026-08-14 13:20:00+00'::timestamptz),
    ('10000000-0000-4000-8000-000000019402'::uuid, 'provider@avora-demo.com', 'mobile_session', 'ios', '/mobile/provider', '{"demo":true}'::jsonb, '2026-08-14 13:25:00+00'::timestamptz),
    ('10000000-0000-4000-8000-000000019403'::uuid, 'sales@avora-demo.com', 'quick_action_used', 'web', '/mobile/contacts', '{"demo":true,"action":"contact_search"}'::jsonb, '2026-08-14 13:30:00+00'::timestamptz)
) as seed(id, email, event_type, platform, route, metadata, created_at)
join users u on u.email = seed.email
on conflict (id) do update
set event_type = excluded.event_type,
    platform = excluded.platform,
    route = excluded.route,
    metadata_safe = excluded.metadata_safe;

-- Verification queries for Supabase SQL Editor:
-- select count(*) as phase19_mobile_settings from public.mobile_settings ms join public.organizations o on o.id = ms.organization_id where o.slug = 'avora';
-- select count(*) as phase19_device_registrations from public.device_registrations dr join public.organizations o on o.id = dr.organization_id where o.slug = 'avora';
-- select count(*) as phase19_notification_preferences from public.mobile_notification_preferences mnp join public.organizations o on o.id = mnp.organization_id where o.slug = 'avora';
-- select count(*) as phase19_mobile_notifications from public.mobile_notifications mn join public.organizations o on o.id = mn.organization_id where o.slug = 'avora';
-- select count(*) as phase19_mobile_drafts from public.mobile_drafts md join public.organizations o on o.id = md.organization_id where o.slug = 'avora';
-- select count(*) as phase19_mobile_app_events from public.mobile_app_events mae join public.organizations o on o.id = mae.organization_id where o.slug = 'avora';
