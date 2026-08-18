with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
locations as (
  select
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1) as miami_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1) as tampa_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'jacksonville' limit 1) as jacksonville_id
),
number_seed (id, location_id, provider, external_phone_number_id, phone_number, friendly_name, supports_voice, supports_sms, active, is_primary, is_tracking_number, source_id, campaign_id) as (
  values
    ('10000000-0000-4000-8000-000000015001'::uuid, (select miami_id from locations), 'development', 'dev-phone-miami-main', '+13055550101', 'Avora Miami Main NON-LIVE test number', true, true, true, true, false, null::uuid, null::uuid),
    ('10000000-0000-4000-8000-000000015002'::uuid, (select tampa_id from locations), 'development', 'dev-phone-tampa-main', '+18135550102', 'Avora Tampa Main NON-LIVE test number', true, true, true, true, false, null::uuid, null::uuid),
    ('10000000-0000-4000-8000-000000015003'::uuid, (select jacksonville_id from locations), 'development', 'dev-phone-jax-main', '+19045550103', 'Avora Jacksonville Main NON-LIVE test number', true, true, true, true, false, null::uuid, null::uuid),
    ('10000000-0000-4000-8000-000000015004'::uuid, (select miami_id from locations), 'development', 'dev-phone-miami-meta-hair', '+13055550111', 'Miami Meta Hair Tracking NON-LIVE test number', true, true, true, false, true, '10000000-0000-4000-8000-000000008001'::uuid, '10000000-0000-4000-8000-000000008101'::uuid),
    ('10000000-0000-4000-8000-000000015005'::uuid, (select tampa_id from locations), 'development', 'dev-phone-tampa-meta-hair', '+18135550112', 'Tampa Meta Hair Tracking NON-LIVE test number', true, true, true, false, true, '10000000-0000-4000-8000-000000008001'::uuid, '10000000-0000-4000-8000-000000008102'::uuid),
    ('10000000-0000-4000-8000-000000015006'::uuid, (select jacksonville_id from locations), 'development', 'dev-phone-jax-google-hair', '+19045550113', 'Jacksonville Google Hair Tracking NON-LIVE test number', true, true, true, false, true, '10000000-0000-4000-8000-000000008002'::uuid, '10000000-0000-4000-8000-000000008103'::uuid)
)
insert into public.communication_numbers (id, organization_id, location_id, provider, external_phone_number_id, phone_number, friendly_name, supports_voice, supports_sms, active, is_primary, is_tracking_number, source_id, campaign_id, is_test_number)
select number_seed.id, org.id, number_seed.location_id, number_seed.provider, number_seed.external_phone_number_id, number_seed.phone_number, number_seed.friendly_name, number_seed.supports_voice, number_seed.supports_sms, number_seed.active, number_seed.is_primary, number_seed.is_tracking_number, number_seed.source_id, number_seed.campaign_id, true
from org
join number_seed on true
where number_seed.location_id is not null
on conflict (organization_id, provider, phone_number) do update
set location_id = excluded.location_id,
    external_phone_number_id = excluded.external_phone_number_id,
    phone_number = excluded.phone_number,
    friendly_name = excluded.friendly_name,
    supports_voice = true,
    supports_sms = excluded.supports_sms,
    active = excluded.active,
    is_primary = excluded.is_primary,
    is_tracking_number = excluded.is_tracking_number,
    source_id = excluded.source_id,
    campaign_id = excluded.campaign_id,
    is_test_number = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
disposition_seed (name, category, sort_order) as (
  values
    ('Booked Appointment', 'conversion', 10),
    ('Follow-Up Needed', 'follow_up', 20),
    ('Not Interested', 'closed_lost', 30),
    ('Wrong Number', 'invalid', 40),
    ('Left Voicemail', 'voicemail', 50),
    ('No Answer', 'no_answer', 60),
    ('Existing Patient', 'service', 70),
    ('Pricing Question', 'sales_question', 80),
    ('Financing Question', 'sales_question', 90),
    ('Reschedule', 'appointment', 100),
    ('Cancelled', 'appointment', 110),
    ('Other', 'general', 120)
)
insert into public.call_dispositions (organization_id, name, category, sort_order, active)
select org.id, disposition_seed.name, disposition_seed.category, disposition_seed.sort_order, true
from org
join disposition_seed on true
on conflict (organization_id, name) do update
set category = excluded.category,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (
  select l.slug, l.id from public.locations l join org on org.id = l.organization_id
),
queue_seed (id, location_slug, name, description, strategy, max_wait_seconds, voicemail_enabled) as (
  values
    ('10000000-0000-4000-8000-000000015101'::uuid, 'miami', 'Miami Front Desk', 'Fictional demo queue for Miami inbound calls.', 'round_robin', 45, true),
    ('10000000-0000-4000-8000-000000015102'::uuid, 'tampa', 'Tampa Front Desk', 'Fictional demo queue for Tampa inbound calls.', 'round_robin', 45, true),
    ('10000000-0000-4000-8000-000000015103'::uuid, 'jacksonville', 'Jacksonville Front Desk', 'Fictional demo queue for Jacksonville inbound calls.', 'round_robin', 45, true),
    ('10000000-0000-4000-8000-000000015104'::uuid, null, 'Sales Callback Queue', 'Fictional demo queue for missed-call and lead callbacks.', 'priority_order', 300, true)
)
insert into public.call_queues (id, organization_id, location_id, name, description, strategy, active, max_wait_seconds, voicemail_enabled)
select queue_seed.id, org.id, locations.id, queue_seed.name, queue_seed.description, queue_seed.strategy, true, queue_seed.max_wait_seconds, queue_seed.voicemail_enabled
from org
join queue_seed on true
left join locations on locations.slug = queue_seed.location_slug
on conflict (id) do update
set location_id = excluded.location_id,
    name = excluded.name,
    description = excluded.description,
    strategy = excluded.strategy,
    active = true,
    max_wait_seconds = excluded.max_wait_seconds,
    voicemail_enabled = excluded.voicemail_enabled,
    updated_at = now();

with queue_members (queue_id, email, priority) as (
  values
    ('10000000-0000-4000-8000-000000015101'::uuid, 'owner@avora-demo.com', 10),
    ('10000000-0000-4000-8000-000000015101'::uuid, 'manager@avora-demo.com', 20),
    ('10000000-0000-4000-8000-000000015102'::uuid, 'manager@avora-demo.com', 10),
    ('10000000-0000-4000-8000-000000015102'::uuid, 'sales@avora-demo.com', 20),
    ('10000000-0000-4000-8000-000000015103'::uuid, 'sales@avora-demo.com', 10),
    ('10000000-0000-4000-8000-000000015104'::uuid, 'sales@avora-demo.com', 10),
    ('10000000-0000-4000-8000-000000015104'::uuid, 'manager@avora-demo.com', 20)
)
insert into public.call_queue_members (queue_id, user_id, priority, active, available)
select queue_members.queue_id, up.id, queue_members.priority, true, true
from queue_members
join public.call_queues cq on cq.id = queue_members.queue_id
join public.user_profiles up on up.organization_id = cq.organization_id and lower(trim(up.email)) = queue_members.email
on conflict (queue_id, user_id) do update
set priority = excluded.priority,
    active = true,
    available = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org))
insert into public.call_recording_settings (organization_id, location_id, recording_enabled, consent_mode, announcement_required, retention_days)
select org.id, locations.id, false, 'not_configured', true, 90
from org
join locations on true
on conflict (organization_id, location_id) do update
set recording_enabled = false,
    consent_mode = 'not_configured',
    announcement_required = true,
    retention_days = 90,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
users as (
  select
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1) as owner_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1) as manager_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'sales@avora-demo.com' limit 1) as sales_id
),
call_seed (id, location_id, contact_id, opportunity_id, appointment_id, campaign_id, source_id, direction, provider_call_id, from_number, to_number, status, disposition_name, started_at, answered_at, ended_at, duration_seconds, ring_duration_seconds, assigned_user_id, handled_by_user_id, queue_id, transcript_status, metadata) as (
  values
    ('10000000-0000-4000-8000-000000015201'::uuid, '10000000-0000-4000-8000-000000000101'::uuid, '10000000-0000-4000-8000-000000000501'::uuid, null::uuid, null::uuid, '10000000-0000-4000-8000-000000008101'::uuid, '10000000-0000-4000-8000-000000008001'::uuid, 'inbound', 'phase15-call-miami-answered', '(305) 555-0148', '+13055550111', 'completed', 'Booked Appointment', now() - interval '5 hours', now() - interval '5 hours' + interval '12 seconds', now() - interval '5 hours' + interval '8 minutes', 468, 12, (select manager_id from users), (select manager_id from users), '10000000-0000-4000-8000-000000015101'::uuid, 'available', '{"demo":true,"booked":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015202'::uuid, '10000000-0000-4000-8000-000000000102'::uuid, '10000000-0000-4000-8000-000000000502'::uuid, null::uuid, null::uuid, '10000000-0000-4000-8000-000000008102'::uuid, '10000000-0000-4000-8000-000000008001'::uuid, 'inbound', 'phase15-call-tampa-missed', '(813) 555-0182', '+18135550112', 'missed', 'No Answer', now() - interval '4 hours', null::timestamptz, now() - interval '4 hours' + interval '51 seconds', 51, 51, (select sales_id from users), null::uuid, '10000000-0000-4000-8000-000000015102'::uuid, 'not_requested', '{"demo":true,"missed":true,"queue_timed_out":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015203'::uuid, '10000000-0000-4000-8000-000000000103'::uuid, '10000000-0000-4000-8000-000000000503'::uuid, null::uuid, null::uuid, '10000000-0000-4000-8000-000000008103'::uuid, '10000000-0000-4000-8000-000000008002'::uuid, 'inbound', 'phase15-call-jax-voicemail', '(904) 555-0129', '+19045550113', 'voicemail', 'Left Voicemail', now() - interval '3 hours', null::timestamptz, now() - interval '3 hours' + interval '2 minutes', 120, 45, (select sales_id from users), null::uuid, '10000000-0000-4000-8000-000000015103'::uuid, 'available', '{"demo":true,"voicemail":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015204'::uuid, '10000000-0000-4000-8000-000000000101'::uuid, '10000000-0000-4000-8000-000000000501'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, 'outbound', 'phase15-call-isabella-callback-connected', '+13055550101', '(305) 555-0148', 'completed', 'Follow-Up Needed', now() - interval '2 hours', now() - interval '2 hours' + interval '8 seconds', now() - interval '2 hours' + interval '6 minutes', 352, 8, (select sales_id from users), (select sales_id from users), '10000000-0000-4000-8000-000000015104'::uuid, 'available', '{"demo":true,"callback":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015205'::uuid, '10000000-0000-4000-8000-000000000103'::uuid, '10000000-0000-4000-8000-000000000503'::uuid, null::uuid, null::uuid, null::uuid, null::uuid, 'outbound', 'phase15-call-danielle-no-answer', '+19045550103', '(904) 555-0129', 'no_answer', 'No Answer', now() - interval '90 minutes', null::timestamptz, now() - interval '90 minutes' + interval '35 seconds', 35, 35, (select sales_id from users), (select sales_id from users), '10000000-0000-4000-8000-000000015104'::uuid, 'not_requested', '{"demo":true,"power_dialer":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015206'::uuid, '10000000-0000-4000-8000-000000000101'::uuid, '10000000-0000-4000-8000-000000000501'::uuid, null::uuid, null::uuid, '10000000-0000-4000-8000-000000008101'::uuid, '10000000-0000-4000-8000-000000008001'::uuid, 'inbound', 'phase15-call-miami-booking-attribution', '(305) 555-0148', '+13055550111', 'completed', 'Booked Appointment', now() - interval '7 days', now() - interval '7 days' + interval '10 seconds', now() - interval '7 days' + interval '9 minutes', 530, 10, (select manager_id from users), (select manager_id from users), '10000000-0000-4000-8000-000000015101'::uuid, 'available', '{"demo":true,"booking_attribution":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015207'::uuid, '10000000-0000-4000-8000-000000000102'::uuid, '10000000-0000-4000-8000-000000000502'::uuid, null::uuid, null::uuid, '10000000-0000-4000-8000-000000008102'::uuid, '10000000-0000-4000-8000-000000008001'::uuid, 'inbound', 'phase15-call-tampa-sale-attribution', '(813) 555-0182', '+18135550112', 'completed', 'Booked Appointment', now() - interval '10 days', now() - interval '10 days' + interval '9 seconds', now() - interval '10 days' + interval '11 minutes', 651, 9, (select sales_id from users), (select sales_id from users), '10000000-0000-4000-8000-000000015102'::uuid, 'available', '{"demo":true,"sale_attribution":true}'::jsonb)
)
insert into public.calls (id, organization_id, location_id, contact_id, opportunity_id, appointment_id, campaign_id, marketing_source_id, direction, provider, provider_call_id, from_number, to_number, status, disposition, disposition_id, started_at, answered_at, ended_at, duration_seconds, ring_duration_seconds, assigned_user_id, handled_by_user_id, queue_id, transcript_status, simulated, metadata)
select call_seed.id, org.id, call_seed.location_id, call_seed.contact_id, call_seed.opportunity_id, call_seed.appointment_id, call_seed.campaign_id, call_seed.source_id, call_seed.direction, 'development', call_seed.provider_call_id, call_seed.from_number, call_seed.to_number, call_seed.status, call_seed.disposition_name, cd.id, call_seed.started_at, call_seed.answered_at, call_seed.ended_at, call_seed.duration_seconds, call_seed.ring_duration_seconds, call_seed.assigned_user_id, call_seed.handled_by_user_id, call_seed.queue_id, call_seed.transcript_status, true, call_seed.metadata
from org
join call_seed on true
left join public.call_dispositions cd on cd.organization_id = org.id and cd.name = call_seed.disposition_name
on conflict (id) do update
set location_id = excluded.location_id,
    contact_id = excluded.contact_id,
    campaign_id = excluded.campaign_id,
    marketing_source_id = excluded.marketing_source_id,
    status = excluded.status,
    disposition = excluded.disposition,
    disposition_id = excluded.disposition_id,
    answered_at = excluded.answered_at,
    ended_at = excluded.ended_at,
    duration_seconds = excluded.duration_seconds,
    ring_duration_seconds = excluded.ring_duration_seconds,
    assigned_user_id = excluded.assigned_user_id,
    handled_by_user_id = excluded.handled_by_user_id,
    queue_id = excluded.queue_id,
    transcript_status = excluded.transcript_status,
    simulated = true,
    metadata = excluded.metadata,
    updated_at = now();

with queue_event_seed (call_id, queue_id, event_type, user_email, event_at_offset_seconds, metadata) as (
  values
    ('10000000-0000-4000-8000-000000015201'::uuid, '10000000-0000-4000-8000-000000015101'::uuid, 'entered_queue', null, 0, '{"demo":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015201'::uuid, '10000000-0000-4000-8000-000000015101'::uuid, 'accepted', 'manager@avora-demo.com', 12, '{"demo":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015202'::uuid, '10000000-0000-4000-8000-000000015102'::uuid, 'entered_queue', null, 0, '{"demo":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015202'::uuid, '10000000-0000-4000-8000-000000015102'::uuid, 'timed_out', null, 51, '{"demo":true}'::jsonb),
    ('10000000-0000-4000-8000-000000015203'::uuid, '10000000-0000-4000-8000-000000015103'::uuid, 'voicemail', null, 120, '{"demo":true}'::jsonb)
)
insert into public.call_queue_events (organization_id, call_id, queue_id, event_type, user_id, event_at, metadata)
select c.organization_id, queue_event_seed.call_id, queue_event_seed.queue_id, queue_event_seed.event_type, up.id, c.started_at + make_interval(secs => queue_event_seed.event_at_offset_seconds), queue_event_seed.metadata
from queue_event_seed
join public.calls c on c.id = queue_event_seed.call_id
left join public.user_profiles up on up.organization_id = c.organization_id and lower(trim(up.email)) = queue_event_seed.user_email
where not exists (
  select 1
  from public.call_queue_events existing
  where existing.call_id = queue_event_seed.call_id
    and existing.queue_id = queue_event_seed.queue_id
    and existing.event_type = queue_event_seed.event_type
    and existing.event_at = c.started_at + make_interval(secs => queue_event_seed.event_at_offset_seconds)
);

insert into public.missed_call_callbacks (id, organization_id, location_id, call_id, contact_id, assigned_to, status, priority, due_at, idempotency_key)
select '10000000-0000-4000-8000-000000015301'::uuid, c.organization_id, c.location_id, c.id, c.contact_id, c.assigned_user_id, 'assigned', 88, c.started_at + interval '15 minutes', 'phase15-missed-callback-tampa'
from public.calls c
where c.id = '10000000-0000-4000-8000-000000015202'
on conflict (call_id) do update
set assigned_to = excluded.assigned_to,
    status = excluded.status,
    priority = excluded.priority,
    due_at = excluded.due_at,
    idempotency_key = excluded.idempotency_key,
    updated_at = now();

insert into public.voicemails (id, organization_id, location_id, call_id, contact_id, provider_voicemail_id, storage_path, duration_seconds, transcript_text, transcript_status, simulated)
select '10000000-0000-4000-8000-000000015401'::uuid, c.organization_id, c.location_id, c.id, c.contact_id, 'phase15-voicemail-jax-demo', null, 42, 'Fictional voicemail: Hi, this is Danielle. I am calling about hair restoration availability and financing options.', 'available', true
from public.calls c
where c.id = '10000000-0000-4000-8000-000000015203'
on conflict (id) do update
set transcript_text = excluded.transcript_text,
    transcript_status = 'available',
    simulated = true;

with recording_seed (id, call_id, provider_recording_id, duration_seconds, consent_status, recording_status) as (
  values
    ('10000000-0000-4000-8000-000000015501'::uuid, '10000000-0000-4000-8000-000000015201'::uuid, 'phase15-recording-miami-answered', 468, 'announced', 'restricted'),
    ('10000000-0000-4000-8000-000000015502'::uuid, '10000000-0000-4000-8000-000000015204'::uuid, 'phase15-recording-isabella-callback', 352, 'announced', 'restricted'),
    ('10000000-0000-4000-8000-000000015503'::uuid, '10000000-0000-4000-8000-000000015207'::uuid, 'phase15-recording-tampa-sale', 651, 'announced', 'restricted')
)
insert into public.call_recordings (id, organization_id, call_id, provider_recording_id, storage_bucket, storage_path, duration_seconds, consent_status, recording_status, simulated)
select recording_seed.id, c.organization_id, c.id, recording_seed.provider_recording_id, null, null, recording_seed.duration_seconds, recording_seed.consent_status, recording_seed.recording_status, true
from recording_seed
join public.calls c on c.id = recording_seed.call_id
on conflict (id) do update
set duration_seconds = excluded.duration_seconds,
    consent_status = excluded.consent_status,
    recording_status = excluded.recording_status,
    storage_bucket = null,
    storage_path = null,
    simulated = true,
    updated_at = now();

with transcript_seed (id, call_id, recording_id, transcript_text, summary_json) as (
  values
    ('10000000-0000-4000-8000-000000015601'::uuid, '10000000-0000-4000-8000-000000015201'::uuid, '10000000-0000-4000-8000-000000015501'::uuid, 'Fictional transcript: Caller asked about Miami hair restoration consultation times, financing, and recovery timeline. Staff answered pricing ranges, confirmed financing is available, and offered the next consultation opening.', '{"caller_intent":"Book a consultation","key_questions":["Pricing range","Financing availability","Recovery timeline"],"appointment_outcome":"Booked appointment follow-up","follow_up_needed":true,"ai_inference":"Engaged"}'::jsonb),
    ('10000000-0000-4000-8000-000000015602'::uuid, '10000000-0000-4000-8000-000000015204'::uuid, '10000000-0000-4000-8000-000000015502'::uuid, 'Fictional transcript: Sales callback reviewed prior consultation questions. Caller wanted a second review of package options. Staff agreed to send a written summary and follow up tomorrow.', '{"caller_intent":"Compare package options","key_questions":["Package value","Next steps"],"appointment_outcome":"Follow-up needed","follow_up_needed":true,"ai_inference":"Neutral"}'::jsonb),
    ('10000000-0000-4000-8000-000000015603'::uuid, '10000000-0000-4000-8000-000000015207'::uuid, '10000000-0000-4000-8000-000000015503'::uuid, 'Fictional transcript: Caller asked about Tampa hair restoration financing after seeing the Meta campaign. Staff explained next steps and collected a simulated financing payment later in the journey.', '{"caller_intent":"Purchase after consultation","key_questions":["Financing","Scheduling"],"appointment_outcome":"Sale attributed","follow_up_needed":false,"ai_inference":"Engaged"}'::jsonb)
)
insert into public.call_transcripts (id, organization_id, call_id, recording_id, transcript_text, language, confidence, provider, status, summary_json, simulated)
select transcript_seed.id, c.organization_id, transcript_seed.call_id, transcript_seed.recording_id, transcript_seed.transcript_text, 'en', 0.97, 'development', 'available', transcript_seed.summary_json, true
from transcript_seed
join public.calls c on c.id = transcript_seed.call_id
on conflict (call_id, provider) do update
set recording_id = excluded.recording_id,
    transcript_text = excluded.transcript_text,
    language = excluded.language,
    confidence = excluded.confidence,
    status = 'available',
    summary_json = excluded.summary_json,
    simulated = true,
    updated_at = now();

update public.calls c
set recording_id = cr.id,
    transcript_status = 'available',
    updated_at = now()
from public.call_recordings cr
where cr.call_id = c.id
  and c.id in ('10000000-0000-4000-8000-000000015201', '10000000-0000-4000-8000-000000015204', '10000000-0000-4000-8000-000000015207');

update public.calls c
set voicemail_id = v.id,
    transcript_status = 'available',
    updated_at = now()
from public.voicemails v
where v.call_id = c.id
  and c.id = '10000000-0000-4000-8000-000000015203';

with attribution_seed (call_id, attribution_type, source_id, campaign_id, appointment_id, sale_id, revenue_cents, refund_cents) as (
  values
    ('10000000-0000-4000-8000-000000015201'::uuid, 'tracking_number', '10000000-0000-4000-8000-000000008001'::uuid, '10000000-0000-4000-8000-000000008101'::uuid, null::uuid, null::uuid, 0, 0),
    ('10000000-0000-4000-8000-000000015202'::uuid, 'tracking_number', '10000000-0000-4000-8000-000000008001'::uuid, '10000000-0000-4000-8000-000000008102'::uuid, null::uuid, null::uuid, 0, 0),
    ('10000000-0000-4000-8000-000000015203'::uuid, 'tracking_number', '10000000-0000-4000-8000-000000008002'::uuid, '10000000-0000-4000-8000-000000008103'::uuid, null::uuid, null::uuid, 0, 0),
    ('10000000-0000-4000-8000-000000015206'::uuid, 'booking', '10000000-0000-4000-8000-000000008001'::uuid, '10000000-0000-4000-8000-000000008101'::uuid, null::uuid, null::uuid, 0, 0),
    ('10000000-0000-4000-8000-000000015207'::uuid, 'sale', '10000000-0000-4000-8000-000000008001'::uuid, '10000000-0000-4000-8000-000000008102'::uuid, null::uuid, '10000000-0000-4000-8000-000000001002'::uuid, 650000, 0)
)
insert into public.call_attributions (organization_id, call_id, source_id, campaign_id, appointment_id, sale_id, attribution_type, revenue_cents, refund_cents)
select c.organization_id, attribution_seed.call_id, attribution_seed.source_id, attribution_seed.campaign_id, attribution_seed.appointment_id, attribution_seed.sale_id, attribution_seed.attribution_type, attribution_seed.revenue_cents, attribution_seed.refund_cents
from attribution_seed
join public.calls c on c.id = attribution_seed.call_id
on conflict (call_id, attribution_type) do update
set source_id = excluded.source_id,
    campaign_id = excluded.campaign_id,
    appointment_id = excluded.appointment_id,
    sale_id = excluded.sale_id,
    revenue_cents = excluded.revenue_cents,
    refund_cents = excluded.refund_cents;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
owner_user as (
  select up.id
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  join org on org.id = up.organization_id
  where lower(trim(up.email)) = 'owner@avora-demo.com' or lower(trim(r.name)) = 'owner'
  order by case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end, up.created_at
  limit 1
),
list_seed (id, name, static, status, require_disposition) as (
  values
    ('10000000-0000-4000-8000-000000015701'::uuid, 'Phase 15 Missed Call Recovery Demo', true, 'active', true),
    ('10000000-0000-4000-8000-000000015702'::uuid, 'Phase 15 Hair Lead Power Dialer Demo', true, 'draft', true)
)
insert into public.call_lists (id, organization_id, name, static, status, require_disposition, created_by)
select list_seed.id, org.id, list_seed.name, list_seed.static, list_seed.status, list_seed.require_disposition, owner_user.id
from org
cross join owner_user
join list_seed on true
on conflict (id) do update
set name = excluded.name,
    static = excluded.static,
    status = excluded.status,
    require_disposition = excluded.require_disposition,
    updated_at = now();

insert into public.call_list_members (call_list_id, contact_id, order_index, status, last_call_id)
values
  ('10000000-0000-4000-8000-000000015701'::uuid, '10000000-0000-4000-8000-000000000502'::uuid, 1, 'pending', '10000000-0000-4000-8000-000000015202'::uuid),
  ('10000000-0000-4000-8000-000000015701'::uuid, '10000000-0000-4000-8000-000000000503'::uuid, 2, 'pending', '10000000-0000-4000-8000-000000015203'::uuid),
  ('10000000-0000-4000-8000-000000015702'::uuid, '10000000-0000-4000-8000-000000000501'::uuid, 1, 'connected', '10000000-0000-4000-8000-000000015204'::uuid),
  ('10000000-0000-4000-8000-000000015702'::uuid, '10000000-0000-4000-8000-000000000502'::uuid, 2, 'pending', null),
  ('10000000-0000-4000-8000-000000015702'::uuid, '10000000-0000-4000-8000-000000000503'::uuid, 3, 'no_answer', '10000000-0000-4000-8000-000000015205'::uuid)
on conflict (call_list_id, contact_id) do update
set order_index = excluded.order_index,
    status = excluded.status,
    last_call_id = excluded.last_call_id,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
script_seed (name, category, body) as (
  values
    ('Hair Lead Callback', 'sales', 'Hi {{first_name}}, this is Avora {{location_name}} returning your call about hair restoration. What questions can I answer today?'),
    ('No-Show Follow-Up', 'appointment', 'Hi {{first_name}}, this is Avora. We missed you at your consultation and can help reschedule at a convenient time.'),
    ('Financing Follow-Up', 'sales', 'Hi {{first_name}}, following up on financing options we discussed. I can walk through next steps when you are ready.'),
    ('Reactivation Call', 'reactivation', 'Hi {{first_name}}, Avora is checking in. We have appointment options if you would like to reconnect with the team.')
)
insert into public.call_scripts (organization_id, name, category, body, active)
select org.id, script_seed.name, script_seed.category, script_seed.body, true
from org
join script_seed on true
on conflict (organization_id, name) do update
set category = excluded.category,
    body = excluded.body,
    active = true,
    updated_at = now();

insert into public.call_notes (organization_id, call_id, contact_id, author_id, body)
select c.organization_id, c.id, c.contact_id, c.handled_by_user_id, 'Fictional demo note: caller requested a written follow-up with pricing and financing options.'
from public.calls c
where c.id = '10000000-0000-4000-8000-000000015204'
  and not exists (
    select 1 from public.call_notes cn
    where cn.call_id = c.id
      and cn.body = 'Fictional demo note: caller requested a written follow-up with pricing and financing options.'
  );

with webhook_seed (organization_id, provider, provider_event_id, event_type, call_id, payload_hash, status, processed_at) as (
  select c.organization_id, 'development', 'phase15-webhook-tampa-missed', 'call.completed', c.id, 'sha256-demo-tampa-missed', 'processed', now()
  from public.calls c
  where c.id = '10000000-0000-4000-8000-000000015202'
)
insert into public.call_webhook_events (organization_id, provider, provider_event_id, event_type, call_id, payload_hash, status, processed_at)
select organization_id, provider, provider_event_id, event_type, call_id, payload_hash, status, processed_at
from webhook_seed
on conflict (provider, provider_event_id) do update
set event_type = excluded.event_type,
    call_id = excluded.call_id,
    payload_hash = excluded.payload_hash,
    status = excluded.status,
    processed_at = excluded.processed_at;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  join org on org.id = up.organization_id
  where lower(trim(up.email)) = 'owner@avora-demo.com' or lower(trim(r.name)) = 'owner'
  order by case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end, up.created_at
  limit 1
),
workflow_seed as (
  select
    'Missed Call Recovery'::text as name,
    'Draft demo workflow for missed-call text-back, callback task creation, and second-touch follow-up. It is not active after seed.'::text as description,
    'internal_operations'::text as category,
    '{
      "nodes": [
        {"id":"trigger_missed_call","type":"trigger","position":{"x":360,"y":40},"configuration":{"trigger_type":"call.missed","filters":[]}},
        {"id":"wait_1m","type":"wait","position":{"x":360,"y":170},"configuration":{"amount":1,"unit":"minute"}},
        {"id":"sms_missed_call","type":"action","position":{"x":360,"y":300},"configuration":{"action_type":"send_sms","body":"Hi {{first_name}}, we just missed your call at Avora {{location_name}}. How can we help?","simulated":true}},
        {"id":"task_callback","type":"action","position":{"x":360,"y":430},"configuration":{"action_type":"create_task","title":"Call back {{first_name}} after missed call","due":{"amount":15,"unit":"minute"}}},
        {"id":"wait_1d","type":"wait","position":{"x":360,"y":560},"configuration":{"amount":1,"unit":"day"}},
        {"id":"if_no_contact","type":"condition","position":{"x":360,"y":690},"configuration":{"field":"call.callback_status","operator":"not_in","value":["connected","booked","closed"]}},
        {"id":"task_second_touch","type":"action","position":{"x":230,"y":820},"configuration":{"action_type":"create_task","title":"Second missed-call follow-up for {{first_name}}","due":{"amount":1,"unit":"day","time":"09:00"}}}
      ],
      "edges": [
        {"source":"trigger_missed_call","target":"wait_1m","label":"TRIGGER"},
        {"source":"wait_1m","target":"sms_missed_call","label":"RESUME"},
        {"source":"sms_missed_call","target":"task_callback","label":"SUCCESS"},
        {"source":"task_callback","target":"wait_1d","label":"SUCCESS"},
        {"source":"wait_1d","target":"if_no_contact","label":"RESUME"},
        {"source":"if_no_contact","target":"task_second_touch","label":"YES"}
      ]
    }'::jsonb as definition_json
),
upserted_workflows as (
  insert into public.workflows (organization_id, name, description, category, status, location_scope, enrollment_policy, re_enrollment_policy, failure_policy, test_mode, created_by, updated_by)
  select owner_user.organization_id, workflow_seed.name, workflow_seed.description, workflow_seed.category, 'draft', 'all', 'one_active_per_contact', 'after_completion', 'retry_then_stop', true, owner_user.id, owner_user.id
  from owner_user
  cross join workflow_seed
  on conflict (organization_id, name) do update
  set description = excluded.description,
      category = excluded.category,
      status = 'draft',
      active_version_id = null,
      published_at = null,
      test_mode = true,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning id, organization_id, name, updated_by as owner_user_id
),
upserted_versions as (
  insert into public.workflow_versions (workflow_id, version_number, definition_json, status, validation_snapshot, created_by)
  select upserted_workflows.id, 1, workflow_seed.definition_json, 'draft', '{"seeded":true,"phase":15,"starter_template":true}'::jsonb, upserted_workflows.owner_user_id
  from upserted_workflows
  cross join workflow_seed
  on conflict (workflow_id, version_number) do update
  set definition_json = excluded.definition_json,
      status = 'draft',
      validation_snapshot = excluded.validation_snapshot,
      published_at = null
  returning id
)
select
  (select count(*) from upserted_workflows) as missed_call_workflows_inserted_or_updated,
  (select count(*) from upserted_versions) as missed_call_workflow_versions_inserted_or_updated;

-- Verification queries after rerunning this seed:
-- select count(*) as phase15_tracking_numbers from public.communication_numbers cn join public.organizations o on o.id = cn.organization_id where lower(trim(o.slug)) = 'avora' and cn.external_phone_number_id like 'dev-phone-%';
-- select count(*) as phase15_dispositions from public.call_dispositions cd join public.organizations o on o.id = cd.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_queues from public.call_queues cq join public.organizations o on o.id = cq.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_calls from public.calls c join public.organizations o on o.id = c.organization_id where lower(trim(o.slug)) = 'avora' and c.provider_call_id like 'phase15-call-%';
-- select count(*) as phase15_missed_callbacks from public.missed_call_callbacks mcc join public.organizations o on o.id = mcc.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_voicemails from public.voicemails v join public.organizations o on o.id = v.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_recordings from public.call_recordings cr join public.organizations o on o.id = cr.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_transcripts from public.call_transcripts ct join public.organizations o on o.id = ct.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_call_attributions from public.call_attributions ca join public.organizations o on o.id = ca.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_call_lists from public.call_lists cl join public.organizations o on o.id = cl.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_call_list_members from public.call_list_members clm join public.call_lists cl on cl.id = clm.call_list_id join public.organizations o on o.id = cl.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_call_scripts from public.call_scripts cs join public.organizations o on o.id = cs.organization_id where lower(trim(o.slug)) = 'avora';
-- select count(*) as phase15_call_webhook_events from public.call_webhook_events cwe join public.organizations o on o.id = cwe.organization_id where lower(trim(o.slug)) = 'avora';
-- select w.name, w.status, w.active_version_id, wv.version_number, wv.status as version_status from public.workflows w join public.workflow_versions wv on wv.workflow_id = w.id join public.organizations o on o.id = w.organization_id where lower(trim(o.slug)) = 'avora' and w.name = 'Missed Call Recovery';
