with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
source_seed (id, name, channel, provider) as (
  values
    ('10000000-0000-4000-8000-000000008001'::uuid, 'Meta', 'Meta', 'meta'),
    ('10000000-0000-4000-8000-000000008002'::uuid, 'Google', 'Google', 'google'),
    ('10000000-0000-4000-8000-000000008003'::uuid, 'Referral', 'Referral', 'referral'),
    ('10000000-0000-4000-8000-000000008004'::uuid, 'Organic Search', 'Organic Search', 'website'),
    ('10000000-0000-4000-8000-000000008005'::uuid, 'Direct / Unknown', 'Unknown', 'unknown')
)
insert into public.marketing_sources (id, organization_id, name, channel, provider, active, metadata)
select source_seed.id, org.id, source_seed.name, source_seed.channel, source_seed.provider, true, '{"demo":true}'::jsonb
from org
join source_seed on true
on conflict (id) do update
set name = excluded.name, channel = excluded.channel, provider = excluded.provider, active = true, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
aliases (source_name, alias) as (
  values
    ('Meta', 'Facebook'),
    ('Meta', 'FB'),
    ('Meta', 'facebook_lead_ads'),
    ('Meta', 'Instagram Ads'),
    ('Google', 'Google Ads'),
    ('Google', 'google_cpc'),
    ('Referral', 'Patient Referral'),
    ('Organic Search', 'SEO'),
    ('Direct / Unknown', 'Unattributed')
)
insert into public.marketing_source_aliases (organization_id, source_id, alias, normalized_alias)
select org.id, ms.id, aliases.alias, lower(regexp_replace(trim(aliases.alias), '[^a-zA-Z0-9]+', '_', 'g'))
from org
join aliases on true
join public.marketing_sources ms on ms.organization_id = org.id and ms.name = aliases.source_name
on conflict (organization_id, normalized_alias) do update
set source_id = excluded.source_id, alias = excluded.alias, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
campaign_seed (id, source_name, location_slug, name, service_category, objective, status, start_date, budget_cents, external_campaign_id) as (
  values
    ('10000000-0000-4000-8000-000000008101'::uuid, 'Meta', 'miami', 'Miami Hair Restoration - Meta', 'Hair Restoration', 'Booked consultations', 'active', current_date - 45, 2000000, 'meta_demo_miami_hair'),
    ('10000000-0000-4000-8000-000000008102'::uuid, 'Meta', 'tampa', 'Tampa Hair Restoration - Meta', 'Hair Restoration', 'Booked consultations', 'active', current_date - 45, 1250000, 'meta_demo_tampa_hair'),
    ('10000000-0000-4000-8000-000000008103'::uuid, 'Google', 'jacksonville', 'Jacksonville Hair Restoration - Google', 'Hair Restoration', 'High-intent search', 'active', current_date - 45, 900000, 'google_demo_jax_hair'),
    ('10000000-0000-4000-8000-000000008104'::uuid, 'Meta', 'miami', 'Miami T-Shape - Meta', 'T-Shape', 'Lead generation', 'active', current_date - 30, 450000, 'meta_demo_miami_tshape'),
    ('10000000-0000-4000-8000-000000008105'::uuid, 'Google', 'tampa', 'Tampa NeoGen - Google', 'NeoGen', 'Search consultations', 'active', current_date - 30, 350000, 'google_demo_tampa_neogen'),
    ('10000000-0000-4000-8000-000000008106'::uuid, 'Referral', null, 'Referral / Existing Patient', 'Other', 'Relationship referrals', 'active', current_date - 90, null, null),
    ('10000000-0000-4000-8000-000000008107'::uuid, 'Organic Search', null, 'Organic Website Leads', 'Other', 'Unpaid lead capture', 'active', current_date - 90, null, null)
)
insert into public.marketing_campaigns (id, organization_id, location_id, source_id, provider, external_campaign_id, name, service_category, objective, status, start_date, budget_cents, active, metadata)
select campaign_seed.id, org.id, locations.id, ms.id, ms.provider, campaign_seed.external_campaign_id, campaign_seed.name, campaign_seed.service_category, campaign_seed.objective, campaign_seed.status, campaign_seed.start_date, campaign_seed.budget_cents, true, '{"demo":true}'::jsonb
from org
join campaign_seed on true
join public.marketing_sources ms on ms.organization_id = org.id and ms.name = campaign_seed.source_name
left join public.locations locations on locations.organization_id = org.id and lower(locations.slug) = campaign_seed.location_slug
on conflict (id) do update
set source_id = excluded.source_id,
    location_id = excluded.location_id,
    name = excluded.name,
    service_category = excluded.service_category,
    objective = excluded.objective,
    status = excluded.status,
    active = true,
    updated_at = now();

insert into public.marketing_campaign_locations (campaign_id, location_id)
select mc.id, coalesce(mc.location_id, locations.id)
from public.marketing_campaigns mc
join public.locations locations on locations.organization_id = mc.organization_id
join public.organizations org on org.id = mc.organization_id and lower(trim(org.slug)) = 'avora'
where mc.id in (
  '10000000-0000-4000-8000-000000008101',
  '10000000-0000-4000-8000-000000008102',
  '10000000-0000-4000-8000-000000008103',
  '10000000-0000-4000-8000-000000008104',
  '10000000-0000-4000-8000-000000008105',
  '10000000-0000-4000-8000-000000008106',
  '10000000-0000-4000-8000-000000008107'
)
and (mc.location_id is null or mc.location_id = locations.id)
on conflict do nothing;

with ad_group_seed (id, campaign_id, name, external_ad_group_id, targeting_summary) as (
  values
    ('10000000-0000-4000-8000-000000008201'::uuid, '10000000-0000-4000-8000-000000008101'::uuid, 'Miami Hair Lookalike Demo', 'meta_adset_miami_hair_lookalike', 'Fictional Meta lookalike and retargeting audience.'),
    ('10000000-0000-4000-8000-000000008202'::uuid, '10000000-0000-4000-8000-000000008102'::uuid, 'Tampa Hair Retargeting Demo', 'meta_adset_tampa_hair_retarget', 'Fictional Meta retargeting audience.'),
    ('10000000-0000-4000-8000-000000008203'::uuid, '10000000-0000-4000-8000-000000008103'::uuid, 'Jacksonville Hair Search Demo', 'google_adgroup_jax_hair_search', 'Fictional search terms for hair restoration.'),
    ('10000000-0000-4000-8000-000000008204'::uuid, '10000000-0000-4000-8000-000000008104'::uuid, 'Miami T-Shape Demo', 'meta_adset_miami_tshape', 'Fictional body contouring audience.'),
    ('10000000-0000-4000-8000-000000008205'::uuid, '10000000-0000-4000-8000-000000008105'::uuid, 'Tampa NeoGen Search Demo', 'google_adgroup_tampa_neogen', 'Fictional NeoGen search audience.')
)
insert into public.marketing_ad_groups (id, organization_id, campaign_id, provider, external_ad_group_id, name, targeting_summary, status, metadata)
select ad_group_seed.id, mc.organization_id, mc.id, mc.provider, ad_group_seed.external_ad_group_id, ad_group_seed.name, ad_group_seed.targeting_summary, 'active', '{"demo":true}'::jsonb
from ad_group_seed
join public.marketing_campaigns mc on mc.id = ad_group_seed.campaign_id
on conflict (id) do update
set name = excluded.name, targeting_summary = excluded.targeting_summary, status = 'active', updated_at = now();

with ad_seed (id, campaign_id, ad_group_id, name, creative_name, external_ad_id, landing_page_url) as (
  values
    ('10000000-0000-4000-8000-000000008301'::uuid, '10000000-0000-4000-8000-000000008101'::uuid, '10000000-0000-4000-8000-000000008201'::uuid, 'Miami Hair Consultation Lead Ad', 'Before After Demo Creative', 'meta_ad_miami_hair_before_after', 'https://demo.avora.local/miami/hair-restoration?utm_source=meta&utm_campaign=miami-hair'),
    ('10000000-0000-4000-8000-000000008302'::uuid, '10000000-0000-4000-8000-000000008102'::uuid, '10000000-0000-4000-8000-000000008202'::uuid, 'Tampa Hair Financing Ad', 'Financing Demo Creative', 'meta_ad_tampa_hair_financing', 'https://demo.avora.local/tampa/hair-restoration?utm_source=meta&utm_campaign=tampa-hair'),
    ('10000000-0000-4000-8000-000000008303'::uuid, '10000000-0000-4000-8000-000000008103'::uuid, '10000000-0000-4000-8000-000000008203'::uuid, 'Jacksonville Hair Search Ad', 'Search Demo Creative', 'google_ad_jax_hair_search', 'https://demo.avora.local/jacksonville/hair-restoration?utm_source=google&utm_campaign=jax-hair'),
    ('10000000-0000-4000-8000-000000008304'::uuid, '10000000-0000-4000-8000-000000008104'::uuid, '10000000-0000-4000-8000-000000008204'::uuid, 'Miami T-Shape Lead Ad', 'T-Shape Demo Creative', 'meta_ad_miami_tshape', 'https://demo.avora.local/miami/t-shape?utm_source=meta&utm_campaign=miami-tshape'),
    ('10000000-0000-4000-8000-000000008305'::uuid, '10000000-0000-4000-8000-000000008105'::uuid, '10000000-0000-4000-8000-000000008205'::uuid, 'Tampa NeoGen Search Ad', 'NeoGen Demo Creative', 'google_ad_tampa_neogen', 'https://demo.avora.local/tampa/neogen?utm_source=google&utm_campaign=tampa-neogen')
)
insert into public.marketing_ads (id, organization_id, campaign_id, ad_group_id, provider, external_ad_id, name, creative_name, status, landing_page_url, metadata)
select ad_seed.id, mc.organization_id, mc.id, ad_seed.ad_group_id, mc.provider, ad_seed.external_ad_id, ad_seed.name, ad_seed.creative_name, 'active', ad_seed.landing_page_url, '{"demo":true}'::jsonb
from ad_seed
join public.marketing_campaigns mc on mc.id = ad_seed.campaign_id
on conflict (id) do update
set name = excluded.name, creative_name = excluded.creative_name, landing_page_url = excluded.landing_page_url, status = 'active', updated_at = now();

with spend_seed (id, campaign_id, ad_group_id, ad_id, spend_date, spend_cents, impressions, clicks, leads) as (
  values
    ('10000000-0000-4000-8000-000000008401'::uuid, '10000000-0000-4000-8000-000000008101'::uuid, '10000000-0000-4000-8000-000000008201'::uuid, '10000000-0000-4000-8000-000000008301'::uuid, current_date - 12, 720000, 48000, 1800, 72),
    ('10000000-0000-4000-8000-000000008402'::uuid, '10000000-0000-4000-8000-000000008101'::uuid, '10000000-0000-4000-8000-000000008201'::uuid, '10000000-0000-4000-8000-000000008301'::uuid, current_date - 5, 680000, 43000, 1700, 64),
    ('10000000-0000-4000-8000-000000008403'::uuid, '10000000-0000-4000-8000-000000008102'::uuid, '10000000-0000-4000-8000-000000008202'::uuid, '10000000-0000-4000-8000-000000008302'::uuid, current_date - 7, 520000, 33000, 1160, 44),
    ('10000000-0000-4000-8000-000000008404'::uuid, '10000000-0000-4000-8000-000000008103'::uuid, '10000000-0000-4000-8000-000000008203'::uuid, '10000000-0000-4000-8000-000000008303'::uuid, current_date - 6, 390000, 12000, 760, 28),
    ('10000000-0000-4000-8000-000000008405'::uuid, '10000000-0000-4000-8000-000000008104'::uuid, '10000000-0000-4000-8000-000000008204'::uuid, '10000000-0000-4000-8000-000000008304'::uuid, current_date - 4, 180000, 16000, 420, 18),
    ('10000000-0000-4000-8000-000000008406'::uuid, '10000000-0000-4000-8000-000000008105'::uuid, '10000000-0000-4000-8000-000000008205'::uuid, '10000000-0000-4000-8000-000000008305'::uuid, current_date - 3, 145000, 6800, 310, 10)
)
insert into public.marketing_spend (id, organization_id, location_id, source_id, campaign_id, ad_group_id, ad_id, spend_date, spend_cents, impressions, clicks, leads, imported, provider, metadata)
select spend_seed.id, mc.organization_id, mc.location_id, mc.source_id, mc.id, spend_seed.ad_group_id, spend_seed.ad_id, spend_seed.spend_date, spend_seed.spend_cents, spend_seed.impressions, spend_seed.clicks, spend_seed.leads, true, mc.provider, '{"demo":true,"imported_from":"mock_adapter"}'::jsonb
from spend_seed
join public.marketing_campaigns mc on mc.id = spend_seed.campaign_id
on conflict (id) do update
set spend_cents = excluded.spend_cents,
    impressions = excluded.impressions,
    clicks = excluded.clicks,
    leads = excluded.leads,
    metadata = excluded.metadata,
    updated_at = now();

with attribution_seed (id, contact_email, campaign_id, ad_group_id, ad_id, attribution_type, is_primary, utm_source, utm_medium, utm_campaign, landing_page, external_click_id, captured_at) as (
  values
    ('10000000-0000-4000-8000-000000008501'::uuid, 'isabella.m@example.com', '10000000-0000-4000-8000-000000008101'::uuid, '10000000-0000-4000-8000-000000008201'::uuid, '10000000-0000-4000-8000-000000008301'::uuid, 'first_touch', true, 'meta', 'paid_social', 'miami-hair', 'https://demo.avora.local/miami/hair-restoration', 'fbclid_demo_isabella_first', now() - interval '20 days'),
    ('10000000-0000-4000-8000-000000008502'::uuid, 'isabella.m@example.com', '10000000-0000-4000-8000-000000008101'::uuid, '10000000-0000-4000-8000-000000008201'::uuid, '10000000-0000-4000-8000-000000008301'::uuid, 'last_touch', false, 'meta', 'paid_social', 'miami-hair-retargeting', 'https://demo.avora.local/miami/hair-restoration', 'fbclid_demo_isabella_last', now() - interval '5 days'),
    ('10000000-0000-4000-8000-000000008503'::uuid, 'camila.s@example.com', '10000000-0000-4000-8000-000000008102'::uuid, '10000000-0000-4000-8000-000000008202'::uuid, '10000000-0000-4000-8000-000000008302'::uuid, 'lead_creation', true, 'meta', 'paid_social', 'tampa-hair', 'https://demo.avora.local/tampa/hair-restoration', 'fbclid_demo_camila', now() - interval '11 days'),
    ('10000000-0000-4000-8000-000000008504'::uuid, 'danielle.c@example.com', '10000000-0000-4000-8000-000000008103'::uuid, '10000000-0000-4000-8000-000000008203'::uuid, '10000000-0000-4000-8000-000000008303'::uuid, 'lead_creation', true, 'google', 'cpc', 'jax-hair', 'https://demo.avora.local/jacksonville/hair-restoration', 'gclid_demo_danielle', now() - interval '9 days')
)
insert into public.contact_attributions (id, organization_id, location_id, contact_id, source_id, campaign_id, ad_group_id, ad_id, attribution_type, utm_source, utm_medium, utm_campaign, landing_page, external_click_id, captured_at, is_primary, metadata)
select attribution_seed.id, contacts.organization_id, contacts.location_id, contacts.id, mc.source_id, mc.id, attribution_seed.ad_group_id, attribution_seed.ad_id, attribution_seed.attribution_type, attribution_seed.utm_source, attribution_seed.utm_medium, attribution_seed.utm_campaign, attribution_seed.landing_page, attribution_seed.external_click_id, attribution_seed.captured_at, attribution_seed.is_primary, '{"demo":true}'::jsonb
from attribution_seed
join public.contacts contacts on lower(trim(contacts.email)) = attribution_seed.contact_email
join public.marketing_campaigns mc on mc.id = attribution_seed.campaign_id and mc.organization_id = contacts.organization_id
on conflict (id) do update
set campaign_id = excluded.campaign_id,
    ad_group_id = excluded.ad_group_id,
    ad_id = excluded.ad_id,
    captured_at = excluded.captured_at,
    is_primary = excluded.is_primary,
    metadata = excluded.metadata;

insert into public.sale_attributions (organization_id, sale_id, contact_attribution_id, source_id, campaign_id, ad_group_id, ad_id, attribution_model)
select sales.organization_id, sales.id, ca.id, ca.source_id, ca.campaign_id, ca.ad_group_id, ca.ad_id, 'primary_attribution'
from public.sales sales
join public.contact_attributions ca on ca.organization_id = sales.organization_id and ca.contact_id = sales.contact_id and ca.is_primary
where sales.id in (
  '10000000-0000-4000-8000-000000001001',
  '10000000-0000-4000-8000-000000001002',
  '10000000-0000-4000-8000-000000001003'
)
on conflict (sale_id, attribution_model) do update
set contact_attribution_id = excluded.contact_attribution_id,
    source_id = excluded.source_id,
    campaign_id = excluded.campaign_id,
    ad_group_id = excluded.ad_group_id,
    ad_id = excluded.ad_id;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
sync_seed (id, provider, sync_type, status, processed, created_count, updated_count) as (
  values
    ('10000000-0000-4000-8000-000000008601'::uuid, 'meta', 'spend_import', 'completed', 5, 5, 0),
    ('10000000-0000-4000-8000-000000008602'::uuid, 'google', 'spend_import', 'completed', 2, 2, 0)
)
insert into public.marketing_sync_runs (id, organization_id, provider, sync_type, started_at, completed_at, status, records_processed, records_created, records_updated, errors, metadata)
select sync_seed.id, org.id, sync_seed.provider, sync_seed.sync_type, now() - interval '1 hour', now() - interval '55 minutes', sync_seed.status, sync_seed.processed, sync_seed.created_count, sync_seed.updated_count, '[]'::jsonb, '{"demo":true,"adapter":"mock"}'::jsonb
from org
join sync_seed on true
on conflict (id) do nothing;

select
  (select count(*) from public.marketing_sources ms join public.organizations o on o.id = ms.organization_id where lower(trim(o.slug)) = 'avora') as marketing_sources,
  (select count(*) from public.marketing_campaigns mc join public.organizations o on o.id = mc.organization_id where lower(trim(o.slug)) = 'avora') as marketing_campaigns,
  (select count(*) from public.marketing_spend spend join public.organizations o on o.id = spend.organization_id where lower(trim(o.slug)) = 'avora') as marketing_spend_rows,
  (select count(*) from public.contact_attributions ca join public.organizations o on o.id = ca.organization_id where lower(trim(o.slug)) = 'avora') as contact_attributions,
  (select count(*) from public.sale_attributions sa join public.organizations o on o.id = sa.organization_id where lower(trim(o.slug)) = 'avora') as sale_attributions;
