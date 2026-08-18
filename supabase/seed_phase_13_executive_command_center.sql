with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
    and r.name = 'owner'
  limit 1
),
target_rows as (
  select
    org.id as organization_id,
    l.id as location_id,
    row.metric_key,
    row.period_type,
    row.target_value,
    row.warning_threshold,
    row.critical_threshold,
    row.effective_start,
    row.effective_end,
    true as active,
    owner_user.id as created_by
  from avora_org org
  cross join owner_user
  join (
    values
      (null, 'net_collected_revenue_cents', 'monthly', 185000000::numeric, 0.90::numeric, 0.82::numeric, date '2026-08-01', null::date),
      (null, 'contribution_margin_percent', 'monthly', 0.58::numeric, 0.52::numeric, 0.46::numeric, date '2026-08-01', null::date),
      (null, 'close_rate_percent', 'monthly', 0.44::numeric, 0.38::numeric, 0.32::numeric, date '2026-08-01', null::date),
      (null, 'marketing_roas', 'monthly', 4.20::numeric, 3.20::numeric, 2.40::numeric, date '2026-08-01', null::date),
      (null, 'labor_cost_percent', 'monthly', 0.24::numeric, 0.28::numeric, 0.34::numeric, date '2026-08-01', null::date),
      (null, 'nps', 'monthly', 68::numeric, 55::numeric, 42::numeric, date '2026-08-01', null::date),
      ('miami', 'net_collected_revenue_cents', 'monthly', 76000000::numeric, 0.90::numeric, 0.82::numeric, date '2026-08-01', null::date),
      ('tampa', 'net_collected_revenue_cents', 'monthly', 62000000::numeric, 0.90::numeric, 0.82::numeric, date '2026-08-01', null::date),
      ('jacksonville', 'net_collected_revenue_cents', 'monthly', 47000000::numeric, 0.90::numeric, 0.82::numeric, date '2026-08-01', null::date),
      ('tampa', 'close_rate_percent', 'monthly', 0.42::numeric, 0.36::numeric, 0.30::numeric, date '2026-08-01', null::date),
      ('jacksonville', 'no_show_rate_percent', 'monthly', 0.10::numeric, 0.14::numeric, 0.18::numeric, date '2026-08-01', null::date)
  ) as row(location_slug, metric_key, period_type, target_value, warning_threshold, critical_threshold, effective_start, effective_end) on true
  left join public.locations l on l.organization_id = org.id and lower(l.slug) = row.location_slug
  where row.location_slug is null or l.id is not null
),
inserted_targets as (
  insert into public.executive_targets (
    organization_id,
    location_id,
    metric_key,
    period_type,
    target_value,
    warning_threshold,
    critical_threshold,
    effective_start,
    effective_end,
    active,
    created_by
  )
  select
    target_rows.organization_id,
    target_rows.location_id,
    target_rows.metric_key,
    target_rows.period_type,
    target_rows.target_value,
    target_rows.warning_threshold,
    target_rows.critical_threshold,
    target_rows.effective_start,
    target_rows.effective_end,
    target_rows.active,
    target_rows.created_by
  from target_rows
  where not exists (
    select 1
    from public.executive_targets existing
    where existing.organization_id = target_rows.organization_id
      and coalesce(existing.location_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(target_rows.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and existing.metric_key = target_rows.metric_key
      and existing.period_type = target_rows.period_type
      and existing.effective_start = target_rows.effective_start
  )
  returning id
),
updated_targets as (
  update public.executive_targets existing
  set target_value = target_rows.target_value,
      warning_threshold = target_rows.warning_threshold,
      critical_threshold = target_rows.critical_threshold,
      effective_end = target_rows.effective_end,
      active = target_rows.active
  from target_rows
  where existing.organization_id = target_rows.organization_id
    and coalesce(existing.location_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(target_rows.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and existing.metric_key = target_rows.metric_key
    and existing.period_type = target_rows.period_type
    and existing.effective_start = target_rows.effective_start
  returning existing.id
)
select
  'phase_13_targets' as section,
  (select count(*) from target_rows) as expected_rows,
  (select count(*) from inserted_targets) as inserted_rows,
  (select count(*) from updated_targets) as updated_rows;

with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
alert_setting_rows as (
  select
    org.id as organization_id,
    l.id as location_id,
    row.alert_type,
    row.enabled,
    row.warning_threshold,
    row.critical_threshold,
    row.lookback_period
  from avora_org org
  join (
    values
      (null, 'revenue_below_target', true, 0.90::numeric, 0.82::numeric, 'this_month'),
      (null, 'close_rate_down', true, 0.38::numeric, 0.32::numeric, 'this_month'),
      (null, 'marketing_roas_below_threshold', true, 3.20::numeric, 2.40::numeric, 'this_month'),
      (null, 'labor_cost_percent_above_threshold', true, 0.28::numeric, 0.34::numeric, 'this_month'),
      (null, 'inventory_low', true, 3::numeric, 6::numeric, 'today'),
      (null, 'inventory_expiring', true, 30::numeric, 14::numeric, 'next_30_days'),
      (null, 'negative_feedback_unresolved', true, 2::numeric, 4::numeric, 'this_week'),
      (null, 'provider_utilization_low', true, 0.70::numeric, 0.55::numeric, 'this_week'),
      ('tampa', 'close_rate_down', true, 0.36::numeric, 0.30::numeric, 'this_month'),
      ('miami', 'inventory_expiring', true, 30::numeric, 14::numeric, 'next_30_days')
  ) as row(location_slug, alert_type, enabled, warning_threshold, critical_threshold, lookback_period) on true
  left join public.locations l on l.organization_id = org.id and lower(l.slug) = row.location_slug
  where row.location_slug is null or l.id is not null
),
upserted_alert_settings as (
  insert into public.executive_alert_settings (
    organization_id,
    location_id,
    alert_type,
    enabled,
    warning_threshold,
    critical_threshold,
    lookback_period
  )
  select organization_id, location_id, alert_type, enabled, warning_threshold, critical_threshold, lookback_period
  from alert_setting_rows
  on conflict (
    organization_id,
    (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    alert_type
  )
  do update set
    enabled = excluded.enabled,
    warning_threshold = excluded.warning_threshold,
    critical_threshold = excluded.critical_threshold,
    lookback_period = excluded.lookback_period
  returning id
)
select 'phase_13_alert_settings' as section, (select count(*) from alert_setting_rows) as expected_rows, (select count(*) from upserted_alert_settings) as upserted_rows;

with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
weight_rows as (
  select org.id as organization_id, row.category, row.weight, true as active
  from avora_org org
  join (
    values
      ('financial', 0.30::numeric),
      ('sales', 0.20::numeric),
      ('marketing', 0.18::numeric),
      ('operations', 0.17::numeric),
      ('retention', 0.15::numeric)
  ) as row(category, weight) on true
),
upserted_weights as (
  insert into public.executive_scorecard_weights (organization_id, category, weight, active)
  select organization_id, category, weight, active
  from weight_rows
  on conflict (organization_id, category)
  do update set weight = excluded.weight, active = excluded.active
  returning id
)
select 'phase_13_scorecard_weights' as section, (select count(*) from weight_rows) as expected_rows, (select count(*) from upserted_weights) as upserted_rows;

with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
profile_rows as (
  select
    org.id as organization_id,
    l.id as location_id,
    row.opening_date,
    row.maturity_stage,
    row.target_profile::jsonb as target_profile
  from avora_org org
  join (
    values
      ('miami', date '2022-04-01', 'mature', '{"demo": true, "market": "flagship", "monthly_review_focus": "maintain contribution and inventory stability"}'),
      ('tampa', date '2023-08-01', 'established', '{"demo": true, "market": "growth", "monthly_review_focus": "improve close rate and labor leverage"}'),
      ('jacksonville', date '2025-01-15', 'ramp_up', '{"demo": true, "market": "ramp-up", "monthly_review_focus": "build marketing efficiency and provider utilization"}')
  ) as row(location_slug, opening_date, maturity_stage, target_profile) on true
  join public.locations l on l.organization_id = org.id and lower(l.slug) = row.location_slug
),
upserted_profiles as (
  insert into public.location_operating_profiles (
    organization_id,
    location_id,
    opening_date,
    maturity_stage,
    target_profile
  )
  select organization_id, location_id, opening_date, maturity_stage, target_profile
  from profile_rows
  on conflict (organization_id, location_id)
  do update set
    opening_date = excluded.opening_date,
    maturity_stage = excluded.maturity_stage,
    target_profile = excluded.target_profile
  returning id
)
select 'phase_13_location_profiles' as section, (select count(*) from profile_rows) as expected_rows, (select count(*) from upserted_profiles) as upserted_rows;

with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
  limit 1
),
view_rows as (
  select
    org.id as organization_id,
    owner_user.id as user_id,
    row.name,
    row.view_type,
    row.filters_json::jsonb as filters_json,
    true as shared
  from avora_org org
  cross join owner_user
  join (
    values
      ('Company MTD', 'dashboard', '{"period": "this_month", "location": "all"}'),
      ('Miami Monthly', 'location', '{"period": "this_month", "location_slug": "miami"}'),
      ('Sales Performance', 'dashboard', '{"period": "this_month", "section": "sales"}'),
      ('Marketing Efficiency', 'dashboard', '{"period": "this_month", "section": "marketing"}'),
      ('Operations Review', 'weekly_review', '{"period": "this_week", "section": "operations"}'),
      ('Quarterly Review', 'monthly_review', '{"period": "this_quarter", "location": "all"}')
  ) as row(name, view_type, filters_json) on true
),
upserted_views as (
  insert into public.executive_saved_views (
    organization_id,
    user_id,
    name,
    view_type,
    filters_json,
    shared
  )
  select organization_id, user_id, name, view_type, filters_json, shared
  from view_rows
  on conflict (organization_id, name)
  do update set
    user_id = excluded.user_id,
    view_type = excluded.view_type,
    filters_json = excluded.filters_json,
    shared = excluded.shared
  returning id
)
select 'phase_13_saved_views' as section, (select count(*) from view_rows) as expected_rows, (select count(*) from upserted_views) as upserted_rows;

with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
alert_rows as (
  select
    org.id as organization_id,
    l.id as location_id,
    row.alert_type,
    row.severity,
    row.title,
    row.summary,
    row.evidence_json::jsonb as evidence_json,
    row.identity_key,
    row.expires_at
  from avora_org org
  join (
    values
      ('tampa', 'close_rate_down', 'watch', 'Demo: Tampa close rate watch', 'Tampa close-rate progress is seeded as a demo executive watch item for the August operating review.', '{"demo": true, "metric_key": "close_rate_percent", "period": "2026-08"}', 'demo:2026-08:tampa:close_rate_down', now() + interval '30 days'),
      ('miami', 'inventory_expiring', 'important', 'Demo: Miami inventory expiration review', 'Miami has seeded expiring-lot attention so the owner alert workflow can be tested.', '{"demo": true, "metric_key": "inventory_expiring", "period": "2026-08"}', 'demo:2026-08:miami:inventory_expiring', now() + interval '30 days'),
      ('jacksonville', 'revenue_growth_positive', 'info', 'Demo: Jacksonville revenue growth positive', 'Jacksonville is seeded with a positive growth note for expansion-readiness review.', '{"demo": true, "metric_key": "net_collected_revenue_cents", "period": "2026-08"}', 'demo:2026-08:jacksonville:revenue_growth_positive', now() + interval '30 days')
  ) as row(location_slug, alert_type, severity, title, summary, evidence_json, identity_key, expires_at) on true
  join public.locations l on l.organization_id = org.id and lower(l.slug) = row.location_slug
),
upserted_alerts as (
  insert into public.executive_alerts (
    organization_id,
    location_id,
    alert_type,
    severity,
    title,
    summary,
    evidence_json,
    identity_key,
    expires_at
  )
  select organization_id, location_id, alert_type, severity, title, summary, evidence_json, identity_key, expires_at
  from alert_rows
  on conflict (organization_id, identity_key)
  where status in ('active', 'acknowledged')
  do update set
    location_id = excluded.location_id,
    alert_type = excluded.alert_type,
    severity = excluded.severity,
    title = excluded.title,
    summary = excluded.summary,
    evidence_json = excluded.evidence_json,
    expires_at = excluded.expires_at
  returning id
)
select 'phase_13_demo_alerts' as section, (select count(*) from alert_rows) as expected_rows, (select count(*) from upserted_alerts) as upserted_rows;

with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
snapshot_rows as (
  select
    org.id as organization_id,
    l.id as location_id,
    row.snapshot_date,
    row.metric_key,
    row.metric_value,
    row.metadata::jsonb as metadata
  from avora_org org
  join (
    values
      (null, current_date - 1, 'net_collected_revenue_cents', 5120000::numeric, '{"demo": true}'),
      (null, current_date - 1, 'contribution_before_overhead_cents', 2810000::numeric, '{"demo": true}'),
      ('miami', current_date - 1, 'net_collected_revenue_cents', 2240000::numeric, '{"demo": true}'),
      ('tampa', current_date - 1, 'net_collected_revenue_cents', 1680000::numeric, '{"demo": true}'),
      ('jacksonville', current_date - 1, 'net_collected_revenue_cents', 1200000::numeric, '{"demo": true}'),
      ('miami', current_date - 1, 'nps', 72::numeric, '{"demo": true}'),
      ('tampa', current_date - 1, 'nps', 63::numeric, '{"demo": true}'),
      ('jacksonville', current_date - 1, 'nps', 59::numeric, '{"demo": true}')
  ) as row(location_slug, snapshot_date, metric_key, metric_value, metadata) on true
  left join public.locations l on l.organization_id = org.id and lower(l.slug) = row.location_slug
  where row.location_slug is null or l.id is not null
),
upserted_snapshots as (
  insert into public.executive_metric_snapshots (
    organization_id,
    location_id,
    snapshot_date,
    metric_key,
    metric_value,
    metadata
  )
  select organization_id, location_id, snapshot_date, metric_key, metric_value, metadata
  from snapshot_rows
  on conflict (
    organization_id,
    (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    snapshot_date,
    metric_key
  )
  do update set
    metric_value = excluded.metric_value,
    metadata = excluded.metadata
  returning id
)
select 'phase_13_snapshots' as section, (select count(*) from snapshot_rows) as expected_rows, (select count(*) from upserted_snapshots) as upserted_rows;

select
  'phase_13_verification' as section,
  (select count(*) from public.executive_targets et join public.organizations o on o.id = et.organization_id where o.slug = 'avora') as targets,
  (select count(*) from public.executive_alert_settings eas join public.organizations o on o.id = eas.organization_id where o.slug = 'avora') as alert_settings,
  (select count(*) from public.executive_scorecard_weights esw join public.organizations o on o.id = esw.organization_id where o.slug = 'avora') as scorecard_weights,
  (select count(*) from public.location_operating_profiles lop join public.organizations o on o.id = lop.organization_id where o.slug = 'avora') as location_operating_profiles,
  (select count(*) from public.executive_saved_views esv join public.organizations o on o.id = esv.organization_id where o.slug = 'avora') as saved_views,
  (select count(*) from public.executive_alerts ea join public.organizations o on o.id = ea.organization_id where o.slug = 'avora') as executive_alerts,
  (select count(*) from public.executive_metric_snapshots ems join public.organizations o on o.id = ems.organization_id where o.slug = 'avora') as metric_snapshots;
