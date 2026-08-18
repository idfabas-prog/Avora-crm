-- Phase 12 development seed. Reputation, feedback, referrals, rewards, loyalty, and reactivation rows are fictional/demo data only.
-- This seed does not call live review APIs, post review responses, send bulk messages, or issue real monetary rewards.

do $$
begin
  if not exists (
    select 1
    from public.organizations
    where lower(trim(slug)) = 'avora'
       or lower(trim(name)) = 'avora'
       or id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Phase 12 seed could not find the Avora organization.';
  end if;
end;
$$;

with org as (
  select id from public.organizations
  where lower(trim(slug)) = 'avora' or lower(trim(name)) = 'avora' or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
source_seed (id, name, provider, location_slug, external_location_id, review_url) as (
  values
    ('10000000-0000-4000-8000-000000012101'::uuid, 'Google Business Profile Miami', 'Google', 'miami', 'demo-gbp-miami', 'https://reviews.example.com/avora/miami'),
    ('10000000-0000-4000-8000-000000012102'::uuid, 'Google Business Profile Tampa', 'Google', 'tampa', 'demo-gbp-tampa', 'https://reviews.example.com/avora/tampa'),
    ('10000000-0000-4000-8000-000000012103'::uuid, 'Google Business Profile Jacksonville', 'Google', 'jacksonville', 'demo-gbp-jacksonville', 'https://reviews.example.com/avora/jacksonville'),
    ('10000000-0000-4000-8000-000000012104'::uuid, 'Avora Internal Feedback', 'Internal', null, null, 'https://demo.avora.local/feedback')
)
insert into public.review_sources (id, organization_id, name, provider, external_location_id, review_url, active)
select source_seed.id, org.id, source_seed.name, source_seed.provider, source_seed.external_location_id, source_seed.review_url, true
from org
join source_seed on true
on conflict (organization_id, name) do update
set provider = excluded.provider,
    external_location_id = excluded.external_location_id,
    review_url = excluded.review_url,
    active = true,
    updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
mapping_seed (location_slug, source_name) as (
  values
    ('miami', 'Google Business Profile Miami'),
    ('tampa', 'Google Business Profile Tampa'),
    ('jacksonville', 'Google Business Profile Jacksonville')
)
insert into public.location_review_sources (organization_id, location_id, review_source_id, is_default, active)
select org.id, locations.id, review_sources.id, true, true
from org
join mapping_seed on true
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = mapping_seed.location_slug
join public.review_sources review_sources on review_sources.organization_id = org.id and review_sources.name = mapping_seed.source_name
on conflict (location_id, review_source_id) do update
set is_default = true,
    active = true,
    updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
template_seed (id, name, channel, body) as (
  values
    ('10000000-0000-4000-8000-000000012111'::uuid, 'Balanced SMS Feedback Request', 'sms', 'Hi {{first_name}}, thank you for visiting Avora {{location_name}}. If you have a moment, we would appreciate your honest feedback.'),
    ('10000000-0000-4000-8000-000000012112'::uuid, 'Portal Feedback Request', 'patient_portal', 'Thank you for choosing Avora {{location_name}}. Please share honest feedback about your visit when convenient.'),
    ('10000000-0000-4000-8000-000000012113'::uuid, 'Internal Feedback Link', 'internal_link', 'Share your Avora experience so our team can keep improving.')
)
insert into public.review_request_templates (id, organization_id, name, channel, body, active, metadata)
select template_seed.id, org.id, template_seed.name, template_seed.channel, template_seed.body, true, '{"demo":true,"no_review_gating":true}'::jsonb
from org
join template_seed on true
on conflict (organization_id, name, channel) do update
set body = excluded.body,
    active = true,
    metadata = excluded.metadata,
    updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
survey_seed (id, name, survey_type, csat_scale_min, csat_scale_max, questions_json) as (
  values
    ('10000000-0000-4000-8000-000000012201'::uuid, 'Demo NPS Survey', 'NPS', 1, 5, '[{"key":"nps","label":"How likely are you to recommend Avora?","type":"nps","scale":[0,10]}]'::jsonb),
    ('10000000-0000-4000-8000-000000012202'::uuid, 'Demo CSAT Survey', 'CSAT', 1, 5, '[{"key":"csat","label":"How satisfied were you with your visit?","type":"rating","scale":[1,5]}]'::jsonb),
    ('10000000-0000-4000-8000-000000012203'::uuid, 'Treatment Experience Feedback', 'Treatment Experience', 1, 5, '[{"key":"care","label":"Tell us about your treatment experience.","type":"text"}]'::jsonb)
)
insert into public.feedback_surveys (id, organization_id, name, survey_type, csat_scale_min, csat_scale_max, active, questions_json)
select survey_seed.id, org.id, survey_seed.name, survey_seed.survey_type, survey_seed.csat_scale_min, survey_seed.csat_scale_max, true, survey_seed.questions_json
from org
join survey_seed on true
on conflict (organization_id, name) do update
set survey_type = excluded.survey_type,
    csat_scale_min = excluded.csat_scale_min,
    csat_scale_max = excluded.csat_scale_max,
    active = true,
    questions_json = excluded.questions_json,
    updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
program as (
  insert into public.referral_programs (id, organization_id, name, description, reward_type, reward_value, active, start_date)
  select '10000000-0000-4000-8000-000000012501'::uuid, org.id, 'Demo Patient Referral Program', 'Fictional development referral program. Rewards are ledgered and not paid automatically.', 'credit', 5000, true, current_date - 30
  from org
  on conflict (organization_id, name) do update
  set description = excluded.description,
      reward_type = excluded.reward_type,
      reward_value = excluded.reward_value,
      active = true,
      updated_at = now()
  returning id, organization_id
),
default_rows as (
  select org.id as organization_id,
    '10000000-0000-4000-8000-000000012102'::uuid as source_id,
    '10000000-0000-4000-8000-000000012201'::uuid as survey_id,
    '10000000-0000-4000-8000-000000012501'::uuid as program_id
  from org
)
insert into public.reputation_settings (id, organization_id, location_id, review_requests_enabled, review_request_cooldown_days, default_review_source_id, default_survey_id, negative_nps_threshold, negative_csat_threshold, referral_program_id, reactivation_defaults)
select '10000000-0000-4000-8000-000000012001'::uuid, default_rows.organization_id, null, true, 90, default_rows.source_id, default_rows.survey_id, 6, 2, default_rows.program_id, '{"inactive_days":180,"demo_mode":true}'::jsonb
from default_rows
on conflict (id) do update
set review_requests_enabled = excluded.review_requests_enabled,
    review_request_cooldown_days = excluded.review_request_cooldown_days,
    default_review_source_id = excluded.default_review_source_id,
    default_survey_id = excluded.default_survey_id,
    negative_nps_threshold = excluded.negative_nps_threshold,
    negative_csat_threshold = excluded.negative_csat_threshold,
    referral_program_id = excluded.referral_program_id,
    reactivation_defaults = excluded.reactivation_defaults,
    updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1),
review_seed (id, email, location_slug, appointment_id, treatment_session_id, sale_id, channel, status, source_id, sent_offset, completed_offset, reason) as (
  values
    ('10000000-0000-4000-8000-000000012301'::uuid, 'isabella.m@example.com', 'miami', null::uuid, '10000000-0000-4000-8000-000000007301'::uuid, '10000000-0000-4000-8000-000000001001'::uuid, 'sms', 'completed', '10000000-0000-4000-8000-000000012101'::uuid, interval '2 days', interval '1 day 20 hours', 'Completed treatment'),
    ('10000000-0000-4000-8000-000000012302'::uuid, 'camila.s@example.com', 'tampa', null::uuid, null::uuid, '10000000-0000-4000-8000-000000001002'::uuid, 'patient_portal', 'sent', '10000000-0000-4000-8000-000000012102'::uuid, interval '3 days', null, 'Successful payment'),
    ('10000000-0000-4000-8000-000000012303'::uuid, 'danielle.c@example.com', 'jacksonville', null::uuid, '10000000-0000-4000-8000-000000007303'::uuid, '10000000-0000-4000-8000-000000001003'::uuid, 'sms', 'clicked', '10000000-0000-4000-8000-000000012103'::uuid, interval '1 day', null, 'Completed treatment')
)
insert into public.review_requests (id, organization_id, location_id, contact_id, appointment_id, treatment_session_id, sale_id, requested_by, request_channel, status, review_source_id, template_id, sent_at, opened_at, clicked_at, completed_at, external_review_id, eligibility_reason, metadata)
select review_seed.id, org.id, locations.id, contacts.id, review_seed.appointment_id, review_seed.treatment_session_id, review_seed.sale_id, owner_user.id, review_seed.channel, review_seed.status, review_seed.source_id, '10000000-0000-4000-8000-000000012111'::uuid,
  now() - review_seed.sent_offset,
  case when review_seed.status in ('opened', 'clicked', 'completed') then now() - review_seed.sent_offset + interval '1 hour' else null end,
  case when review_seed.status in ('clicked', 'completed') then now() - review_seed.sent_offset + interval '2 hours' else null end,
  case when review_seed.completed_offset is null then null else now() - review_seed.completed_offset end,
  case when review_seed.status = 'completed' then 'demo-external-review-isabella' else null end,
  review_seed.reason,
  '{"demo":true,"ethical_request":true}'::jsonb
from org
join review_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = review_seed.email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = review_seed.location_slug
left join owner_user on true
on conflict (id) do update
set status = excluded.status,
    sent_at = excluded.sent_at,
    opened_at = excluded.opened_at,
    clicked_at = excluded.clicked_at,
    completed_at = excluded.completed_at,
    eligibility_reason = excluded.eligibility_reason,
    metadata = excluded.metadata,
    updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
provider_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'provider@avora-demo.com' limit 1),
response_seed (id, email, location_slug, survey_id, request_id, treatment_session_id, service_name, score, rating, response_text, submitted_offset) as (
  values
    ('10000000-0000-4000-8000-000000012401'::uuid, 'isabella.m@example.com', 'miami', '10000000-0000-4000-8000-000000012201'::uuid, '10000000-0000-4000-8000-000000012301'::uuid, '10000000-0000-4000-8000-000000007301'::uuid, 'Hair Restoration Treatment', 10, null::integer, 'Fictional promoter NPS response for development.', interval '1 day 20 hours'),
    ('10000000-0000-4000-8000-000000012402'::uuid, 'camila.s@example.com', 'tampa', '10000000-0000-4000-8000-000000012201'::uuid, null::uuid, null::uuid, 'NeoGen Treatment', 8, null::integer, 'Fictional passive NPS response for development.', interval '2 days'),
    ('10000000-0000-4000-8000-000000012403'::uuid, 'danielle.c@example.com', 'jacksonville', '10000000-0000-4000-8000-000000012201'::uuid, '10000000-0000-4000-8000-000000012303'::uuid, '10000000-0000-4000-8000-000000007303'::uuid, 'T-Shape Treatment', 4, null::integer, 'Fictional detractor response for recovery workflow testing.', interval '12 hours'),
    ('10000000-0000-4000-8000-000000012404'::uuid, 'isabella.m@example.com', 'miami', '10000000-0000-4000-8000-000000012202'::uuid, null::uuid, '10000000-0000-4000-8000-000000007301'::uuid, 'Hair Restoration Treatment', null::integer, 5, 'Fictional positive CSAT response.', interval '1 day'),
    ('10000000-0000-4000-8000-000000012405'::uuid, 'danielle.c@example.com', 'jacksonville', '10000000-0000-4000-8000-000000012202'::uuid, null::uuid, '10000000-0000-4000-8000-000000007303'::uuid, 'T-Shape Treatment', null::integer, 2, 'Fictional negative CSAT response for escalation testing.', interval '10 hours')
)
insert into public.feedback_responses (id, organization_id, location_id, contact_id, survey_id, review_request_id, treatment_session_id, provider_id, service_id, score, rating, response_text, submitted_at, metadata)
select response_seed.id, org.id, locations.id, contacts.id, response_seed.survey_id, response_seed.request_id, response_seed.treatment_session_id, provider_user.id, services.id, response_seed.score, response_seed.rating, response_seed.response_text, now() - response_seed.submitted_offset, '{"demo":true}'::jsonb
from org
join response_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = response_seed.email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = response_seed.location_slug
left join provider_user on true
left join public.services services on services.organization_id = org.id and services.name = response_seed.service_name
on conflict (id) do update
set score = excluded.score,
    rating = excluded.rating,
    response_text = excluded.response_text,
    submitted_at = excluded.submitted_at,
    metadata = excluded.metadata;

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
manager_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1),
danielle as (select id, location_id from public.contacts where organization_id = (select id from org) and lower(trim(email)) = 'danielle.c@example.com' limit 1)
insert into public.feedback_escalations (id, organization_id, location_id, contact_id, feedback_response_id, severity, status, assigned_user_id, notes, first_action_at)
select '10000000-0000-4000-8000-000000012451'::uuid, org.id, danielle.location_id, danielle.id, '10000000-0000-4000-8000-000000012403'::uuid, 'high', 'open', manager_user.id, 'Fictional negative-feedback recovery case. External review access is not suppressed.', null
from org cross join danielle left join manager_user on true
on conflict (feedback_response_id) do update
set severity = excluded.severity,
    status = excluded.status,
    assigned_user_id = excluded.assigned_user_id,
    notes = excluded.notes,
    updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
external_seed (id, location_slug, source_id, external_review_id, author_display_name, rating, review_text, review_date) as (
  values
    ('10000000-0000-4000-8000-000000012461'::uuid, 'miami', '10000000-0000-4000-8000-000000012101'::uuid, 'demo-google-miami-001', 'I. Martin', 5, 'Fictional imported review praising a smooth visit.', current_date - 1),
    ('10000000-0000-4000-8000-000000012462'::uuid, 'tampa', '10000000-0000-4000-8000-000000012102'::uuid, 'demo-google-tampa-001', 'C. Stone', 4, 'Fictional imported review with helpful staff feedback.', current_date - 2),
    ('10000000-0000-4000-8000-000000012463'::uuid, 'jacksonville', '10000000-0000-4000-8000-000000012103'::uuid, 'demo-google-jax-001', 'D. Cross', 2, 'Fictional imported review requiring manager attention.', current_date - 1)
)
insert into public.external_reviews (id, organization_id, location_id, review_source_id, external_review_id, author_display_name, rating, review_text, review_date, metadata)
select external_seed.id, org.id, locations.id, external_seed.source_id, external_seed.external_review_id, external_seed.author_display_name, external_seed.rating, external_seed.review_text, external_seed.review_date, '{"demo":true,"provider_api":"not_called"}'::jsonb
from org
join external_seed on true
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = external_seed.location_slug
on conflict (organization_id, review_source_id, external_review_id) do update
set author_display_name = excluded.author_display_name,
    rating = excluded.rating,
    review_text = excluded.review_text,
    review_date = excluded.review_date,
    metadata = excluded.metadata,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.review_response_drafts (id, organization_id, external_review_id, drafted_by, tone, draft_text, status, ai_generated)
select '10000000-0000-4000-8000-000000012471'::uuid, org.id, '10000000-0000-4000-8000-000000012463'::uuid, owner_user.id, 'apologetic', 'Thank you for sharing honest feedback. Our manager would like to follow up and understand how we can improve.', 'draft', true
from org left join owner_user on true
on conflict (id) do update
set draft_text = excluded.draft_text,
    status = 'draft',
    ai_generated = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
code_seed (id, email, code) as (
  values
    ('10000000-0000-4000-8000-000000012601'::uuid, 'isabella.m@example.com', 'ISABELLA25'),
    ('10000000-0000-4000-8000-000000012602'::uuid, 'camila.s@example.com', 'CAMILA25'),
    ('10000000-0000-4000-8000-000000012603'::uuid, 'danielle.c@example.com', 'DANIELLE25')
)
insert into public.referral_codes (id, organization_id, contact_id, referral_program_id, code, active)
select code_seed.id, org.id, contacts.id, '10000000-0000-4000-8000-000000012501'::uuid, code_seed.code, true
from org
join code_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = code_seed.email
on conflict (organization_id, code) do update
set active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
referral_seed (id, referring_email, referred_email, code_id, location_slug, status, opportunity_name, sale_id, converted_at) as (
  values
    ('10000000-0000-4000-8000-000000012701'::uuid, 'isabella.m@example.com', 'danielle.c@example.com', '10000000-0000-4000-8000-000000012601'::uuid, 'jacksonville', 'lead', null, null::uuid, null::timestamptz),
    ('10000000-0000-4000-8000-000000012702'::uuid, 'camila.s@example.com', 'isabella.m@example.com', '10000000-0000-4000-8000-000000012602'::uuid, 'miami', 'booked', 'Hair Restoration - Isabella Martin', null::uuid, null::timestamptz),
    ('10000000-0000-4000-8000-000000012703'::uuid, 'isabella.m@example.com', 'camila.s@example.com', '10000000-0000-4000-8000-000000012601'::uuid, 'tampa', 'reward_pending', null, '10000000-0000-4000-8000-000000001002'::uuid, now() - interval '3 days')
)
insert into public.referrals (id, organization_id, location_id, referring_contact_id, referred_contact_id, referral_code_id, lead_created_at, status, opportunity_id, sale_id, converted_at, metadata)
select referral_seed.id, org.id, locations.id, referring.id, referred.id, referral_seed.code_id, now() - interval '12 days', referral_seed.status, opportunities.id, referral_seed.sale_id, referral_seed.converted_at, '{"demo":true}'::jsonb
from org
join referral_seed on true
join public.contacts referring on referring.organization_id = org.id and lower(trim(referring.email)) = referral_seed.referring_email
left join public.contacts referred on referred.organization_id = org.id and lower(trim(referred.email)) = referral_seed.referred_email
left join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = referral_seed.location_slug
left join public.opportunities opportunities on opportunities.organization_id = org.id and opportunities.name = referral_seed.opportunity_name
on conflict (id) do update
set status = excluded.status,
    opportunity_id = excluded.opportunity_id,
    sale_id = excluded.sale_id,
    converted_at = excluded.converted_at,
    metadata = excluded.metadata,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1),
reward_seed (id, referral_id, event_type, amount_cents, reason) as (
  values
    ('10000000-0000-4000-8000-000000012801'::uuid, '10000000-0000-4000-8000-000000012703'::uuid, 'earned', 5000, 'Fictional reward earned after referral sale.'),
    ('10000000-0000-4000-8000-000000012802'::uuid, '10000000-0000-4000-8000-000000012703'::uuid, 'issued', 5000, 'Fictional demo credit issued after staff review.')
)
insert into public.referral_reward_events (id, organization_id, referring_contact_id, referral_id, event_type, reward_type, amount_cents, reward_value, reason, created_by)
select reward_seed.id, org.id, referrals.referring_contact_id, referrals.id, reward_seed.event_type, 'credit', reward_seed.amount_cents, reward_seed.amount_cents, reward_seed.reason, owner_user.id
from org
join reward_seed on true
join public.referrals referrals on referrals.id = reward_seed.referral_id
left join owner_user on true
on conflict (id) do update
set amount_cents = excluded.amount_cents,
    reward_value = excluded.reward_value,
    reason = excluded.reason;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.patient_credit_events (id, organization_id, contact_id, referral_reward_event_id, event_type, amount_cents, reason, created_by)
select '10000000-0000-4000-8000-000000012811'::uuid, org.id, referrals.referring_contact_id, '10000000-0000-4000-8000-000000012802'::uuid, 'grant', 5000, 'Fictional referral credit grant; no payment record created.', owner_user.id
from org
join public.referrals referrals on referrals.id = '10000000-0000-4000-8000-000000012703'
left join owner_user on true
on conflict (id) do update
set amount_cents = excluded.amount_cents,
    reason = excluded.reason;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
loyalty_seed (id, email, location_slug, visits, treatments, revenue, months_since, referrals, membership_status, package_percent, loyalty_status) as (
  values
    ('10000000-0000-4000-8000-000000012901'::uuid, 'isabella.m@example.com', 'miami', 5, 2, 1240000, 1, 2, 'trial', 50, 'vip'),
    ('10000000-0000-4000-8000-000000012902'::uuid, 'camila.s@example.com', 'tampa', 4, 1, 1890000, 2, 1, 'active', 80, 'loyal'),
    ('10000000-0000-4000-8000-000000012903'::uuid, 'danielle.c@example.com', 'jacksonville', 1, 1, 462000, 6, 0, null, 20, 'at_risk')
)
insert into public.patient_loyalty_snapshots (id, organization_id, contact_id, location_id, total_visits, completed_treatments, lifetime_collected_revenue_cents, months_since_last_visit, referral_count, membership_status, package_utilization_percent, loyalty_status, metadata)
select loyalty_seed.id, org.id, contacts.id, locations.id, loyalty_seed.visits, loyalty_seed.treatments, loyalty_seed.revenue, loyalty_seed.months_since, loyalty_seed.referrals, loyalty_seed.membership_status, loyalty_seed.package_percent, loyalty_seed.loyalty_status, '{"demo":true,"criteria":"deterministic"}'::jsonb
from org
join loyalty_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = loyalty_seed.email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = loyalty_seed.location_slug
on conflict (organization_id, contact_id) do update
set total_visits = excluded.total_visits,
    completed_treatments = excluded.completed_treatments,
    lifetime_collected_revenue_cents = excluded.lifetime_collected_revenue_cents,
    months_since_last_visit = excluded.months_since_last_visit,
    referral_count = excluded.referral_count,
    membership_status = excluded.membership_status,
    package_utilization_percent = excluded.package_utilization_percent,
    loyalty_status = excluded.loyalty_status,
    calculated_at = now(),
    metadata = excluded.metadata;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
segment_seed (id, name, description, rules_json) as (
  values
    ('10000000-0000-4000-8000-000000012921'::uuid, '180-Day Inactive', 'Fictional patients with no recent completed visit.', '{"last_visit_days_gt":180}'::jsonb),
    ('10000000-0000-4000-8000-000000012922'::uuid, 'Consult No-Sale', 'Fictional consultations that did not purchase.', '{"consulted":true,"purchased":false}'::jsonb),
    ('10000000-0000-4000-8000-000000012923'::uuid, 'Unused Package', 'Fictional package with remaining sessions.', '{"package_remaining_gt":0}'::jsonb)
)
insert into public.reactivation_segments (id, organization_id, name, description, rules_json, active)
select segment_seed.id, org.id, segment_seed.name, segment_seed.description, segment_seed.rules_json, true
from org
join segment_seed on true
on conflict (organization_id, name) do update
set description = excluded.description,
    rules_json = excluded.rules_json,
    active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
campaign_seed (id, segment_id, name, status, targeted, reactivated, bookings, sales_count, revenue) as (
  values
    ('10000000-0000-4000-8000-000000012931'::uuid, '10000000-0000-4000-8000-000000012921'::uuid, 'Demo 180-Day Win-Back', 'draft', 18, 3, 2, 1, 220000),
    ('10000000-0000-4000-8000-000000012932'::uuid, '10000000-0000-4000-8000-000000012922'::uuid, 'Demo Consult No-Sale Recovery', 'draft', 12, 2, 1, 0, 0),
    ('10000000-0000-4000-8000-000000012933'::uuid, '10000000-0000-4000-8000-000000012923'::uuid, 'Demo Unused Package Reminder', 'draft', 9, 2, 2, 1, 45000)
)
insert into public.reactivation_campaigns (id, organization_id, segment_id, name, status, contacts_targeted, contacts_reactivated, bookings_generated, sales_generated, collected_revenue_cents)
select campaign_seed.id, org.id, campaign_seed.segment_id, campaign_seed.name, campaign_seed.status, campaign_seed.targeted, campaign_seed.reactivated, campaign_seed.bookings, campaign_seed.sales_count, campaign_seed.revenue
from org
join campaign_seed on true
on conflict (organization_id, name) do update
set status = 'draft',
    contacts_targeted = excluded.contacts_targeted,
    contacts_reactivated = excluded.contacts_reactivated,
    bookings_generated = excluded.bookings_generated,
    sales_generated = excluded.sales_generated,
    collected_revenue_cents = excluded.collected_revenue_cents,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
attribution_seed (id, campaign_id, email, event_type, sale_id, revenue) as (
  values
    ('10000000-0000-4000-8000-000000012941'::uuid, '10000000-0000-4000-8000-000000012931'::uuid, 'danielle.c@example.com', 'enrolled', null::uuid, 0),
    ('10000000-0000-4000-8000-000000012942'::uuid, '10000000-0000-4000-8000-000000012931'::uuid, 'danielle.c@example.com', 'booked', null::uuid, 0),
    ('10000000-0000-4000-8000-000000012943'::uuid, '10000000-0000-4000-8000-000000012931'::uuid, 'camila.s@example.com', 'sold', '10000000-0000-4000-8000-000000001002'::uuid, 220000)
)
insert into public.reactivation_attributions (id, organization_id, campaign_id, contact_id, sale_id, event_type, collected_revenue_cents, metadata)
select attribution_seed.id, org.id, attribution_seed.campaign_id, contacts.id, attribution_seed.sale_id, attribution_seed.event_type, attribution_seed.revenue, '{"demo":true}'::jsonb
from org
join attribution_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = attribution_seed.email
on conflict do nothing;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  left join public.roles r on r.id = up.role_id
  where up.organization_id = (select id from org)
    and (lower(trim(up.email)) = 'owner@avora-demo.com' or r.name = 'owner')
  order by case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end, up.created_at
  limit 1
),
workflow_seed (name, category, description, trigger_type, action_type, task_title, wait_label) as (
  values
    ('Review Request After Treatment', 'treatment_follow_up', 'Draft workflow to create an ethical review request after a completed treatment.', 'treatment.completed', 'create_review_request', 'Review eligible patient feedback', '24 hours'),
    ('Negative Feedback Recovery', 'internal_operations', 'Draft workflow to create manager recovery work for negative feedback.', 'reputation.feedback_negative', 'create_task', 'Recover negative feedback case', '1 day'),
    ('Referral Lead Follow-Up', 'lead_nurture', 'Draft workflow for referred fictional leads.', 'referral.created', 'create_task', 'Follow up with referral lead', 'same day'),
    ('Inactive Patient Reactivation', 'reactivation', 'Draft workflow for 180-day inactive fictional patients.', 'reactivation.enrolled', 'send_sms', 'Reactivation follow-up', '3 days')
),
workflow_definitions as (
  select workflow_seed.name, workflow_seed.category, workflow_seed.description,
    jsonb_build_object(
      'nodes', jsonb_build_array(
        jsonb_build_object('id', 'trigger', 'type', 'trigger', 'position', jsonb_build_object('x', 320, 'y', 40), 'configuration', jsonb_build_object('trigger_type', workflow_seed.trigger_type)),
        jsonb_build_object('id', 'wait', 'type', 'wait', 'position', jsonb_build_object('x', 320, 'y', 200), 'configuration', jsonb_build_object('label', workflow_seed.wait_label, 'demo_only', true)),
        jsonb_build_object('id', 'action', 'type', 'action', 'position', jsonb_build_object('x', 320, 'y', 360), 'configuration', jsonb_build_object('action_type', workflow_seed.action_type, 'title', workflow_seed.task_title, 'requires_review', true))
      ),
      'edges', jsonb_build_array(
        jsonb_build_object('source', 'trigger', 'target', 'wait', 'label', 'DEFAULT'),
        jsonb_build_object('source', 'wait', 'target', 'action', 'label', 'AFTER_WAIT')
      )
    ) as definition_json
  from workflow_seed
),
upserted_workflows as (
  insert into public.workflows (organization_id, name, description, category, status, location_scope, enrollment_policy, re_enrollment_policy, failure_policy, test_mode, created_by, updated_by)
  select owner_user.organization_id, workflow_definitions.name, workflow_definitions.description, workflow_definitions.category, 'draft', 'all', 'one_active_per_contact', 'after_completion', 'retry_then_stop', true, owner_user.id, owner_user.id
  from workflow_definitions
  cross join owner_user
  on conflict (organization_id, name) do update set
    description = excluded.description,
    category = excluded.category,
    status = 'draft',
    active_version_id = null,
    published_at = null,
    test_mode = true,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id, organization_id, name, updated_by as owner_user_id
),
all_seeded_workflows as (
  select upserted_workflows.id, upserted_workflows.name, workflow_definitions.definition_json, upserted_workflows.owner_user_id
  from upserted_workflows
  join workflow_definitions on workflow_definitions.name = upserted_workflows.name
),
upserted_versions as (
  insert into public.workflow_versions (workflow_id, version_number, definition_json, status, validation_snapshot, created_by)
  select id, 1, definition_json, 'draft', '{"seeded":true,"phase":12,"starter_template":true}'::jsonb, owner_user_id
  from all_seeded_workflows
  on conflict (workflow_id, version_number) do update set
    definition_json = excluded.definition_json,
    status = 'draft',
    validation_snapshot = excluded.validation_snapshot,
    published_at = null
  returning id
)
select
  (select count(*) from upserted_workflows) as reputation_workflows_inserted_or_updated,
  (select count(*) from upserted_versions) as reputation_workflow_versions_inserted_or_updated;

select
  (select count(*) from public.review_sources rs join public.organizations o on o.id = rs.organization_id where lower(trim(o.slug)) = 'avora') as review_sources,
  (select count(*) from public.review_requests rr join public.organizations o on o.id = rr.organization_id where lower(trim(o.slug)) = 'avora') as review_requests,
  (select count(*) from public.feedback_responses fr join public.organizations o on o.id = fr.organization_id where lower(trim(o.slug)) = 'avora') as feedback_responses,
  (select count(*) from public.feedback_escalations fe join public.organizations o on o.id = fe.organization_id where lower(trim(o.slug)) = 'avora') as feedback_escalations,
  (select count(*) from public.referral_codes rc join public.organizations o on o.id = rc.organization_id where lower(trim(o.slug)) = 'avora') as referral_codes,
  (select count(*) from public.referrals r join public.organizations o on o.id = r.organization_id where lower(trim(o.slug)) = 'avora') as referrals,
  (select count(*) from public.referral_reward_events rre join public.organizations o on o.id = rre.organization_id where lower(trim(o.slug)) = 'avora') as referral_reward_events,
  (select count(*) from public.reactivation_segments rs join public.organizations o on o.id = rs.organization_id where lower(trim(o.slug)) = 'avora') as reactivation_segments,
  (select count(*) from public.reactivation_campaigns rc join public.organizations o on o.id = rc.organization_id where lower(trim(o.slug)) = 'avora') as reactivation_campaigns;
