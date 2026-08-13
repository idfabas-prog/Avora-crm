with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
  limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join org on org.id = up.organization_id
  left join public.roles r on r.id = up.role_id
  where lower(trim(up.email)) = 'owner@avora-demo.com' or lower(trim(r.name)) = 'owner'
  order by case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end
  limit 1
),
provider_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join org on org.id = up.organization_id
  left join public.roles r on r.id = up.role_id
  where lower(trim(up.email)) = 'provider@avora-demo.com' or lower(trim(r.name)) = 'provider'
  order by case when lower(trim(up.email)) = 'provider@avora-demo.com' then 0 else 1 end
  limit 1
),
seed_settings (service_name, requires_consent, requires_photo_tracking, default_followup_days) as (
  values
    ('Hair Restoration Treatment', true, true, 7),
    ('T-Shape Treatment', true, true, 7),
    ('NeoGen Treatment', true, true, 14),
    ('Botox', true, false, 14),
    ('Dermal Filler', true, false, 14)
)
insert into public.clinical_service_settings (organization_id, service_id, requires_clinical_session, requires_consent, requires_photo_tracking, requires_provider, allow_package_entitlement, default_followup_days, entitlement_policy, warning_only_missing_consent, active)
select org.id, services.id, true, seed_settings.requires_consent, seed_settings.requires_photo_tracking, true, true, seed_settings.default_followup_days, 'after_successful_payment', true, true
from org
join public.services services on services.organization_id = org.id
join seed_settings on seed_settings.service_name = services.name
on conflict (organization_id, service_id) do update
set requires_consent = excluded.requires_consent,
    requires_photo_tracking = excluded.requires_photo_tracking,
    default_followup_days = excluded.default_followup_days,
    active = true;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
owner_user as (
  select up.id
  from public.user_profiles up
  join org on org.id = up.organization_id
  where lower(trim(up.email)) = 'owner@avora-demo.com'
  limit 1
),
template_seed (service_name, name, fields) as (
  values
    ('Hair Restoration Treatment', 'Demo Hair Restoration Session', '["Treatment Area","Session Number","Product","Volume","Injection Technique","Scalp Condition","Patient Tolerance","Immediate Reaction","Aftercare","Follow-Up Date","Provider Notes"]'::jsonb),
    ('T-Shape Treatment', 'Demo T-Shape Session', '["Treatment Area","Session Number","Duration","Device Settings","Treatment Goal","Skin Response","Patient Tolerance","Aftercare","Provider Notes"]'::jsonb),
    ('NeoGen Treatment', 'Demo NeoGen Session', '["Treatment Area","Energy/Setting","Number of Passes","Pre-Treatment Skin Status","Immediate Skin Response","Aftercare","Follow-Up","Provider Notes"]'::jsonb),
    ('Botox', 'Demo Injectable Session', '["Product","Treatment Area","Units/Volume","Lot Number","Expiration","Injection Sites","Patient Tolerance","Aftercare","Follow-Up"]'::jsonb),
    ('Dermal Filler', 'Demo Filler Session', '["Product","Treatment Area","Volume","Lot Number","Injection Sites","Patient Tolerance","Aftercare","Follow-Up"]'::jsonb)
)
insert into public.clinical_templates (organization_id, service_id, name, template_type, schema_json, active, created_by)
select org.id, services.id, template_seed.name, 'treatment_documentation',
       jsonb_build_object('demo', true, 'fields', template_seed.fields),
       true, owner_user.id
from org
cross join owner_user
join template_seed on true
join public.services services on services.organization_id = org.id and services.name = template_seed.service_name
on conflict (organization_id, service_id, name, template_type) do update
set schema_json = excluded.schema_json, active = true, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
owner_user as (
  select up.id from public.user_profiles up join org on org.id = up.organization_id where lower(trim(up.email)) = 'owner@avora-demo.com' limit 1
),
consent_seed (service_name, name, consent_type, content_text) as (
  values
    ('Hair Restoration Treatment', 'Demo Hair Restoration Treatment Consent', 'treatment', 'Fictional development consent acknowledgment for hair restoration treatment.'),
    ('Hair Restoration Treatment', 'Demo Clinical Photography Consent', 'clinical_photo', 'Fictional development consent acknowledgment for internal clinical photos.'),
    ('T-Shape Treatment', 'Demo T-Shape Treatment Consent', 'treatment', 'Fictional development consent acknowledgment for T-Shape treatment.'),
    ('NeoGen Treatment', 'Demo NeoGen Treatment Consent', 'treatment', 'Fictional development consent acknowledgment for NeoGen treatment.'),
    ('Botox', 'Demo Injectable Treatment Consent', 'treatment', 'Fictional development consent acknowledgment for injectable treatment.')
)
insert into public.consent_templates (organization_id, service_id, name, version, content_text, consent_type, active, created_by)
select org.id, services.id, consent_seed.name, 1, consent_seed.content_text, consent_seed.consent_type, true, owner_user.id
from org
cross join owner_user
join consent_seed on true
join public.services services on services.organization_id = org.id and services.name = consent_seed.service_name
on conflict (organization_id, service_id, name, version) do update
set content_text = excluded.content_text, consent_type = excluded.consent_type, active = true, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1)
insert into public.clinical_profiles (organization_id, contact_id, primary_location_id, clinical_status)
select org.id, contacts.id, contacts.location_id, 'active'
from org
join public.contacts contacts on contacts.organization_id = org.id
where lower(trim(contacts.email)) in ('isabella.m@example.com', 'camila.s@example.com', 'danielle.c@example.com')
on conflict (organization_id, contact_id) do update
set primary_location_id = excluded.primary_location_id,
    clinical_status = excluded.clinical_status,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
entitlements (id, sale_item_id, service_name, total_quantity, status) as (
  values
    ('10000000-0000-4000-8000-000000007001'::uuid, '10000000-0000-4000-8000-000000001101'::uuid, 'Hair Restoration Treatment', 3, 'active'),
    ('10000000-0000-4000-8000-000000007002'::uuid, '10000000-0000-4000-8000-000000001102'::uuid, 'Hair Restoration Treatment', 4, 'active'),
    ('10000000-0000-4000-8000-000000007003'::uuid, '10000000-0000-4000-8000-000000001103'::uuid, 'Hair Restoration Treatment', 2, 'active')
)
insert into public.package_entitlements (id, organization_id, location_id, contact_id, sale_id, sale_item_id, package_id, service_id, entitlement_type, total_quantity, used_quantity, remaining_quantity, status, purchased_at)
select entitlements.id, sales.organization_id, sales.location_id, sales.contact_id, sales.id, sale_items.id, sale_items.package_id, services.id, 'treatment_session', entitlements.total_quantity, 0, entitlements.total_quantity, entitlements.status, sales.sale_date
from entitlements
join public.sale_items sale_items on sale_items.id = entitlements.sale_item_id
join public.sales sales on sales.id = sale_items.sale_id
join org on org.id = sales.organization_id
join public.services services on services.organization_id = org.id and services.name = entitlements.service_name
on conflict (id) do update
set location_id = excluded.location_id,
    contact_id = excluded.contact_id,
    sale_id = excluded.sale_id,
    sale_item_id = excluded.sale_item_id,
    package_id = excluded.package_id,
    service_id = excluded.service_id,
    total_quantity = excluded.total_quantity,
    status = case when public.package_entitlements.status in ('cancelled', 'refunded') then public.package_entitlements.status else excluded.status end,
    updated_at = now();

insert into public.treatment_entitlement_events (id, organization_id, entitlement_id, event_type, quantity, reason, created_by)
select grant_ids.id, pe.organization_id, pe.id, 'grant', pe.total_quantity, 'Fictional Phase 7 seed entitlement grant.', owner_user.id
from (
  values
    ('10000000-0000-4000-8000-000000007101'::uuid, '10000000-0000-4000-8000-000000007001'::uuid),
    ('10000000-0000-4000-8000-000000007102'::uuid, '10000000-0000-4000-8000-000000007002'::uuid),
    ('10000000-0000-4000-8000-000000007103'::uuid, '10000000-0000-4000-8000-000000007003'::uuid)
) as grant_ids(id, entitlement_id)
join public.package_entitlements pe on pe.id = grant_ids.entitlement_id
left join public.user_profiles owner_user on owner_user.organization_id = pe.organization_id and lower(trim(owner_user.email)) = 'owner@avora-demo.com'
on conflict (id) do nothing;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
provider_user as (
  select up.id from public.user_profiles up join org on org.id = up.organization_id where lower(trim(up.email)) = 'provider@avora-demo.com' limit 1
),
owner_user as (
  select up.id from public.user_profiles up join org on org.id = up.organization_id where lower(trim(up.email)) = 'owner@avora-demo.com' limit 1
),
target_contact as (
  select contacts.id, contacts.location_id
  from public.contacts contacts
  join org on org.id = contacts.organization_id
  where lower(trim(contacts.email)) = 'isabella.m@example.com'
  limit 1
)
insert into public.treatment_plans (id, organization_id, location_id, contact_id, provider_id, name, description, status, start_date, target_completion_date, created_by)
select '10000000-0000-4000-8000-000000007201'::uuid, org.id, target_contact.location_id, target_contact.id, provider_user.id, 'Fictional Hair Restoration Plan', 'Demo operational plan for a three-session hair restoration package.', 'active', current_date - 7, current_date + 60, owner_user.id
from org
cross join target_contact
left join provider_user on true
left join owner_user on true
on conflict (id) do update
set provider_id = excluded.provider_id, status = excluded.status, updated_at = now();

insert into public.treatment_plan_items (id, treatment_plan_id, service_id, package_entitlement_id, planned_sessions, interval_days, notes)
select '10000000-0000-4000-8000-000000007211'::uuid, tp.id, pe.service_id, pe.id, 3, 30, 'Fictional Phase 7 plan item linked to purchased package entitlement.'
from public.treatment_plans tp
join public.package_entitlements pe on pe.id = '10000000-0000-4000-8000-000000007001'
where tp.id = '10000000-0000-4000-8000-000000007201'
on conflict (id) do update
set package_entitlement_id = excluded.package_entitlement_id, planned_sessions = excluded.planned_sessions, interval_days = excluded.interval_days, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
provider_user as (
  select up.id from public.user_profiles up join org on org.id = up.organization_id where lower(trim(up.email)) = 'provider@avora-demo.com' limit 1
),
owner_user as (
  select up.id from public.user_profiles up join org on org.id = up.organization_id where lower(trim(up.email)) = 'owner@avora-demo.com' limit 1
),
session_seed (id, contact_email, location_slug, service_name, plan_id, plan_item_id, entitlement_id, status, documentation_status, scheduled_at, started_at, completed_at, session_number, treatment_area, clinical_summary, aftercare_plan, followup_plan) as (
  values
    ('10000000-0000-4000-8000-000000007301'::uuid, 'isabella.m@example.com', 'miami', 'Hair Restoration Treatment', '10000000-0000-4000-8000-000000007201'::uuid, '10000000-0000-4000-8000-000000007211'::uuid, '10000000-0000-4000-8000-000000007001'::uuid, 'completed', 'signed', now() - interval '2 days', now() - interval '2 days' + interval '5 minutes', now() - interval '2 days' + interval '65 minutes', 1, 'Scalp crown', 'Fictional completed session documented for development testing.', 'Fictional aftercare instructions reviewed.', 'One-week development follow-up.'),
    ('10000000-0000-4000-8000-000000007302'::uuid, 'isabella.m@example.com', 'miami', 'Hair Restoration Treatment', '10000000-0000-4000-8000-000000007201'::uuid, '10000000-0000-4000-8000-000000007211'::uuid, '10000000-0000-4000-8000-000000007001'::uuid, 'scheduled', 'draft', now() + interval '28 days', null, null, 2, 'Scalp crown', null, null, null),
    ('10000000-0000-4000-8000-000000007303'::uuid, 'danielle.c@example.com', 'jacksonville', 'T-Shape Treatment', null, null, null, 'completed', 'signed', now() - interval '1 day', now() - interval '1 day' + interval '10 minutes', now() - interval '1 day' + interval '55 minutes', 1, 'Abdomen', 'Fictional completed T-Shape session for development testing.', 'Fictional hydration and aftercare reviewed.', 'One-week progress check.'),
    ('10000000-0000-4000-8000-000000007304'::uuid, 'camila.s@example.com', 'tampa', 'NeoGen Treatment', null, null, null, 'scheduled', 'draft', now() + interval '3 days', null, null, 1, 'Face', null, null, 'NeoGen follow-up planned.')
)
insert into public.treatment_sessions (id, organization_id, location_id, contact_id, treatment_plan_id, treatment_plan_item_id, package_entitlement_id, service_id, provider_id, status, documentation_status, scheduled_at, started_at, completed_at, signed_at, signed_by, session_number, treatment_area, documentation_json, clinical_summary, aftercare_plan, followup_plan, created_by)
select session_seed.id, org.id, locations.id, contacts.id, session_seed.plan_id, session_seed.plan_item_id, session_seed.entitlement_id, services.id, provider_user.id, session_seed.status, session_seed.documentation_status, session_seed.scheduled_at, session_seed.started_at, session_seed.completed_at, case when session_seed.documentation_status = 'signed' then session_seed.completed_at else null end, case when session_seed.documentation_status = 'signed' then provider_user.id else null end, session_seed.session_number, session_seed.treatment_area, '{"demo":true,"structured_documentation":"fictional development entry"}'::jsonb, session_seed.clinical_summary, session_seed.aftercare_plan, session_seed.followup_plan, owner_user.id
from org
join session_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = session_seed.contact_email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = session_seed.location_slug
join public.services services on services.organization_id = org.id and services.name = session_seed.service_name
left join provider_user on true
left join owner_user on true
on conflict (id) do update
set status = excluded.status,
    documentation_status = excluded.documentation_status,
    clinical_summary = excluded.clinical_summary,
    documentation_json = excluded.documentation_json,
    updated_at = now();

insert into public.treatment_entitlement_events (id, organization_id, entitlement_id, treatment_session_id, event_type, quantity, reason, created_by)
select '10000000-0000-4000-8000-000000007111'::uuid, pe.organization_id, pe.id, ts.id, 'use', 1, 'Fictional Phase 7 completed session consumed one treatment.', ts.provider_id
from public.package_entitlements pe
join public.treatment_sessions ts on ts.id = '10000000-0000-4000-8000-000000007301'
where pe.id = '10000000-0000-4000-8000-000000007001'
on conflict (id) do nothing;

insert into public.consent_records (id, organization_id, location_id, contact_id, consent_template_id, consent_template_version, treatment_session_id, signed_by_name, signed_at, signature_reference, status, simulated_signature)
select '10000000-0000-4000-8000-000000007401'::uuid, ts.organization_id, ts.location_id, ts.contact_id, ct.id, ct.version, ts.id, 'Isabella Martin', ts.started_at, 'simulated-dev-signature-isabella', 'signed', true
from public.treatment_sessions ts
join public.consent_templates ct on ct.organization_id = ts.organization_id and ct.service_id = ts.service_id and ct.consent_type = 'treatment'
where ts.id = '10000000-0000-4000-8000-000000007301'
on conflict (id) do update
set signed_at = excluded.signed_at, status = excluded.status, simulated_signature = true, updated_at = now();

insert into public.clinical_notes (id, organization_id, location_id, contact_id, treatment_session_id, treatment_plan_id, author_user_id, note_type, body, locked_at, signed_at, signed_by)
select '10000000-0000-4000-8000-000000007501'::uuid, ts.organization_id, ts.location_id, ts.contact_id, ts.id, ts.treatment_plan_id, ts.provider_id, 'treatment', 'Fictional provider note for development testing. Patient tolerated the documented session and aftercare was reviewed.', ts.completed_at, ts.completed_at, ts.provider_id
from public.treatment_sessions ts
where ts.id = '10000000-0000-4000-8000-000000007301'
on conflict (id) do update
set body = excluded.body;

insert into public.treatment_followups (id, organization_id, location_id, contact_id, treatment_session_id, provider_id, due_at, status, followup_type, notes)
select '10000000-0000-4000-8000-000000007601'::uuid, ts.organization_id, ts.location_id, ts.contact_id, ts.id, ts.provider_id, ts.completed_at + interval '7 days', 'due', '1-week follow-up', 'Fictional follow-up generated by Phase 7 seed.'
from public.treatment_sessions ts
where ts.id = '10000000-0000-4000-8000-000000007301'
on conflict (organization_id, treatment_session_id, followup_type, due_at) do update
set status = excluded.status, notes = excluded.notes, updated_at = now();

insert into public.clinical_photos (id, organization_id, location_id, contact_id, treatment_session_id, service_id, photo_type, body_area, capture_date, storage_path, uploaded_by, notes)
select photos.id, ts.organization_id, ts.location_id, ts.contact_id, ts.id, ts.service_id, photos.photo_type, ts.treatment_area, current_date - photos.days_ago, photos.storage_path, ts.provider_id, 'Fictional private storage metadata only.'
from (
  values
    ('10000000-0000-4000-8000-000000007701'::uuid, 'before', 2, 'avora/demo/isabella-hair-before.jpg'),
    ('10000000-0000-4000-8000-000000007702'::uuid, 'after', 2, 'avora/demo/isabella-hair-after-session-1.jpg')
) as photos(id, photo_type, days_ago, storage_path)
join public.treatment_sessions ts on ts.id = '10000000-0000-4000-8000-000000007301'
on conflict (id) do update
set photo_type = excluded.photo_type, notes = excluded.notes;

insert into public.clinical_documents (id, organization_id, location_id, contact_id, treatment_session_id, treatment_plan_id, document_type, filename, storage_path, uploaded_by, description, sensitive, status)
select '10000000-0000-4000-8000-000000007801'::uuid, ts.organization_id, ts.location_id, ts.contact_id, ts.id, ts.treatment_plan_id, 'treatment_document', 'demo-hair-session-summary.pdf', 'avora/demo/demo-hair-session-summary.pdf', ts.provider_id, 'Fictional treatment summary metadata only.', true, 'active'
from public.treatment_sessions ts
where ts.id = '10000000-0000-4000-8000-000000007301'
on conflict (id) do update
set description = excluded.description, status = excluded.status;

insert into public.domain_events (organization_id, event_type, entity_type, entity_id, idempotency_key, payload, occurred_at)
select ts.organization_id, 'treatment.completed', 'treatment_session', ts.id, 'seed-phase-7-treatment-completed-' || ts.id::text, jsonb_build_object('demo', true, 'treatment_session_id', ts.id, 'contact_id', ts.contact_id), ts.completed_at
from public.treatment_sessions ts
where ts.id in ('10000000-0000-4000-8000-000000007301', '10000000-0000-4000-8000-000000007303')
on conflict (organization_id, idempotency_key) do nothing;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
owner_user as (
  select up.id from public.user_profiles up join org on org.id = up.organization_id where lower(trim(up.email)) = 'owner@avora-demo.com' limit 1
),
upserted_workflow as (
  insert into public.workflows (id, organization_id, name, description, category, status, test_mode, created_by, updated_by)
  select '10000000-0000-4000-8000-000000007901'::uuid, org.id, 'Treatment Completion Follow-Up', 'Draft Phase 7 workflow: wait 24 hours after treatment completion, then create a follow-up task. Fictional development seed.', 'treatment_follow_up', 'draft', true, owner_user.id, owner_user.id
  from org
  cross join owner_user
  on conflict (organization_id, name) do update
  set description = excluded.description, status = 'draft', test_mode = true, updated_by = excluded.updated_by, updated_at = now()
  returning id, organization_id, created_by
)
insert into public.workflow_versions (workflow_id, version_number, definition_json, status, created_by)
select upserted_workflow.id, 1,
  '{
    "nodes":[
      {"id":"trigger","type":"trigger","configuration":{"trigger_type":"treatment.completed","label":"Treatment Session Completed"}},
      {"id":"wait-24h","type":"wait","configuration":{"wait_type":"duration","amount":24,"unit":"hours"}},
      {"id":"task","type":"action","configuration":{"action_type":"create_task","title":"Complete treatment follow-up","status":"open"}}
    ],
    "edges":[
      {"source":"trigger","target":"wait-24h","label":"SUCCESS"},
      {"source":"wait-24h","target":"task","label":"RESUME"}
    ]
  }'::jsonb,
  'draft',
  upserted_workflow.created_by
from upserted_workflow
on conflict (workflow_id, version_number) do update
set definition_json = excluded.definition_json, status = 'draft';

select
  (select count(*) from public.clinical_templates ct join public.organizations o on o.id = ct.organization_id where lower(trim(o.slug)) = 'avora') as clinical_templates,
  (select count(*) from public.consent_templates ct join public.organizations o on o.id = ct.organization_id where lower(trim(o.slug)) = 'avora') as consent_templates,
  (select count(*) from public.package_entitlements pe join public.organizations o on o.id = pe.organization_id where lower(trim(o.slug)) = 'avora') as package_entitlements,
  (select count(*) from public.treatment_sessions ts join public.organizations o on o.id = ts.organization_id where lower(trim(o.slug)) = 'avora') as treatment_sessions,
  (select count(*) from public.treatment_entitlement_events tee join public.organizations o on o.id = tee.organization_id where lower(trim(o.slug)) = 'avora') as entitlement_events;
