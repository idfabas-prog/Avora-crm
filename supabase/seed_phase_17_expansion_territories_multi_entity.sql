with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
)
insert into public.operating_entities (id, organization_id, name, entity_type, legal_name, external_reference, active)
select seed.id, org.id, seed.name, seed.entity_type, seed.legal_name, seed.external_reference, true
from org
cross join (
  values
    ('10000000-0000-4000-8000-000000017001'::uuid, 'Avora Corporate Operations', 'corporate', 'Avora Corporate Operations Demo LLC', 'DEMO-CORP'),
    ('10000000-0000-4000-8000-000000017002'::uuid, 'Avora Florida Management', 'management_company', 'Avora Florida Management Demo LLC', 'DEMO-MGMT'),
    ('10000000-0000-4000-8000-000000017003'::uuid, 'Suncoast Partner Group', 'partner', 'Suncoast Partner Group Demo LLC', 'DEMO-PARTNER'),
    ('10000000-0000-4000-8000-000000017004'::uuid, 'North Florida Franchise Demo', 'franchise', 'North Florida Franchise Demo LLC', 'DEMO-FRANCHISE')
) as seed(id, name, entity_type, legal_name, external_reference)
on conflict (organization_id, name) do update
set entity_type = excluded.entity_type, legal_name = excluded.legal_name, external_reference = excluded.external_reference, active = excluded.active, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1)
insert into public.regions (id, organization_id, name, code, description, active)
select seed.id, org.id, seed.name, seed.code, seed.description, true
from org
cross join (
  values
    ('10000000-0000-4000-8000-000000017101'::uuid, 'South Florida', 'SFL', 'Fictional South Florida operating region.'),
    ('10000000-0000-4000-8000-000000017102'::uuid, 'West Florida', 'WFL', 'Fictional West Florida operating region.'),
    ('10000000-0000-4000-8000-000000017103'::uuid, 'North Florida', 'NFL', 'Fictional North Florida operating region.'),
    ('10000000-0000-4000-8000-000000017104'::uuid, 'Southeast Future', 'SEF', 'Future demo expansion region.')
) as seed(id, name, code, description)
on conflict (organization_id, name) do update
set code = excluded.code, description = excluded.description, active = excluded.active, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (
  select slug, id from public.locations where organization_id = (select id from org)
),
region_seed(region_name, location_slug) as (
  values
    ('South Florida', 'miami'),
    ('West Florida', 'tampa'),
    ('North Florida', 'jacksonville')
)
insert into public.region_locations (region_id, location_id, effective_start)
select r.id, l.id, current_date - interval '1 year'
from region_seed
join public.regions r on r.organization_id = (select id from org) and r.name = region_seed.region_name
join locations l on l.slug = region_seed.location_slug
on conflict (region_id, location_id, effective_start) do nothing;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
manager_user as (
  select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1
),
owner_user as (
  select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1
),
region_seed(region_name, user_id, role_type) as (
  values
    ('South Florida', (select owner_user.id from owner_user), 'regional_manager'),
    ('West Florida', (select manager_user.id from manager_user), 'regional_operations_manager'),
    ('North Florida', (select manager_user.id from manager_user), 'regional_manager')
)
insert into public.region_managers (region_id, user_id, role_type, active, effective_start)
select r.id, region_seed.user_id, region_seed.role_type, true, current_date - interval '90 days'
from region_seed
join public.regions r on r.organization_id = (select id from org) and r.name = region_seed.region_name
where region_seed.user_id is not null
on conflict (region_id, user_id, role_type, effective_start) do update
set active = excluded.active, effective_end = null, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
regions as (select name, id from public.regions where organization_id = (select id from org))
insert into public.territories (id, organization_id, name, territory_type, status, region_id, description, external_reference)
select seed.id, org.id, seed.name, seed.territory_type, seed.status, regions.id, seed.description, seed.external_reference
from org
cross join (
  values
    ('10000000-0000-4000-8000-000000017201'::uuid, 'Miami Core', 'protected', 'active', 'South Florida', 'Operational reporting territory for Miami. Not a legal territory right.', 'DEMO-TERR-MIA'),
    ('10000000-0000-4000-8000-000000017202'::uuid, 'Tampa Bay', 'corporate', 'active', 'West Florida', 'Operational reporting territory for Tampa Bay.', 'DEMO-TERR-TPA'),
    ('10000000-0000-4000-8000-000000017203'::uuid, 'Jacksonville', 'corporate', 'active', 'North Florida', 'Operational reporting territory for Jacksonville.', 'DEMO-TERR-JAX'),
    ('10000000-0000-4000-8000-000000017204'::uuid, 'Hollywood Development', 'development', 'under_development', 'South Florida', 'Fictional development territory near Miami for overlap demonstration.', 'DEMO-TERR-HWD'),
    ('10000000-0000-4000-8000-000000017205'::uuid, 'Sarasota Development', 'development', 'reserved', 'West Florida', 'Fictional Sarasota development territory.', 'DEMO-TERR-SRQ')
) as seed(id, name, territory_type, status, region_name, description, external_reference)
left join regions on regions.name = seed.region_name
on conflict (organization_id, name) do update
set territory_type = excluded.territory_type, status = excluded.status, region_id = excluded.region_id, description = excluded.description, external_reference = excluded.external_reference, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
territories as (select name, id from public.territories where organization_id = (select id from org)),
geo_seed(territory_name, geography_type, geography_value, radius_miles, center_lat, center_lng) as (
  values
    ('Miami Core', 'city', 'Miami', null::numeric, null::numeric, null::numeric),
    ('Miami Core', 'postal_code', '33130', null::numeric, null::numeric, null::numeric),
    ('Tampa Bay', 'city', 'Tampa', null::numeric, null::numeric, null::numeric),
    ('Tampa Bay', 'postal_code', '33602', null::numeric, null::numeric, null::numeric),
    ('Jacksonville', 'city', 'Jacksonville', null::numeric, null::numeric, null::numeric),
    ('Hollywood Development', 'city', 'Hollywood', null::numeric, null::numeric, null::numeric),
    ('Hollywood Development', 'postal_code', '33130', null::numeric, null::numeric, null::numeric),
    ('Sarasota Development', 'city', 'Sarasota', null::numeric, null::numeric, null::numeric),
    ('Sarasota Development', 'radius', 'Sarasota demo radius', 8::numeric, 27.3364::numeric, -82.5307::numeric)
)
insert into public.territory_geographies (territory_id, geography_type, geography_value, radius_miles, center_lat, center_lng)
select territories.id, geo_seed.geography_type, geo_seed.geography_value, geo_seed.radius_miles, geo_seed.center_lat, geo_seed.center_lng
from geo_seed
join territories on territories.name = geo_seed.territory_name
on conflict (territory_id, geography_type, geography_value) do update
set radius_miles = excluded.radius_miles, center_lat = excluded.center_lat, center_lng = excluded.center_lng;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org)),
territories as (select name, id from public.territories where organization_id = (select id from org)),
seed(location_slug, territory_name) as (
  values ('miami', 'Miami Core'), ('tampa', 'Tampa Bay'), ('jacksonville', 'Jacksonville')
)
insert into public.location_territories (location_id, territory_id, effective_start, primary_assignment)
select locations.id, territories.id, current_date - interval '1 year', true
from seed
join locations on locations.slug = seed.location_slug
join territories on territories.name = seed.territory_name
on conflict (location_id, territory_id, effective_start) do update
set primary_assignment = excluded.primary_assignment;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org)),
entities as (select name, id from public.operating_entities where organization_id = (select id from org)),
seed(location_slug, entity_name, ownership_type, ownership_percent) as (
  values
    ('miami', 'Avora Corporate Operations', 'corporate_owned', 100::numeric),
    ('tampa', 'Avora Florida Management', 'managed', 100::numeric),
    ('jacksonville', 'North Florida Franchise Demo', 'franchise_operated', 100::numeric)
)
insert into public.location_entities (organization_id, location_id, operating_entity_id, ownership_type, ownership_percent, effective_start, primary_entity)
select (select id from org), locations.id, entities.id, seed.ownership_type, seed.ownership_percent, current_date - interval '1 year', true
from seed
join locations on locations.slug = seed.location_slug
join entities on entities.name = seed.entity_name
on conflict (location_id, operating_entity_id, effective_start) do update
set ownership_type = excluded.ownership_type, ownership_percent = excluded.ownership_percent, primary_entity = excluded.primary_entity, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
territories as (select name, id from public.territories where organization_id = (select id from org))
insert into public.territory_overlap_warnings (organization_id, territory_id, overlapping_territory_id, overlap_type, geography_type, geography_value, severity, status, evidence_json)
select (select id from org), h.id, m.id, 'potential_overlap', 'postal_code', '33130', 'watch', 'open', '{"demo":true,"reason":"Hollywood Development and Miami Core both include demo ZIP 33130. This is an operational warning, not a legal decision."}'::jsonb
from territories h
join territories m on m.name = 'Miami Core'
where h.name = 'Hollywood Development'
on conflict (organization_id, territory_id, overlapping_territory_id, geography_type, geography_value) do update
set status = excluded.status, severity = excluded.severity, evidence_json = excluded.evidence_json, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
regions as (select name, id from public.regions where organization_id = (select id from org)),
territories as (select name, id from public.territories where organization_id = (select id from org)),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1),
manager_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1)
insert into public.expansion_projects (id, organization_id, region_id, territory_id, proposed_name, market_name, project_type, stage, target_open_date, assigned_owner_user_id, estimated_buildout_cost_cents, estimated_monthly_rent_cents, estimated_launch_budget_cents, notes, readiness_score, risk_level)
select seed.id, org.id, regions.id, territories.id, seed.proposed_name, seed.market_name, seed.project_type, seed.stage, current_date + seed.days_to_open, seed.owner_id, seed.buildout, seed.rent, seed.launch_budget, seed.notes, seed.readiness_score, seed.risk_level
from org
cross join (
  values
    ('10000000-0000-4000-8000-000000017301'::uuid, 'South Florida', 'Hollywood Development', 'Hollywood Clinic', 'Hollywood, FL', 'new_corporate_clinic', 'site_search', interval '135 days', (select id from owner_user), 125000000, 1850000, 28000000, 'Fictional Hollywood launch project for Phase 17 demo.', 71, 'watch'),
    ('10000000-0000-4000-8000-000000017302'::uuid, 'West Florida', 'Sarasota Development', 'Sarasota Clinic', 'Sarasota, FL', 'partner_location', 'market_research', interval '210 days', (select id from manager_user), 98000000, 1425000, 22000000, 'Fictional partner-location planning project.', 34, 'important'),
    ('10000000-0000-4000-8000-000000017303'::uuid, 'North Florida', 'Jacksonville', 'Jacksonville Expansion', 'Jacksonville, FL', 'expansion', 'construction', interval '82 days', (select id from manager_user), 72000000, 950000, 16000000, 'Fictional expansion inside existing Jacksonville market.', 76, 'watch')
) as seed(id, region_name, territory_name, proposed_name, market_name, project_type, stage, days_to_open, owner_id, buildout, rent, launch_budget, notes, readiness_score, risk_level)
left join regions on regions.name = seed.region_name
left join territories on territories.name = seed.territory_name
on conflict (organization_id, proposed_name) do update
set region_id = excluded.region_id, territory_id = excluded.territory_id, market_name = excluded.market_name, project_type = excluded.project_type, stage = excluded.stage, target_open_date = excluded.target_open_date, assigned_owner_user_id = excluded.assigned_owner_user_id, estimated_buildout_cost_cents = excluded.estimated_buildout_cost_cents, estimated_monthly_rent_cents = excluded.estimated_monthly_rent_cents, estimated_launch_budget_cents = excluded.estimated_launch_budget_cents, notes = excluded.notes, readiness_score = excluded.readiness_score, risk_level = excluded.risk_level, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects where proposed_name in ('Hollywood Clinic', 'Sarasota Clinic', 'Jacksonville Expansion')),
site_seed(project_name, name, address_line_1, city, state, postal_code, square_feet, rent, cam, parking_notes, visibility_score, demographic_notes, status, site_score, cannibalization_risk, evaluation_json) as (
  values
    ('Hollywood Clinic', 'Hollywood Circle Retail', '2100 Demo Circle', 'Hollywood', 'FL', '33020', 3100, 1750000, 210000, 'Shared garage and 12 demo reserved spaces.', 82, 'Fictional dense retail corridor.', 'preferred', 84, 'moderate', '{"drivers":["Strong visibility","Good parking","ZIP overlap warning with Miami Core"],"due_diligence":"Required"}'::jsonb),
    ('Hollywood Clinic', 'Young Circle Medical Office', '1800 Sample Avenue', 'Hollywood', 'FL', '33020', 2600, 1480000, 185000, 'Surface lot; peak-hour constraints.', 74, 'Fictional medical-office demand.', 'considering', 76, 'moderate', '{"drivers":["Lower rent","Medical context","Less visible street frontage"],"due_diligence":"Required"}'::jsonb),
    ('Hollywood Clinic', 'Aventura Edge Suite', '2999 Fictional Way', 'Aventura', 'FL', '33180', 3400, 2150000, 260000, 'Garage validation available in demo notes.', 88, 'Fictional affluent market adjacency.', 'considering', 79, 'high', '{"drivers":["Strong demographics","Higher rent","Closer overlap with Miami"],"due_diligence":"Required"}'::jsonb),
    ('Sarasota Clinic', 'Sarasota Downtown Demo Site', '100 Demo Main Street', 'Sarasota', 'FL', '34236', 2900, 1425000, 170000, 'Downtown garage access.', 77, 'Fictional Gulf Coast demand profile.', 'considering', 72, 'low', '{"drivers":["New market whitespace","Partner model still early"],"due_diligence":"Required"}'::jsonb),
    ('Jacksonville Expansion', 'Jax Training Suite', '450 Demo Bay Road', 'Jacksonville', 'FL', '32202', 2200, 950000, 110000, 'Existing clinic-adjacent parking.', 70, 'Fictional expansion suite.', 'selected', 81, 'low', '{"drivers":["Close to existing operations","Lower launch complexity"],"due_diligence":"Required"}'::jsonb)
)
insert into public.expansion_sites (expansion_project_id, name, address_line_1, city, state, postal_code, square_feet, asking_rent_cents, estimated_cam_cents, parking_notes, visibility_score, demographic_notes, status, site_score, cannibalization_risk, evaluation_json)
select projects.id, site_seed.name, site_seed.address_line_1, site_seed.city, site_seed.state, site_seed.postal_code, site_seed.square_feet, site_seed.rent, site_seed.cam, site_seed.parking_notes, site_seed.visibility_score, site_seed.demographic_notes, site_seed.status, site_seed.site_score, site_seed.cannibalization_risk, site_seed.evaluation_json
from site_seed
join projects on projects.proposed_name = site_seed.project_name
on conflict (expansion_project_id, name) do update
set address_line_1 = excluded.address_line_1, city = excluded.city, state = excluded.state, postal_code = excluded.postal_code, square_feet = excluded.square_feet, asking_rent_cents = excluded.asking_rent_cents, estimated_cam_cents = excluded.estimated_cam_cents, parking_notes = excluded.parking_notes, visibility_score = excluded.visibility_score, demographic_notes = excluded.demographic_notes, status = excluded.status, site_score = excluded.site_score, cannibalization_risk = excluded.cannibalization_risk, evaluation_json = excluded.evaluation_json, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects)
insert into public.market_assessments (expansion_project_id, population_estimate, household_income_estimate, target_population_notes, competition_count, market_score, assumptions_json)
select projects.id, seed.population_estimate, seed.household_income_estimate, seed.target_population_notes, seed.competition_count, seed.market_score, seed.assumptions_json
from (
  values
    ('Hollywood Clinic', 154000, 78000, 'Fictional mixed retail and residential demand notes.', 7, 78, '{"demo":true,"source":"manual fictional input"}'::jsonb),
    ('Sarasota Clinic', 121000, 82000, 'Fictional affluent coastal market notes.', 5, 72, '{"demo":true,"source":"manual fictional input"}'::jsonb),
    ('Jacksonville Expansion', 198000, 69000, 'Fictional existing-market expansion notes.', 6, 75, '{"demo":true,"source":"manual fictional input"}'::jsonb)
) as seed(project_name, population_estimate, household_income_estimate, target_population_notes, competition_count, market_score, assumptions_json)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id) do update
set population_estimate = excluded.population_estimate, household_income_estimate = excluded.household_income_estimate, target_population_notes = excluded.target_population_notes, competition_count = excluded.competition_count, market_score = excluded.market_score, assumptions_json = excluded.assumptions_json, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects)
insert into public.expansion_financial_models (expansion_project_id, startup_cost_cents, buildout_cost_cents, equipment_cost_cents, launch_marketing_cents, monthly_rent_cents, payroll_monthly_cents, other_monthly_fixed_cost_cents, target_monthly_revenue_cents, target_contribution_margin, break_even_months, assumptions_json)
select projects.id, seed.startup, seed.buildout, seed.equipment, seed.marketing, seed.rent, seed.payroll, seed.fixed, seed.revenue, seed.margin, seed.break_even, seed.assumptions
from (
  values
    ('Hollywood Clinic', 198000000, 125000000, 38000000, 28000000, 1850000, 5200000, 2100000, 7400000, 0.31, 18, '{"demo":true,"planning_only":true,"not_investment_advice":true}'::jsonb),
    ('Sarasota Clinic', 151000000, 98000000, 31000000, 22000000, 1425000, 4300000, 1800000, 5600000, 0.28, 22, '{"demo":true,"planning_only":true}'::jsonb),
    ('Jacksonville Expansion', 101000000, 72000000, 21000000, 16000000, 950000, 2800000, 1300000, 4200000, 0.34, 14, '{"demo":true,"planning_only":true}'::jsonb)
) as seed(project_name, startup, buildout, equipment, marketing, rent, payroll, fixed, revenue, margin, break_even, assumptions)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id) do update
set startup_cost_cents = excluded.startup_cost_cents, buildout_cost_cents = excluded.buildout_cost_cents, equipment_cost_cents = excluded.equipment_cost_cents, launch_marketing_cents = excluded.launch_marketing_cents, monthly_rent_cents = excluded.monthly_rent_cents, payroll_monthly_cents = excluded.payroll_monthly_cents, other_monthly_fixed_cost_cents = excluded.other_monthly_fixed_cost_cents, target_monthly_revenue_cents = excluded.target_monthly_revenue_cents, target_contribution_margin = excluded.target_contribution_margin, break_even_months = excluded.break_even_months, assumptions_json = excluded.assumptions_json, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects),
months as (select generate_series(1, 12) as month_number),
project_plan as (
  select projects.id, projects.proposed_name,
    case projects.proposed_name when 'Hollywood Clinic' then 7400000 when 'Sarasota Clinic' then 5600000 else 4200000 end as target_revenue
  from projects
  where projects.proposed_name in ('Hollywood Clinic', 'Sarasota Clinic', 'Jacksonville Expansion')
)
insert into public.expansion_forecast_months (expansion_project_id, forecast_month, planned_revenue_cents, planned_contribution_cents, planned_marketing_cents, planned_labor_cents, planned_cogs_cents, assumptions_json)
select project_plan.id, months.month_number,
  round(project_plan.target_revenue * least(1.0, 0.18 + months.month_number * 0.075))::integer,
  round(project_plan.target_revenue * least(1.0, 0.18 + months.month_number * 0.075) * 0.28)::integer,
  case when months.month_number <= 3 then 4500000 else 1800000 end,
  round(project_plan.target_revenue * 0.25)::integer,
  round(project_plan.target_revenue * 0.14)::integer,
  jsonb_build_object('demo', true, 'ramp_curve', 'transparent starter ramp')
from project_plan
cross join months
on conflict (expansion_project_id, forecast_month) do update
set planned_revenue_cents = excluded.planned_revenue_cents, planned_contribution_cents = excluded.planned_contribution_cents, planned_marketing_cents = excluded.planned_marketing_cents, planned_labor_cents = excluded.planned_labor_cents, planned_cogs_cents = excluded.planned_cogs_cents, assumptions_json = excluded.assumptions_json, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1)
insert into public.launch_checklist_templates (id, organization_id, name, project_type, active)
select '10000000-0000-4000-8000-000000017401'::uuid, org.id, 'Corporate Clinic Launch Template', 'new_corporate_clinic', true from org
on conflict (organization_id, name, project_type) do update set active = excluded.active, updated_at = now();

with template as (select id from public.launch_checklist_templates where name = 'Corporate Clinic Launch Template' limit 1),
item_seed(category, title, description, days_before, required, blocker, sort_order) as (
  values
    ('Legal/Admin', 'Entity and operating approvals reviewed', 'Operational approval only; not legal advice.', 120, true, true, 10),
    ('Lease/Site', 'Preferred site selected after due diligence', 'Owner/admin must review site package.', 110, true, true, 20),
    ('Construction', 'Buildout milestones confirmed', 'Demo construction tracker item.', 75, true, true, 30),
    ('Equipment', 'Core equipment ordered', 'Planning item only.', 65, true, false, 40),
    ('Technology', 'Phones and CRM launch settings prepared', 'Use existing safe configuration paths.', 45, true, false, 50),
    ('Clinical', 'Clinical workflow templates reviewed', 'No treatment-plan automation.', 40, true, true, 60),
    ('Inventory', 'Opening inventory plan approved', 'Planning only; no stock adjustment.', 35, true, false, 70),
    ('Staffing', 'Opening staff plan at target', 'Compensation visible only with financial permissions.', 30, true, true, 80),
    ('Training', 'Launch training complete', 'Foundation only; not an LMS.', 20, true, true, 90),
    ('Marketing', 'Pre-launch campaign plan reviewed', 'Campaigns do not launch automatically.', 18, true, false, 100),
    ('Sales', 'Sales scripts and follow-up queues prepared', 'Demo checklist item.', 14, true, false, 110),
    ('Finance', 'Planning budget variance reviewed', 'Not audited accounting.', 10, true, true, 120),
    ('Operations', 'Opening readiness reviewed', 'Final human review required.', 7, true, true, 130),
    ('Opening', 'Soft-open checklist approved', 'Owner/admin confirmation required.', 2, true, true, 140)
)
insert into public.launch_checklist_template_items (template_id, category, title, description, default_days_before_open, required, blocker, sort_order)
select template.id, item_seed.category, item_seed.title, item_seed.description, item_seed.days_before, item_seed.required, item_seed.blocker, item_seed.sort_order
from item_seed cross join template
on conflict (template_id, title) do update
set category = excluded.category, description = excluded.description, default_days_before_open = excluded.default_days_before_open, required = excluded.required, blocker = excluded.blocker, sort_order = excluded.sort_order;

with projects as (select proposed_name, id, target_open_date from public.expansion_projects),
template_items as (select id, category, title, default_days_before_open, required, blocker from public.launch_checklist_template_items),
project_items as (
  select projects.id as project_id, projects.target_open_date, template_items.*
  from projects
  cross join template_items
  where projects.proposed_name in ('Hollywood Clinic', 'Sarasota Clinic', 'Jacksonville Expansion')
)
insert into public.expansion_checklist_items (expansion_project_id, template_item_id, category, title, due_date, status, required, blocker, notes)
select project_id, id, category, title,
  case when target_open_date is null or default_days_before_open is null then null else target_open_date - default_days_before_open end,
  case
    when title in ('Entity and operating approvals reviewed', 'Preferred site selected after due diligence') then 'complete'
    when title in ('Buildout milestones confirmed', 'Opening staff plan at target') then 'in_progress'
    when title = 'Clinical workflow templates reviewed' then 'blocked'
    else 'not_started'
  end,
  required,
  blocker,
  'Fictional Phase 17 demo checklist item.'
from project_items
on conflict (expansion_project_id, title) do update
set template_item_id = excluded.template_item_id, category = excluded.category, due_date = excluded.due_date, status = excluded.status, required = excluded.required, blocker = excluded.blocker, notes = excluded.notes, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects),
snapshot_seed(project_name, overall_score, category_scores, blockers, status) as (
  values
    ('Hollywood Clinic', 71, '{"site":82,"construction":55,"clinical":40,"staffing":60,"training":35,"inventory":75,"marketing":62,"technology":70,"operations":68}'::jsonb, '["Clinical workflow templates blocked","Training incomplete"]'::jsonb, 'at_risk'),
    ('Sarasota Clinic', 34, '{"site":25,"construction":10,"clinical":20,"staffing":15,"training":10,"inventory":20,"marketing":35,"technology":45,"operations":30}'::jsonb, '["Market research incomplete","No selected site","Partner operating model still in review"]'::jsonb, 'not_ready'),
    ('Jacksonville Expansion', 76, '{"site":90,"construction":70,"clinical":80,"staffing":72,"training":65,"inventory":80,"marketing":66,"technology":78,"operations":82}'::jsonb, '["Training not complete","Marketing launch review pending"]'::jsonb, 'ready_with_review')
)
insert into public.expansion_readiness_snapshots (expansion_project_id, snapshot_date, overall_score, category_scores_json, blockers_json, status)
select projects.id, current_date, snapshot_seed.overall_score, snapshot_seed.category_scores, snapshot_seed.blockers, snapshot_seed.status
from snapshot_seed
join projects on projects.proposed_name = snapshot_seed.project_name
on conflict (expansion_project_id, snapshot_date) do update
set overall_score = excluded.overall_score, category_scores_json = excluded.category_scores_json, blockers_json = excluded.blockers_json, status = excluded.status;

with projects as (select proposed_name, id from public.expansion_projects)
insert into public.expansion_staffing_plans (expansion_project_id, role_name, planned_headcount, planned_hourly_rate_cents, planned_salary_cents, target_hire_date, hired_count)
select projects.id, seed.role_name, seed.headcount, seed.hourly, seed.salary, current_date + seed.days_to_hire, seed.hired
from (
  values
    ('Hollywood Clinic', 'Clinic Manager', 1, null::integer, 9200000, interval '55 days', 0),
    ('Hollywood Clinic', 'Sales Consultant', 2, 3200, null::integer, interval '45 days', 1),
    ('Hollywood Clinic', 'Provider', 2, null::integer, 12500000, interval '60 days', 1),
    ('Sarasota Clinic', 'Clinic Manager', 1, null::integer, 8800000, interval '130 days', 0),
    ('Jacksonville Expansion', 'Provider', 1, null::integer, 11800000, interval '40 days', 1)
) as seed(project_name, role_name, headcount, hourly, salary, days_to_hire, hired)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id, role_name) do update
set planned_headcount = excluded.planned_headcount, planned_hourly_rate_cents = excluded.planned_hourly_rate_cents, planned_salary_cents = excluded.planned_salary_cents, target_hire_date = excluded.target_hire_date, hired_count = excluded.hired_count, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
projects as (select proposed_name, id from public.expansion_projects where organization_id = (select id from org)),
assignees as (
  select
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1) as manager_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'provider@avora-demo.com' limit 1) as provider_id,
    (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'sales@avora-demo.com' limit 1) as sales_id
)
insert into public.expansion_training_items (expansion_project_id, user_id, training_name, status, due_date)
select projects.id,
  case seed.assignee
    when 'provider' then assignees.provider_id
    when 'sales' then assignees.sales_id
    else assignees.manager_id
  end,
  seed.training_name,
  seed.status,
  current_date + seed.days_due
from (
  values
    ('Hollywood Clinic', 'Front Desk Launch Standards', 'manager', 'in_progress', interval '45 days'),
    ('Hollywood Clinic', 'Clinical Workflow Review', 'provider', 'blocked', interval '35 days'),
    ('Hollywood Clinic', 'Sales Consultation Playbook', 'sales', 'not_started', interval '30 days'),
    ('Jacksonville Expansion', 'Expansion Room Turnover Protocol', 'provider', 'complete', interval '20 days')
) as seed(project_name, training_name, assignee, status, days_due)
cross join assignees
join projects on projects.proposed_name = seed.project_name
where case seed.assignee
    when 'provider' then assignees.provider_id
    when 'sales' then assignees.sales_id
    else assignees.manager_id
  end is not null
on conflict (expansion_project_id, user_id, training_name) do update
set status = excluded.status, due_date = excluded.due_date, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects),
items as (
  select id, name from public.inventory_items where name in ('Hair Restoration Biologic Vial', 'Sterile Syringe', 'Needle Pack')
)
insert into public.expansion_inventory_requirements (expansion_project_id, inventory_item_id, planned_quantity, planned_cost_cents, ordered_quantity, received_quantity, status)
select projects.id, items.id, seed.planned_quantity, seed.planned_cost_cents, seed.ordered_quantity, seed.received_quantity, seed.status
from (
  values
    ('Hollywood Clinic', 'Hair Restoration Biologic Vial', 18::numeric, 630000, 10::numeric, 0::numeric, 'ordered'),
    ('Hollywood Clinic', 'Sterile Syringe', 200::numeric, 50000, 200::numeric, 100::numeric, 'partial'),
    ('Hollywood Clinic', 'Needle Pack', 120::numeric, 60000, 0::numeric, 0::numeric, 'planned')
) as seed(project_name, item_name, planned_quantity, planned_cost_cents, ordered_quantity, received_quantity, status)
join projects on projects.proposed_name = seed.project_name
join items on items.name = seed.item_name
on conflict (expansion_project_id, inventory_item_id) do update
set planned_quantity = excluded.planned_quantity, planned_cost_cents = excluded.planned_cost_cents, ordered_quantity = excluded.ordered_quantity, received_quantity = excluded.received_quantity, status = excluded.status, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects),
vendors as (select id, name from public.vendors)
insert into public.expansion_equipment_items (expansion_project_id, name, category, quantity, vendor_id, estimated_cost_cents, ordered, received, installed)
select projects.id, seed.name, seed.category, seed.quantity, vendors.id, seed.cost, seed.ordered, seed.received, seed.installed
from (
  values
    ('Hollywood Clinic', 'Demo Consultation Room Package', 'Clinical', 2, null::text, 18000000, true, false, false),
    ('Hollywood Clinic', 'Front Desk Workstations', 'Technology', 3, null::text, 6500000, true, true, false),
    ('Sarasota Clinic', 'Partner Launch Equipment Placeholder', 'Clinical', 1, null::text, 12000000, false, false, false)
) as seed(project_name, name, category, quantity, vendor_name, cost, ordered, received, installed)
join projects on projects.proposed_name = seed.project_name
left join vendors on vendors.name = seed.vendor_name
on conflict (expansion_project_id, name) do update
set category = excluded.category, quantity = excluded.quantity, vendor_id = excluded.vendor_id, estimated_cost_cents = excluded.estimated_cost_cents, ordered = excluded.ordered, received = excluded.received, installed = excluded.installed, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects),
campaign as (select id from public.campaigns order by created_at desc limit 1)
insert into public.expansion_marketing_plan (expansion_project_id, prelaunch_budget_cents, launch_budget_cents, lead_goal, booked_consult_goal, campaign_id, status)
select projects.id, seed.prelaunch, seed.launch, seed.leads, seed.booked, (select id from campaign), seed.status
from (
  values
    ('Hollywood Clinic', 12000000, 16000000, 180, 70, 'planned'),
    ('Sarasota Clinic', 9000000, 13000000, 120, 45, 'draft'),
    ('Jacksonville Expansion', 6000000, 10000000, 90, 35, 'planned')
) as seed(project_name, prelaunch, launch, leads, booked, status)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id) do update
set prelaunch_budget_cents = excluded.prelaunch_budget_cents, launch_budget_cents = excluded.launch_budget_cents, lead_goal = excluded.lead_goal, booked_consult_goal = excluded.booked_consult_goal, campaign_id = excluded.campaign_id, status = excluded.status, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1)
insert into public.management_fee_rules (id, organization_id, name, fee_type, rate, calculation_base, active)
select '10000000-0000-4000-8000-000000017501'::uuid, org.id, 'Demo 4 Percent Management Fee', 'percent', 0.04, 'net_collected_revenue', true
from org
on conflict (organization_id, name) do update
set fee_type = excluded.fee_type, rate = excluded.rate, calculation_base = excluded.calculation_base, active = excluded.active, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org)),
entities as (select name, id from public.operating_entities where organization_id = (select id from org)),
territories as (select name, id from public.territories where organization_id = (select id from org)),
fee_rule as (select id from public.management_fee_rules where organization_id = (select id from org) and name = 'Demo 4 Percent Management Fee' limit 1),
royalty_rule as (select id from public.royalty_rules where organization_id = (select id from org) order by created_at limit 1),
agreement_seed(location_slug, entity_name, agreement_type, territory_name) as (
  values
    ('miami', 'Avora Corporate Operations', 'corporate', 'Miami Core'),
    ('tampa', 'Avora Florida Management', 'managed', 'Tampa Bay'),
    ('jacksonville', 'North Florida Franchise Demo', 'franchise', 'Jacksonville')
)
insert into public.location_operating_agreements (organization_id, location_id, operating_entity_id, agreement_type, effective_start, royalty_rule_id, management_fee_rule_id, territory_id, status, metadata)
select (select id from org), locations.id, entities.id, agreement_seed.agreement_type, current_date - interval '1 year', (select id from royalty_rule), (select id from fee_rule), territories.id, 'active', '{"demo":true,"metadata_only":true,"not_legal_contract":true}'::jsonb
from agreement_seed
join locations on locations.slug = agreement_seed.location_slug
join entities on entities.name = agreement_seed.entity_name
left join territories on territories.name = agreement_seed.territory_name
on conflict (organization_id, location_id, operating_entity_id, agreement_type, effective_start) do update
set royalty_rule_id = excluded.royalty_rule_id, management_fee_rule_id = excluded.management_fee_rule_id, territory_id = excluded.territory_id, status = excluded.status, metadata = excluded.metadata, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org)),
entities as (select name, id from public.operating_entities where organization_id = (select id from org)),
fee_rule as (select id from public.management_fee_rules where organization_id = (select id from org) and name = 'Demo 4 Percent Management Fee' limit 1)
insert into public.management_fee_records (organization_id, location_id, operating_entity_id, management_fee_rule_id, period_start, period_end, calculation_base_cents, fee_cents, status)
select (select id from org), locations.id, entities.id, (select id from fee_rule), date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, seed.base_cents, public.expansion_management_fee(seed.base_cents, 'percent', 0.04), 'draft'
from (
  values
    ('tampa', 'Avora Florida Management', 1650000),
    ('jacksonville', 'North Florida Franchise Demo', 1425000)
) as seed(location_slug, entity_name, base_cents)
join locations on locations.slug = seed.location_slug
join entities on entities.name = seed.entity_name
on conflict (organization_id, location_id, operating_entity_id, period_start, period_end) do update
set management_fee_rule_id = excluded.management_fee_rule_id, calculation_base_cents = excluded.calculation_base_cents, fee_cents = excluded.fee_cents, status = excluded.status, calculated_at = now(), updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1)
insert into public.brand_standard_templates (id, organization_id, category, title, description, frequency, active)
select seed.id, org.id, seed.category, seed.title, seed.description, 'quarterly', true
from org
cross join (
  values
    ('10000000-0000-4000-8000-000000017601'::uuid, 'Branding', 'Exterior signage matches Avora standards', 'Fictional brand audit standard.'),
    ('10000000-0000-4000-8000-000000017602'::uuid, 'Patient Experience', 'Front desk greeting and wait flow observed', 'Fictional patient-experience standard.'),
    ('10000000-0000-4000-8000-000000017603'::uuid, 'Clinical Operations', 'Clinical room setup follows Avora checklist', 'Fictional clinical-operations standard.'),
    ('10000000-0000-4000-8000-000000017604'::uuid, 'Marketing', 'Local campaign disclosures reviewed', 'Fictional marketing standard.')
) as seed(id, category, title, description)
on conflict (organization_id, category, title) do update
set description = excluded.description, frequency = excluded.frequency, active = excluded.active, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
location as (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1),
auditor as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1)
insert into public.brand_audits (id, organization_id, location_id, auditor_user_id, audit_date, status, score, notes)
select '10000000-0000-4000-8000-000000017701'::uuid, (select id from org), (select id from location), (select id from auditor), current_date - interval '7 days', 'remediation_required', 82, 'Fictional Tampa brand audit for Phase 17 demo.'
on conflict (organization_id, location_id, audit_date) do update
set auditor_user_id = excluded.auditor_user_id, status = excluded.status, score = excluded.score, notes = excluded.notes, updated_at = now();

with audit as (select id from public.brand_audits where id = '10000000-0000-4000-8000-000000017701'::uuid),
templates as (select title, id, category from public.brand_standard_templates)
insert into public.brand_audit_items (brand_audit_id, template_id, category, title, score, status, notes, remediation_due)
select (select id from audit), templates.id, templates.category, templates.title, seed.score, seed.status, seed.notes, current_date + interval '21 days'
from (
  values
    ('Exterior signage matches Avora standards', 78, 'needs_remediation', 'Demo remediation: replace temporary window graphic.'),
    ('Front desk greeting and wait flow observed', 88, 'pass', 'Demo observation passed.'),
    ('Clinical room setup follows Avora checklist', 84, 'pass', 'Demo observation passed.'),
    ('Local campaign disclosures reviewed', 76, 'needs_remediation', 'Demo remediation: update local campaign review sheet.')
) as seed(title, score, status, notes)
join templates on templates.title = seed.title
on conflict (brand_audit_id, title) do update
set template_id = excluded.template_id, category = excluded.category, score = excluded.score, status = excluded.status, notes = excluded.notes, remediation_due = excluded.remediation_due, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org)),
creator as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.location_setting_overrides (organization_id, location_id, setting_namespace, setting_key, setting_value_json, created_by)
select (select id from org), locations.id, 'calls', 'quiet_hours', '{"start":"21:00","end":"08:00","source":"phase17_demo_location_override"}'::jsonb, (select id from creator)
from locations
where locations.slug = 'tampa'
on conflict (organization_id, location_id, setting_namespace, setting_key) do update
set setting_value_json = excluded.setting_value_json, created_by = excluded.created_by, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
region as (select id from public.regions where organization_id = (select id from org) and name = 'South Florida' limit 1),
creator as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.region_setting_overrides (organization_id, region_id, setting_namespace, setting_key, setting_value_json, created_by)
select (select id from org), (select id from region), 'campaigns', 'prelaunch_review_required', '{"enabled":true,"source":"phase17_demo_region_override"}'::jsonb, (select id from creator)
on conflict (organization_id, region_id, setting_namespace, setting_key) do update
set setting_value_json = excluded.setting_value_json, created_by = excluded.created_by, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects)
insert into public.expansion_document_links (expansion_project_id, document_type, title, external_url, metadata)
select projects.id, seed.document_type, seed.title, seed.external_url, seed.metadata
from (
  values
    ('Hollywood Clinic', 'site_packet', 'Hollywood Demo Site Packet', null::text, '{"demo":true,"metadata_only":true}'::jsonb),
    ('Hollywood Clinic', 'floor_plan', 'Hollywood Demo Floor Plan Placeholder', null::text, '{"demo":true,"no_storage_required":true}'::jsonb),
    ('Sarasota Clinic', 'market_notes', 'Sarasota Demo Market Notes', null::text, '{"demo":true,"manual_inputs_only":true}'::jsonb)
) as seed(project_name, document_type, title, external_url, metadata)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id, document_type, title) do update
set external_url = excluded.external_url, metadata = excluded.metadata, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects)
insert into public.expansion_milestones (expansion_project_id, name, milestone_date, status, completed_at)
select projects.id, seed.name, current_date + seed.days_offset, seed.status, case when seed.status = 'complete' then now() - interval '3 days' else null end
from (
  values
    ('Hollywood Clinic', 'LOI Signed', interval '20 days', 'planned'),
    ('Hollywood Clinic', 'Lease Signed', interval '55 days', 'planned'),
    ('Hollywood Clinic', 'Construction Start', interval '75 days', 'planned'),
    ('Hollywood Clinic', 'Marketing Launch', interval '95 days', 'planned'),
    ('Hollywood Clinic', 'Soft Open', interval '130 days', 'planned'),
    ('Jacksonville Expansion', 'Construction Start', interval '-14 days', 'complete'),
    ('Jacksonville Expansion', 'Hiring Start', interval '15 days', 'planned'),
    ('Jacksonville Expansion', 'Soft Open', interval '80 days', 'planned')
) as seed(project_name, name, days_offset, status)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id, name) do update
set milestone_date = excluded.milestone_date, status = excluded.status, completed_at = excluded.completed_at, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects)
insert into public.expansion_budget_items (expansion_project_id, category, description, budget_cents, committed_cents, actual_cents, status)
select projects.id, seed.category, seed.description, seed.budget_cents, seed.committed_cents, seed.actual_cents, seed.status
from (
  values
    ('Hollywood Clinic', 'buildout', 'Demo buildout budget', 125000000, 82000000, 0, 'committed'),
    ('Hollywood Clinic', 'equipment', 'Demo equipment budget', 38000000, 24000000, 6000000, 'committed'),
    ('Hollywood Clinic', 'inventory', 'Demo opening inventory budget', 9500000, 5400000, 0, 'planned'),
    ('Hollywood Clinic', 'marketing', 'Demo launch marketing budget', 28000000, 12000000, 0, 'planned'),
    ('Sarasota Clinic', 'buildout', 'Demo partner buildout budget', 98000000, 0, 0, 'planned'),
    ('Jacksonville Expansion', 'technology', 'Demo expansion technology budget', 7000000, 6500000, 2400000, 'committed')
) as seed(project_name, category, description, budget_cents, committed_cents, actual_cents, status)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id, category, description) do update
set budget_cents = excluded.budget_cents, committed_cents = excluded.committed_cents, actual_cents = excluded.actual_cents, status = excluded.status, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
projects as (select proposed_name, id from public.expansion_projects where organization_id = (select id from org))
insert into public.expansion_alerts (organization_id, expansion_project_id, alert_type, severity, title, summary, status, identity_key, evidence_json)
select (select id from org), projects.id, seed.alert_type, seed.severity, seed.title, seed.summary, 'active', seed.identity_key, seed.evidence_json
from (
  values
    ('Hollywood Clinic', 'territory_overlap', 'watch', 'Hollywood has potential Miami territory overlap', 'Demo ZIP overlap warning needs human review.', 'phase17:hollywood:territory-overlap', '{"demo":true,"geography":"33130"}'::jsonb),
    ('Hollywood Clinic', 'readiness_blocker', 'important', 'Hollywood clinical checklist blocker', 'Clinical workflow review is blocked in the fictional launch checklist.', 'phase17:hollywood:clinical-blocker', '{"demo":true,"category":"Clinical"}'::jsonb),
    ('Sarasota Clinic', 'opening_date_at_risk', 'important', 'Sarasota launch plan is early and at risk', 'Market research and site selection are incomplete.', 'phase17:sarasota:launch-risk', '{"demo":true,"stage":"market_research"}'::jsonb),
    ('Jacksonville Expansion', 'marketing_launch_not_ready', 'watch', 'Jacksonville marketing review pending', 'Demo launch marketing plan still requires review.', 'phase17:jax:marketing-review', '{"demo":true,"category":"Marketing"}'::jsonb)
) as seed(project_name, alert_type, severity, title, summary, identity_key, evidence_json)
join projects on projects.proposed_name = seed.project_name
on conflict (organization_id, identity_key) do update
set expansion_project_id = excluded.expansion_project_id, alert_type = excluded.alert_type, severity = excluded.severity, title = excluded.title, summary = excluded.summary, status = excluded.status, evidence_json = excluded.evidence_json, updated_at = now();

with projects as (select proposed_name, id from public.expansion_projects)
insert into public.expansion_ramp_metrics (expansion_project_id, ramp_month, metric_key, planned_value, actual_value, variance_value, status)
select projects.id, seed.ramp_month, seed.metric_key, seed.planned_value, seed.actual_value, seed.actual_value - seed.planned_value, seed.status
from (
  values
    ('Jacksonville Expansion', 1, 'net_collected_revenue_cents', 1800000::numeric, 1650000::numeric, 'watch'),
    ('Jacksonville Expansion', 1, 'leads', 45::numeric, 50::numeric, 'ahead'),
    ('Jacksonville Expansion', 1, 'booked_consults', 18::numeric, 16::numeric, 'watch'),
    ('Jacksonville Expansion', 1, 'labor_cost_percent', 0.28::numeric, 0.31::numeric, 'behind'),
    ('Jacksonville Expansion', 2, 'net_collected_revenue_cents', 2300000::numeric, 0::numeric, 'on_track')
) as seed(project_name, ramp_month, metric_key, planned_value, actual_value, status)
join projects on projects.proposed_name = seed.project_name
on conflict (expansion_project_id, ramp_month, metric_key) do update
set planned_value = excluded.planned_value, actual_value = excluded.actual_value, variance_value = excluded.variance_value, status = excluded.status, updated_at = now();

-- Verification queries for Supabase SQL Editor:
-- select count(*) as phase17_operating_entities from public.operating_entities oe join public.organizations o on o.id = oe.organization_id where o.slug = 'avora';
-- select count(*) as phase17_regions from public.regions r join public.organizations o on o.id = r.organization_id where o.slug = 'avora';
-- select count(*) as phase17_territories from public.territories t join public.organizations o on o.id = t.organization_id where o.slug = 'avora';
-- select count(*) as phase17_expansion_projects from public.expansion_projects p join public.organizations o on o.id = p.organization_id where o.slug = 'avora';
-- select count(*) as phase17_sites from public.expansion_sites s join public.expansion_projects p on p.id = s.expansion_project_id join public.organizations o on o.id = p.organization_id where o.slug = 'avora';
-- select count(*) as phase17_checklist_items from public.expansion_checklist_items ci join public.expansion_projects p on p.id = ci.expansion_project_id join public.organizations o on o.id = p.organization_id where o.slug = 'avora';
-- select count(*) as phase17_management_fee_records from public.management_fee_records mfr join public.organizations o on o.id = mfr.organization_id where o.slug = 'avora';
-- select count(*) as phase17_brand_audits from public.brand_audits ba join public.organizations o on o.id = ba.organization_id where o.slug = 'avora';
-- select count(*) as phase17_alerts from public.expansion_alerts ea join public.organizations o on o.id = ea.organization_id where o.slug = 'avora';
