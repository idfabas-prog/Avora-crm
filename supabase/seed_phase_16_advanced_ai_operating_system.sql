with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
)
insert into public.ai_operating_settings (
  organization_id,
  location_id,
  setting_key,
  ai_operating_mode,
  enabled,
  configuration_json,
  notification_rules_json,
  safety_rules_json
)
select
  org.id,
  null::uuid,
  'default_operating_system',
  'development',
  true,
  '{
    "demo": true,
    "brief_generation": "deterministic",
    "prediction_method": "rule_based_scoring",
    "forecast_methods": ["run_rate", "rolling_average", "weighted_recent_average"],
    "max_daily_briefs": 3
  }'::jsonb,
  '{
    "owner_daily_brief": true,
    "manager_daily_brief": true,
    "sales_daily_brief": true,
    "send_external_notifications": false
  }'::jsonb,
  '{
    "advisory_only": true,
    "no_autonomous_messages": true,
    "no_autonomous_calls": true,
    "no_live_payments": true,
    "no_clinical_advice": true,
    "no_inventory_mutations": true,
    "no_payroll_mutations": true,
    "no_ad_budget_changes": true,
    "no_workflow_publishing": true
  }'::jsonb
from org
on conflict (organization_id, setting_key) where location_id is null do update
set
  ai_operating_mode = excluded.ai_operating_mode,
  enabled = excluded.enabled,
  configuration_json = excluded.configuration_json,
  notification_rules_json = excluded.notification_rules_json,
  safety_rules_json = excluded.safety_rules_json,
  updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
locations as (
  select
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1) as miami_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1) as tampa_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'jacksonville' limit 1) as jacksonville_id
),
owner_user as (
  select up.id
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  where up.organization_id = (select id from org)
    and (lower(trim(up.email)) = 'owner@avora-demo.com' or lower(trim(r.name)) = 'owner')
  order by case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end, up.created_at
  limit 1
),
seeded_insights (insight_key, location_id, category, insight_type, severity, title, summary, evidence_json, confidence, comparison_period, current_value, baseline_value, difference_value, affected_records_count, supporting_route) as (
  values
    ('phase16:tampa:no_show_watch', (select tampa_id from locations), 'risk', 'no_show_risk', 'important', 'Tampa no-show risk is elevated', 'Fictional demo appointment patterns show Tampa reminders need review before tomorrow.', '{"demo":true,"drivers":["missed recent call","late confirmation","prior no-show signal"],"safety":"Review only; no message is sent automatically."}'::jsonb, 0.78, 'last_14_days', 0.29, 0.17, 0.12, 12, '/ai/risk/no-shows'),
    ('phase16:miami:lead_velocity', (select miami_id from locations), 'revenue', 'lead_conversion_opportunity', 'watch', 'Miami lead velocity has a same-day opportunity', 'Fictional demo leads with booked consults are ready for human follow-up.', '{"demo":true,"drivers":["high intent source","recent inbound message","open task count low"],"safety":"Sales action requires user review."}'::jsonb, 0.82, 'today', 3, 1, 2, 3, '/ai/revenue-opportunities'),
    ('phase16:jacksonville:churn_watch', (select jacksonville_id from locations), 'retention', 'churn_risk', 'watch', 'Jacksonville inactive-contact watch', 'Fictional demo inactive contacts should be reviewed for reactivation eligibility.', '{"demo":true,"drivers":["longer activity gap","no recent appointment","open conversation"],"privacy":"No clinical details included."}'::jsonb, 0.68, 'last_30_days', 4, 2, 2, 4, '/ai/risk/churn'),
    ('phase16:company:collections', null::uuid, 'collections', 'collections_priority', 'important', 'Outstanding balances need a review queue', 'Fictional demo sales show collectible balances that should be reviewed before outreach.', '{"demo":true,"drivers":["balance due","recent sale","payment status"],"safety":"AI does not charge cards or issue payment requests."}'::jsonb, 0.74, 'month_to_date', 5, 2, 3, 5, '/ai/collections'),
    ('phase16:company:forecast_gap', null::uuid, 'forecast', 'forecast_gap', 'watch', 'Run-rate forecast needs owner review', 'Fictional demo forecast records show the month needs attention before changing targets.', '{"demo":true,"method":"run_rate","limitation":"Small demo sample size."}'::jsonb, 0.66, 'month_to_date', 0.88, 1.0, -0.12, 9, '/executive/brief')
)
insert into public.ai_insights (
  organization_id,
  location_id,
  insight_key,
  category,
  insight_type,
  severity,
  title,
  summary,
  evidence_json,
  confidence,
  comparison_period,
  current_value,
  baseline_value,
  difference_value,
  affected_records_count,
  supporting_route,
  status,
  generated_by,
  expires_at,
  model_version,
  rules_version
)
select
  org.id,
  seeded_insights.location_id,
  seeded_insights.insight_key,
  seeded_insights.category,
  seeded_insights.insight_type,
  seeded_insights.severity,
  seeded_insights.title,
  seeded_insights.summary,
  seeded_insights.evidence_json,
  seeded_insights.confidence,
  seeded_insights.comparison_period,
  seeded_insights.current_value,
  seeded_insights.baseline_value,
  seeded_insights.difference_value,
  seeded_insights.affected_records_count,
  seeded_insights.supporting_route,
  'active',
  (select id from owner_user),
  now() + interval '14 days',
  'deterministic-operating-v1',
  'phase-16-v1'
from seeded_insights
cross join org
on conflict (organization_id, insight_key) where insight_key is not null do update
set
  location_id = excluded.location_id,
  category = excluded.category,
  insight_type = excluded.insight_type,
  severity = excluded.severity,
  title = excluded.title,
  summary = excluded.summary,
  evidence_json = excluded.evidence_json,
  confidence = excluded.confidence,
  comparison_period = excluded.comparison_period,
  current_value = excluded.current_value,
  baseline_value = excluded.baseline_value,
  difference_value = excluded.difference_value,
  affected_records_count = excluded.affected_records_count,
  supporting_route = excluded.supporting_route,
  status = excluded.status,
  expires_at = excluded.expires_at,
  updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
contacts as (
  select
    (select id from public.contacts where organization_id = (select id from org) and lower(trim(email)) = 'isabella.m@example.com' limit 1) as isabella_id,
    (select id from public.contacts where organization_id = (select id from org) and lower(trim(email)) = 'camila.s@example.com' limit 1) as camila_id,
    (select id from public.contacts where organization_id = (select id from org) and lower(trim(email)) = 'danielle.c@example.com' limit 1) as danielle_id
),
locations as (
  select
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1) as miami_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1) as tampa_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'jacksonville' limit 1) as jacksonville_id
),
scores (score_key, location_id, score_type, entity_type, entity_id, score, band, confidence, explainability_json, excluded_factors_json, recommended_next_step, source_snapshot_json) as (
  values
    ('phase16:lead_conversion:isabella', (select miami_id from locations), 'lead_conversion', 'contact', (select isabella_id from contacts), 88, 'high', 0.84, '[{"factor":"Booked consult","points":24},{"factor":"Recent inbound interest","points":18},{"factor":"High-value opportunity","points":16}]'::jsonb, '["age","gender","race","diagnosis","medical history","protected health details"]'::jsonb, 'Review the open task and confirm the consult details with a human-approved touch.', '{"demo":true,"contact":"Isabella Martin"}'::jsonb),
    ('phase16:no_show:danielle', (select jacksonville_id from locations), 'no_show', 'contact', (select danielle_id from contacts), 73, 'high', 0.7, '[{"factor":"Recent scheduling question","points":18},{"factor":"No confirmed reminder response","points":17},{"factor":"Open conversation","points":10}]'::jsonb, '["health status","demographics","insurance status"]'::jsonb, 'Have a staff member verify appointment intent before the next reminder window.', '{"demo":true,"contact":"Danielle Cross"}'::jsonb),
    ('phase16:churn:camila', (select tampa_id from locations), 'churn', 'contact', (select camila_id from contacts), 64, 'medium', 0.66, '[{"factor":"Post-treatment lifecycle stage","points":15},{"factor":"No recent feedback response","points":12},{"factor":"Follow-up gap","points":11}]'::jsonb, '["clinical outcome","diagnosis","protected class"]'::jsonb, 'Review retention history and choose a compliant follow-up plan.', '{"demo":true,"contact":"Camila Stone"}'::jsonb),
    ('phase16:collection:camila', (select tampa_id from locations), 'collection', 'contact', (select camila_id from contacts), 79, 'high', 0.72, '[{"factor":"Recent sale activity","points":18},{"factor":"Balance review needed","points":18},{"factor":"High lifetime value","points":11}]'::jsonb, '["credit score","income","employment","protected class"]'::jsonb, 'Review the account before any payment conversation; AI cannot charge or collect.', '{"demo":true,"contact":"Camila Stone"}'::jsonb),
    ('phase16:reactivation:danielle', (select jacksonville_id from locations), 'reactivation', 'contact', (select danielle_id from contacts), 69, 'medium', 0.67, '[{"factor":"Google Search lead source","points":12},{"factor":"Open conversation","points":14},{"factor":"No sale yet","points":10}]'::jsonb, '["medical eligibility","diagnosis","age"]'::jsonb, 'Review reactivation eligibility and suppressions before any outreach.', '{"demo":true,"contact":"Danielle Cross"}'::jsonb),
    ('phase16:revenue:miami', (select miami_id from locations), 'revenue_opportunity', 'location', (select miami_id from locations), 76, 'high', 0.75, '[{"factor":"High-intent booked consults","points":18},{"factor":"Strong lead source","points":12},{"factor":"Available same-day follow-up capacity","points":11}]'::jsonb, '["clinical suitability","protected class"]'::jsonb, 'Review Miami follow-up queue before changing staffing or campaign budgets.', '{"demo":true,"location":"Miami"}'::jsonb)
)
insert into public.predictive_scores (
  organization_id,
  location_id,
  score_key,
  score_type,
  entity_type,
  entity_id,
  score,
  label,
  band,
  confidence,
  factors_json,
  explainability_json,
  excluded_factors_json,
  recommended_next_step,
  source_snapshot_json,
  model_version,
  rules_version
)
select
  org.id,
  scores.location_id,
  scores.score_key,
  scores.score_type,
  scores.entity_type,
  scores.entity_id,
  scores.score,
  initcap(replace(scores.band, '_', ' ')),
  scores.band,
  scores.confidence,
  scores.explainability_json,
  scores.explainability_json,
  scores.excluded_factors_json,
  scores.recommended_next_step,
  scores.source_snapshot_json,
  'deterministic-operating-v1',
  'phase-16-v1'
from scores
cross join org
where scores.entity_id is not null
on conflict (organization_id, score_key) do update
set
  location_id = excluded.location_id,
  score_type = excluded.score_type,
  entity_type = excluded.entity_type,
  entity_id = excluded.entity_id,
  score = excluded.score,
  label = excluded.label,
  band = excluded.band,
  confidence = excluded.confidence,
  factors_json = excluded.factors_json,
  explainability_json = excluded.explainability_json,
  excluded_factors_json = excluded.excluded_factors_json,
  recommended_next_step = excluded.recommended_next_step,
  source_snapshot_json = excluded.source_snapshot_json,
  calculated_at = now(),
  updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
locations as (
  select
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1) as miami_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1) as tampa_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'jacksonville' limit 1) as jacksonville_id
),
users as (
  select
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1) as owner_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1) as manager_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'sales@avora-demo.com' limit 1) as sales_id
),
recommendations (recommendation_key, location_id, assigned_user_id, recommendation_type, priority, title, summary, rationale_json, suggested_actions_json, safety_json, expected_impact_json, related_entity_type, related_entity_id) as (
  values
    ('phase16:owner:daily-priority', null::uuid, (select owner_id from users), 'operating_priority', 'high', 'Review Tampa no-show risk before noon', 'Fictional demo signals show preventable appointment leakage.', '["Tampa no-show watch is active","Recent missed call signal exists","Tomorrow reminder window is still open"]'::jsonb, '["Open /ai/risk/no-shows","Review staff-owned callback tasks","Approve any patient communication manually"]'::jsonb, '{"advisory_only":true,"no_messages_sent":true}'::jsonb, '{"metric":"show_rate","direction":"protect"}'::jsonb, 'location', (select tampa_id from locations)),
    ('phase16:owner:forecast-gap', null::uuid, (select owner_id from users), 'revenue_opportunity', 'medium', 'Review month-to-date revenue forecast', 'Fictional demo run-rate forecast is below target and needs operating context.', '["Small demo sample size","Run-rate below configured target","Forecast is not GAAP profit"]'::jsonb, '["Open /executive/brief","Compare location scorecards","Review contribution before overhead"]'::jsonb, '{"advisory_only":true,"no_target_changes":true}'::jsonb, '{"metric":"net_collected_revenue_cents","direction":"inspect"}'::jsonb, null, null::uuid),
    ('phase16:manager:tampa-collections', (select tampa_id from locations), (select manager_id from users), 'collections', 'high', 'Review Tampa balance follow-up queue', 'Fictional demo collections priority should be handled by a human.', '["Recent sale activity","Balance due signal","Patient communication requires review"]'::jsonb, '["Open /ai/collections","Check payment records","Create normal follow-up only after review"]'::jsonb, '{"advisory_only":true,"no_card_charge":true}'::jsonb, '{"metric":"balance_due","direction":"reduce"}'::jsonb, 'location', (select tampa_id from locations)),
    ('phase16:sales:isabella', (select miami_id from locations), (select sales_id from users), 'lead_follow_up', 'high', 'Prioritize Isabella Martin follow-up', 'Fictional demo lead score is high because of booked consult and recent activity.', '["High conversion score","Booked consult","Recent inbound interest"]'::jsonb, '["Open the contact","Review recent messages","Complete the existing task"]'::jsonb, '{"advisory_only":true,"no_autonomous_sms":true}'::jsonb, '{"metric":"close_rate","direction":"protect"}'::jsonb, 'contact', '10000000-0000-4000-8000-000000000501'::uuid),
    ('phase16:manager:jacksonville-reactivation', (select jacksonville_id from locations), (select manager_id from users), 'churn_prevention', 'medium', 'Review Jacksonville reactivation candidates', 'Fictional demo contact activity suggests a compliant retention review.', '["Open conversation","No sale recorded","Recent scheduling question"]'::jsonb, '["Open /ai/risk/churn","Check suppression status","Choose outreach manually"]'::jsonb, '{"advisory_only":true,"no_bulk_messaging":true}'::jsonb, '{"metric":"reactivation","direction":"inspect"}'::jsonb, 'location', (select jacksonville_id from locations)),
    ('phase16:owner:location-intelligence', (select miami_id from locations), (select owner_id from users), 'location_risk', 'medium', 'Compare Miami revenue opportunity with staffing', 'Fictional demo location intelligence should be reviewed before changing labor or ad budgets.', '["High-intent lead source","Available follow-up capacity","Budget changes are blocked"]'::jsonb, '["Open /ai/revenue-opportunities","Compare /executive location scorecards","Keep all budget changes manual"]'::jsonb, '{"advisory_only":true,"no_budget_change":true}'::jsonb, '{"metric":"conversion_capacity","direction":"inspect"}'::jsonb, 'location', (select miami_id from locations))
)
insert into public.ai_recommendations (
  organization_id,
  location_id,
  assigned_user_id,
  recommendation_key,
  recommendation_type,
  priority,
  title,
  summary,
  rationale_json,
  suggested_actions_json,
  safety_json,
  expected_impact_json,
  related_entity_type,
  related_entity_id,
  status,
  model_version,
  rules_version
)
select
  org.id,
  recommendations.location_id,
  recommendations.assigned_user_id,
  recommendations.recommendation_key,
  recommendations.recommendation_type,
  recommendations.priority,
  recommendations.title,
  recommendations.summary,
  recommendations.rationale_json,
  recommendations.suggested_actions_json,
  recommendations.safety_json,
  recommendations.expected_impact_json,
  recommendations.related_entity_type,
  recommendations.related_entity_id,
  'open',
  'deterministic-operating-v1',
  'phase-16-v1'
from recommendations
cross join org
on conflict (organization_id, recommendation_key) do update
set
  location_id = excluded.location_id,
  assigned_user_id = excluded.assigned_user_id,
  recommendation_type = excluded.recommendation_type,
  priority = excluded.priority,
  title = excluded.title,
  summary = excluded.summary,
  rationale_json = excluded.rationale_json,
  suggested_actions_json = excluded.suggested_actions_json,
  safety_json = excluded.safety_json,
  expected_impact_json = excluded.expected_impact_json,
  related_entity_type = excluded.related_entity_type,
  related_entity_id = excluded.related_entity_id,
  updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
locations as (
  select
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1) as miami_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1) as tampa_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'jacksonville' limit 1) as jacksonville_id
),
forecasts (forecast_key, location_id, metric_key, metric_label, actual_value, forecast_value, target_value, method, confidence, assumptions_json, limitations_json, source_snapshot_json) as (
  values
    ('phase16:company:net-revenue:month', null::uuid, 'net_collected_revenue_cents', 'Net Collected Revenue', 1845000, 4120000, 5000000, 'run_rate', 'moderate', '["Uses fictional month-to-date demo records","Assumes current booking pace continues"]'::jsonb, '["Small demo dataset","Not GAAP profit or EBITDA"]'::jsonb, '{"demo":true,"records_reviewed":24}'::jsonb),
    ('phase16:company:sales-count:month', null::uuid, 'sales_count', 'Sales Count', 7, 16, 20, 'rolling_average', 'moderate', '["Uses recent demo sales velocity"]'::jsonb, '["Starter dataset only"]'::jsonb, '{"demo":true,"records_reviewed":7}'::jsonb),
    ('phase16:company:bookings:month', null::uuid, 'bookings_count', 'Bookings Count', 18, 42, 50, 'weighted_recent_average', 'moderate', '["Weights the latest fictional booking activity"]'::jsonb, '["No external demand signal"]'::jsonb, '{"demo":true,"records_reviewed":18}'::jsonb),
    ('phase16:company:marketing-spend:month', null::uuid, 'marketing_spend_cents', 'Marketing Spend', 620000, 1450000, 1500000, 'run_rate', 'high', '["Uses fixed demo spend records"]'::jsonb, '["No live Meta or Google API calls"]'::jsonb, '{"demo":true,"records_reviewed":9}'::jsonb),
    ('phase16:company:labor-cost:month', null::uuid, 'labor_cost_cents', 'Direct Labor Cost', 420000, 940000, 1100000, 'run_rate', 'limited', '["Uses fictional workforce seed records"]'::jsonb, '["Payroll export does not move money or calculate taxes"]'::jsonb, '{"demo":true,"records_reviewed":8}'::jsonb),
    ('phase16:company:contribution:month', null::uuid, 'contribution_before_overhead_cents', 'Contribution Before Overhead', 1025000, 2320000, 3000000, 'run_rate', 'limited', '["Collected revenue less direct labor and inventory COGS"]'::jsonb, '["Not EBITDA, net income, or GAAP profit"]'::jsonb, '{"demo":true,"records_reviewed":24}'::jsonb),
    ('phase16:miami:conversion:month', (select miami_id from locations), 'lead_conversion_rate', 'Miami Lead Conversion Rate', 0.32, 0.38, 0.4, 'weighted_recent_average', 'limited', '["Uses fictional lead and opportunity activity"]'::jsonb, '["Does not use protected attributes"]'::jsonb, '{"demo":true,"records_reviewed":6}'::jsonb),
    ('phase16:tampa:show-rate:month', (select tampa_id from locations), 'show_rate', 'Tampa Show Rate', 0.71, 0.69, 0.82, 'rolling_average', 'limited', '["Uses fictional appointment activity"]'::jsonb, '["Small demo appointment count"]'::jsonb, '{"demo":true,"records_reviewed":7}'::jsonb)
)
insert into public.forecast_records (
  organization_id,
  location_id,
  forecast_key,
  metric_key,
  metric_label,
  period_start,
  period_end,
  actual_value,
  forecast_value,
  target_value,
  gap_value,
  method,
  confidence,
  assumptions_json,
  limitations_json,
  source_snapshot_json,
  model_version,
  rules_version
)
select
  org.id,
  forecasts.location_id,
  forecasts.forecast_key,
  forecasts.metric_key,
  forecasts.metric_label,
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  forecasts.actual_value,
  forecasts.forecast_value,
  forecasts.target_value,
  forecasts.forecast_value - forecasts.target_value,
  forecasts.method,
  forecasts.confidence,
  forecasts.assumptions_json,
  forecasts.limitations_json,
  forecasts.source_snapshot_json,
  'deterministic-operating-v1',
  'phase-16-v1'
from forecasts
cross join org
on conflict (organization_id, forecast_key) do update
set
  location_id = excluded.location_id,
  metric_key = excluded.metric_key,
  metric_label = excluded.metric_label,
  period_start = excluded.period_start,
  period_end = excluded.period_end,
  actual_value = excluded.actual_value,
  forecast_value = excluded.forecast_value,
  target_value = excluded.target_value,
  gap_value = excluded.gap_value,
  method = excluded.method,
  confidence = excluded.confidence,
  assumptions_json = excluded.assumptions_json,
  limitations_json = excluded.limitations_json,
  source_snapshot_json = excluded.source_snapshot_json,
  generated_at = now(),
  updated_at = now();

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
locations as (
  select
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1) as miami_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1) as tampa_id
),
users as (
  select
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1) as owner_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1) as manager_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'sales@avora-demo.com' limit 1) as sales_id
),
briefs (brief_key, location_id, audience_user_id, brief_type, audience_type, title, summary, sections_json, top_priorities_json, limitations_json, confidence) as (
  values
    ('phase16:owner:daily-executive', null::uuid, (select owner_id from users), 'executive_daily', 'owner', 'Daily Executive Operating Brief', 'Fictional demo brief: revenue forecast, no-show risk, and collections queue need review today.', '[{"heading":"Revenue","body":"Net collected revenue forecast is moderate confidence and below target."},{"heading":"Risk","body":"Tampa no-show risk and collections follow-up are the top watch areas."},{"heading":"Safety","body":"Ask Avora is advisory-only and cannot take operational actions."}]'::jsonb, '["Review Tampa no-show risk","Inspect month-to-date forecast gap","Review collections queue before outreach"]'::jsonb, '["Small fictional demo dataset","Not clinical advice","Not GAAP profit or EBITDA"]'::jsonb, 0.74),
    ('phase16:manager:tampa-daily', (select tampa_id from locations), (select manager_id from users), 'manager_daily', 'manager', 'Manager Daily Brief - Tampa', 'Fictional demo brief: focus on no-show prevention and balance review.', '[{"heading":"Appointments","body":"No-show risk is elevated in the demo data."},{"heading":"Collections","body":"Review balance follow-up manually."}]'::jsonb, '["Confirm tomorrow reminders","Review missed-call callbacks","Check open balance follow-ups"]'::jsonb, '["Location-limited view","No messages sent automatically"]'::jsonb, 0.7),
    ('phase16:sales:daily', (select miami_id from locations), (select sales_id from users), 'sales_daily', 'salesperson', 'Sales Daily Brief', 'Fictional demo brief: Isabella Martin is the top high-intent follow-up.', '[{"heading":"Top Lead","body":"Isabella Martin has a high conversion score."},{"heading":"Next Step","body":"Review the contact and existing task before outreach."}]'::jsonb, '["Open Isabella Martin","Review recent messages","Complete the approved follow-up task"]'::jsonb, '["User-specific sales view","No autonomous calls or SMS"]'::jsonb, 0.78)
)
insert into public.ai_operating_briefs (
  organization_id,
  location_id,
  audience_user_id,
  brief_key,
  brief_type,
  brief_date,
  audience_type,
  title,
  summary,
  metrics_snapshot_json,
  summary_json,
  sections_json,
  top_priorities_json,
  limitations_json,
  confidence,
  status,
  generated_by,
  model,
  model_version,
  rules_version
)
select
  org.id,
  briefs.location_id,
  briefs.audience_user_id,
  briefs.brief_key,
  briefs.brief_type,
  current_date,
  briefs.audience_type,
  briefs.title,
  briefs.summary,
  jsonb_build_object(
    'demo', true,
    'brief_date', current_date,
    'location_id', briefs.location_id,
    'audience_type', briefs.audience_type,
    'metrics', jsonb_build_array('net_collected_revenue_cents', 'show_rate', 'close_rate', 'marketing_spend_cents', 'labor_cost_percent', 'inventory_alerts', 'missed_call_rate')
  ),
  jsonb_build_object(
    'executive_summary', briefs.summary,
    'top_priorities', briefs.top_priorities_json,
    'advisory_only', true
  ),
  briefs.sections_json,
  briefs.top_priorities_json,
  briefs.limitations_json,
  briefs.confidence,
  'ready',
  (select owner_id from users),
  'deterministic-operating-v1',
  'deterministic-operating-v1',
  'phase-16-v1'
from briefs
cross join org
on conflict (organization_id, brief_key) do update
set
  location_id = excluded.location_id,
  audience_user_id = excluded.audience_user_id,
  brief_type = excluded.brief_type,
  brief_date = excluded.brief_date,
  audience_type = excluded.audience_type,
  title = excluded.title,
  summary = excluded.summary,
  metrics_snapshot_json = excluded.metrics_snapshot_json,
  summary_json = excluded.summary_json,
  sections_json = excluded.sections_json,
  top_priorities_json = excluded.top_priorities_json,
  limitations_json = excluded.limitations_json,
  confidence = excluded.confidence,
  status = excluded.status,
  generated_at = now(),
  updated_at = now();

-- Verification queries for Supabase SQL Editor:
-- select count(*) as phase16_operating_settings from public.ai_operating_settings s join public.organizations o on o.id = s.organization_id where o.slug = 'avora' and s.setting_key like 'default_operating_system%';
-- select count(*) as phase16_ai_insights from public.ai_insights i join public.organizations o on o.id = i.organization_id where o.slug = 'avora' and i.insight_key like 'phase16:%';
-- select count(*) as phase16_predictive_scores from public.predictive_scores ps join public.organizations o on o.id = ps.organization_id where o.slug = 'avora' and ps.score_key like 'phase16:%';
-- select count(*) as phase16_recommendations from public.ai_recommendations ar join public.organizations o on o.id = ar.organization_id where o.slug = 'avora' and ar.recommendation_key like 'phase16:%';
-- select count(*) as phase16_forecasts from public.forecast_records fr join public.organizations o on o.id = fr.organization_id where o.slug = 'avora' and fr.forecast_key like 'phase16:%';
-- select count(*) as phase16_briefs from public.ai_operating_briefs b join public.organizations o on o.id = b.organization_id where o.slug = 'avora' and b.brief_key like 'phase16:%';
