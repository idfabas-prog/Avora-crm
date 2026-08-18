insert into public.permissions (key, description)
values
  ('expansion.read', 'Read expansion portfolio and projects'),
  ('expansion.manage', 'Manage expansion operating system'),
  ('expansion.projects.create', 'Create expansion projects'),
  ('expansion.projects.manage', 'Manage expansion projects'),
  ('expansion.sites.manage', 'Manage expansion site candidates'),
  ('expansion.financials.read', 'Read expansion planning financials'),
  ('expansion.financials.manage', 'Manage expansion planning financials'),
  ('expansion.checklists.manage', 'Manage launch checklists'),
  ('expansion.readiness.read', 'Read opening readiness'),
  ('expansion.readiness.manage', 'Manage opening readiness inputs'),
  ('territories.read', 'Read territories'),
  ('territories.manage', 'Manage territories'),
  ('regions.read', 'Read regions'),
  ('regions.manage', 'Manage regions'),
  ('entities.read', 'Read operating entities'),
  ('entities.manage', 'Manage operating entities'),
  ('brand_audits.read', 'Read brand audits'),
  ('brand_audits.manage', 'Manage brand audits'),
  ('management_fees.read', 'Read management fee records'),
  ('management_fees.manage', 'Manage management fee records'),
  ('operator.read', 'Read operator portal foundation')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'expansion.read',
  'expansion.manage',
  'expansion.projects.create',
  'expansion.projects.manage',
  'expansion.sites.manage',
  'expansion.financials.read',
  'expansion.financials.manage',
  'expansion.checklists.manage',
  'expansion.readiness.read',
  'expansion.readiness.manage',
  'territories.read',
  'territories.manage',
  'regions.read',
  'regions.manage',
  'entities.read',
  'entities.manage',
  'brand_audits.read',
  'brand_audits.manage',
  'management_fees.read',
  'management_fees.manage',
  'operator.read'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'expansion.read',
  'expansion.projects.manage',
  'expansion.sites.manage',
  'expansion.checklists.manage',
  'expansion.readiness.read',
  'expansion.readiness.manage',
  'territories.read',
  'regions.read',
  'entities.read',
  'brand_audits.read',
  'brand_audits.manage',
  'management_fees.read',
  'operator.read'
)
where r.name = 'manager'
on conflict do nothing;

alter table public.workflows
  drop constraint if exists workflows_category_check;

alter table public.workflows
  add constraint workflows_category_check
  check (
    category in (
      'lead_nurture',
      'appointment',
      'sales',
      'treatment_follow_up',
      'reactivation',
      'payment',
      'internal_operations',
      'inventory',
      'expansion',
      'custom'
    )
  );

create table public.operating_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  entity_type text not null check (entity_type in ('corporate', 'franchise', 'partner', 'management_company', 'joint_venture', 'other')),
  legal_name text,
  external_reference text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create table public.region_locations (
  region_id uuid not null references public.regions(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  effective_start date not null default current_date,
  effective_end date,
  created_at timestamptz not null default now(),
  primary key (region_id, location_id, effective_start)
);

create table public.region_managers (
  region_id uuid not null references public.regions(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role_type text not null check (role_type in ('regional_manager', 'regional_sales_manager', 'regional_clinical_manager', 'regional_operations_manager')),
  active boolean not null default true,
  effective_start date not null default current_date,
  effective_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (region_id, user_id, role_type, effective_start)
);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  territory_type text not null check (territory_type in ('protected', 'development', 'corporate', 'franchise', 'market_area', 'other')),
  status text not null check (status in ('available', 'reserved', 'active', 'under_development', 'closed', 'archived')),
  region_id uuid references public.regions(id) on delete set null,
  description text,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.territory_geographies (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references public.territories(id) on delete cascade,
  geography_type text not null check (geography_type in ('state', 'county', 'city', 'postal_code', 'radius', 'named_market')),
  geography_value text not null,
  radius_miles numeric(8, 2),
  center_lat numeric(9, 6),
  center_lng numeric(9, 6),
  created_at timestamptz not null default now(),
  unique (territory_id, geography_type, geography_value)
);

create table public.location_territories (
  location_id uuid not null references public.locations(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  effective_start date not null default current_date,
  effective_end date,
  primary_assignment boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (location_id, territory_id, effective_start)
);

create table public.location_entities (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  operating_entity_id uuid not null references public.operating_entities(id) on delete cascade,
  ownership_type text not null check (ownership_type in ('corporate_owned', 'franchise_operated', 'partner_operated', 'joint_venture', 'managed', 'other')),
  ownership_percent numeric(7, 4),
  effective_start date not null default current_date,
  effective_end date,
  primary_entity boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, operating_entity_id, effective_start)
);

create table public.territory_overlap_warnings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  overlapping_territory_id uuid not null references public.territories(id) on delete cascade,
  overlap_type text not null default 'potential_overlap',
  geography_type text not null,
  geography_value text not null,
  severity text not null default 'watch' check (severity in ('info', 'watch', 'important')),
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved', 'dismissed')),
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, territory_id, overlapping_territory_id, geography_type, geography_value)
);

create table public.expansion_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  territory_id uuid references public.territories(id) on delete set null,
  proposed_name text not null,
  market_name text not null,
  project_type text not null check (project_type in ('new_corporate_clinic', 'franchise_location', 'partner_location', 'relocation', 'expansion', 'acquisition', 'other')),
  stage text not null check (stage in ('market_research', 'site_search', 'loi_negotiation', 'lease_contract', 'design', 'permitting', 'construction', 'hiring', 'training', 'pre_launch_marketing', 'soft_open', 'open', 'paused', 'cancelled')),
  target_open_date date,
  actual_open_date date,
  assigned_owner_user_id uuid references public.user_profiles(id) on delete set null,
  future_location_id uuid references public.locations(id) on delete set null,
  estimated_buildout_cost_cents integer,
  estimated_monthly_rent_cents integer,
  estimated_launch_budget_cents integer,
  notes text,
  readiness_score integer not null default 0 check (readiness_score between 0 and 100),
  risk_level text not null default 'watch' check (risk_level in ('low', 'watch', 'important', 'critical')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, proposed_name)
);

create table public.expansion_sites (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  name text not null,
  address_line_1 text,
  city text not null,
  state text not null,
  postal_code text not null,
  square_feet integer,
  asking_rent_cents integer,
  estimated_cam_cents integer,
  parking_notes text,
  visibility_score integer check (visibility_score between 0 and 100),
  demographic_notes text,
  status text not null check (status in ('considering', 'preferred', 'loi', 'rejected', 'selected')),
  site_score integer not null default 0 check (site_score between 0 and 100),
  cannibalization_risk text not null default 'moderate' check (cannibalization_risk in ('low', 'moderate', 'high')),
  evaluation_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, name)
);

create table public.market_assessments (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  population_estimate integer,
  household_income_estimate integer,
  target_population_notes text,
  competition_count integer,
  market_score integer check (market_score between 0 and 100),
  assumptions_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id)
);

create table public.expansion_financial_models (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  startup_cost_cents integer not null default 0,
  buildout_cost_cents integer not null default 0,
  equipment_cost_cents integer not null default 0,
  launch_marketing_cents integer not null default 0,
  monthly_rent_cents integer not null default 0,
  payroll_monthly_cents integer not null default 0,
  other_monthly_fixed_cost_cents integer not null default 0,
  target_monthly_revenue_cents integer not null default 0,
  target_contribution_margin numeric(7, 4) not null default 0,
  break_even_months integer,
  assumptions_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id)
);

create table public.expansion_forecast_months (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  forecast_month integer not null check (forecast_month between 1 and 36),
  planned_revenue_cents integer not null default 0,
  planned_contribution_cents integer not null default 0,
  planned_marketing_cents integer not null default 0,
  planned_labor_cents integer not null default 0,
  planned_cogs_cents integer not null default 0,
  assumptions_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, forecast_month)
);

create table public.launch_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  project_type text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, project_type)
);

create table public.launch_checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.launch_checklist_templates(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  default_days_before_open integer,
  required boolean not null default true,
  blocker boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, title)
);

create table public.expansion_checklist_items (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  template_item_id uuid references public.launch_checklist_template_items(id) on delete set null,
  category text not null,
  title text not null,
  due_date date,
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'complete', 'not_applicable')),
  required boolean not null default true,
  blocker boolean not null default false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, title)
);

create table public.expansion_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  snapshot_date date not null default current_date,
  overall_score integer not null check (overall_score between 0 and 100),
  category_scores_json jsonb not null default '{}'::jsonb,
  blockers_json jsonb not null default '[]'::jsonb,
  status text not null default 'not_ready' check (status in ('not_ready', 'at_risk', 'ready_with_review', 'ready')),
  created_at timestamptz not null default now(),
  unique (expansion_project_id, snapshot_date)
);

create table public.expansion_staffing_plans (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  role_name text not null,
  planned_headcount integer not null default 0,
  planned_hourly_rate_cents integer,
  planned_salary_cents integer,
  target_hire_date date,
  hired_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, role_name)
);

create table public.expansion_training_items (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  training_name text not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete', 'blocked')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, user_id, training_name)
);

create table public.expansion_inventory_requirements (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  planned_quantity numeric(12, 2) not null default 0,
  planned_cost_cents integer,
  ordered_quantity numeric(12, 2) not null default 0,
  received_quantity numeric(12, 2) not null default 0,
  status text not null default 'planned' check (status in ('planned', 'ordered', 'partial', 'received', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, inventory_item_id)
);

create table public.expansion_equipment_items (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  name text not null,
  category text not null,
  quantity integer not null default 1,
  vendor_id uuid references public.vendors(id) on delete set null,
  estimated_cost_cents integer,
  ordered boolean not null default false,
  received boolean not null default false,
  installed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, name)
);

create table public.expansion_marketing_plan (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  prelaunch_budget_cents integer not null default 0,
  launch_budget_cents integer not null default 0,
  lead_goal integer not null default 0,
  booked_consult_goal integer not null default 0,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'planned', 'active', 'paused', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id)
);

create table public.location_operating_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  operating_entity_id uuid not null references public.operating_entities(id) on delete cascade,
  agreement_type text not null check (agreement_type in ('corporate', 'franchise', 'partner', 'managed', 'joint_venture', 'other')),
  effective_start date not null default current_date,
  effective_end date,
  royalty_rule_id uuid references public.royalty_rules(id) on delete set null,
  management_fee_rule_id uuid,
  territory_id uuid references public.territories(id) on delete set null,
  status text not null default 'active' check (status in ('draft', 'active', 'expired', 'terminated', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, operating_entity_id, agreement_type, effective_start)
);

create table public.management_fee_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  fee_type text not null check (fee_type in ('percent', 'flat_monthly', 'hybrid')),
  rate numeric(12, 6) not null default 0,
  calculation_base text not null check (calculation_base in ('collected_revenue', 'net_collected_revenue', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.location_operating_agreements
  add constraint location_operating_agreements_management_fee_rule_fkey
  foreign key (management_fee_rule_id) references public.management_fee_rules(id) on delete set null;

create table public.management_fee_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  operating_entity_id uuid not null references public.operating_entities(id) on delete cascade,
  management_fee_rule_id uuid references public.management_fee_rules(id) on delete set null,
  period_start date not null,
  period_end date not null,
  calculation_base_cents integer not null default 0,
  fee_cents integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'exported', 'paid_future')),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, operating_entity_id, period_start, period_end)
);

create table public.brand_standard_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  title text not null,
  description text not null,
  frequency text not null default 'quarterly',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category, title)
);

create table public.brand_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  auditor_user_id uuid references public.user_profiles(id) on delete set null,
  audit_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'completed', 'remediation_required', 'archived')),
  score integer check (score between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, audit_date)
);

create table public.brand_audit_items (
  id uuid primary key default gen_random_uuid(),
  brand_audit_id uuid not null references public.brand_audits(id) on delete cascade,
  template_id uuid references public.brand_standard_templates(id) on delete set null,
  category text not null,
  title text not null,
  score integer check (score between 0 and 100),
  status text not null default 'pass' check (status in ('pass', 'needs_remediation', 'not_applicable')),
  notes text,
  remediation_due date,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_audit_id, title)
);

create table public.location_setting_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  setting_namespace text not null check (setting_namespace in ('campaigns', 'calls', 'reviews', 'workforce', 'inventory', 'appointments', 'clinical', 'portal')),
  setting_key text not null,
  setting_value_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, setting_namespace, setting_key)
);

create table public.region_setting_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  setting_namespace text not null check (setting_namespace in ('campaigns', 'calls', 'reviews', 'workforce', 'inventory', 'appointments', 'clinical', 'portal')),
  setting_key text not null,
  setting_value_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, region_id, setting_namespace, setting_key)
);

create table public.expansion_document_links (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  document_type text not null,
  title text not null,
  external_url text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, document_type, title)
);

create table public.expansion_milestones (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  name text not null,
  milestone_date date not null,
  status text not null default 'planned' check (status in ('planned', 'at_risk', 'complete', 'missed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, name)
);

create table public.expansion_budget_items (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  category text not null check (category in ('buildout', 'equipment', 'inventory', 'marketing', 'technology', 'furniture', 'training', 'other')),
  description text not null,
  budget_cents integer not null default 0,
  committed_cents integer not null default 0,
  actual_cents integer not null default 0,
  status text not null default 'planned' check (status in ('planned', 'committed', 'spent', 'over_budget', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, category, description)
);

create table public.expansion_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expansion_project_id uuid references public.expansion_projects(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  alert_type text not null,
  severity text not null default 'watch' check (severity in ('info', 'watch', 'important', 'critical')),
  title text not null,
  summary text not null,
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved', 'dismissed')),
  identity_key text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, identity_key)
);

create table public.expansion_ramp_metrics (
  id uuid primary key default gen_random_uuid(),
  expansion_project_id uuid not null references public.expansion_projects(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  ramp_month integer not null check (ramp_month between 1 and 36),
  metric_key text not null,
  planned_value numeric(14, 2) not null default 0,
  actual_value numeric(14, 2) not null default 0,
  variance_value numeric(14, 2) not null default 0,
  status text not null default 'on_track' check (status in ('ahead', 'on_track', 'watch', 'behind')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expansion_project_id, ramp_month, metric_key)
);

create index operating_entities_org_idx on public.operating_entities (organization_id, active);
create index regions_org_idx on public.regions (organization_id, active);
create index region_locations_location_idx on public.region_locations (location_id);
create index region_managers_user_idx on public.region_managers (user_id, active);
create index territories_org_region_idx on public.territories (organization_id, region_id, status);
create index territory_geographies_value_idx on public.territory_geographies (geography_type, (lower(geography_value)));
create index location_territories_territory_idx on public.location_territories (territory_id);
create index location_entities_entity_idx on public.location_entities (operating_entity_id);
create index expansion_projects_org_stage_idx on public.expansion_projects (organization_id, stage, target_open_date);
create index expansion_projects_region_idx on public.expansion_projects (region_id, stage);
create index expansion_sites_project_status_idx on public.expansion_sites (expansion_project_id, status);
create index expansion_checklist_project_status_idx on public.expansion_checklist_items (expansion_project_id, status, due_date);
create index expansion_staffing_project_idx on public.expansion_staffing_plans (expansion_project_id);
create index expansion_training_project_idx on public.expansion_training_items (expansion_project_id, status);
create index expansion_inventory_project_idx on public.expansion_inventory_requirements (expansion_project_id, status);
create index location_operating_agreements_location_idx on public.location_operating_agreements (location_id, status);
create index management_fee_records_period_idx on public.management_fee_records (organization_id, period_start, period_end);
create index brand_audits_location_idx on public.brand_audits (location_id, audit_date desc);
create index brand_audit_items_status_idx on public.brand_audit_items (brand_audit_id, status);
create index expansion_alerts_status_idx on public.expansion_alerts (organization_id, status, severity);
create index expansion_ramp_metrics_project_idx on public.expansion_ramp_metrics (expansion_project_id, ramp_month);

drop trigger if exists operating_entities_set_updated_at on public.operating_entities;
create trigger operating_entities_set_updated_at before update on public.operating_entities for each row execute function public.set_updated_at();
drop trigger if exists regions_set_updated_at on public.regions;
create trigger regions_set_updated_at before update on public.regions for each row execute function public.set_updated_at();
drop trigger if exists region_managers_set_updated_at on public.region_managers;
create trigger region_managers_set_updated_at before update on public.region_managers for each row execute function public.set_updated_at();
drop trigger if exists territories_set_updated_at on public.territories;
create trigger territories_set_updated_at before update on public.territories for each row execute function public.set_updated_at();
drop trigger if exists location_entities_set_updated_at on public.location_entities;
create trigger location_entities_set_updated_at before update on public.location_entities for each row execute function public.set_updated_at();
drop trigger if exists territory_overlap_warnings_set_updated_at on public.territory_overlap_warnings;
create trigger territory_overlap_warnings_set_updated_at before update on public.territory_overlap_warnings for each row execute function public.set_updated_at();
drop trigger if exists expansion_projects_set_updated_at on public.expansion_projects;
create trigger expansion_projects_set_updated_at before update on public.expansion_projects for each row execute function public.set_updated_at();
drop trigger if exists expansion_sites_set_updated_at on public.expansion_sites;
create trigger expansion_sites_set_updated_at before update on public.expansion_sites for each row execute function public.set_updated_at();
drop trigger if exists market_assessments_set_updated_at on public.market_assessments;
create trigger market_assessments_set_updated_at before update on public.market_assessments for each row execute function public.set_updated_at();
drop trigger if exists expansion_financial_models_set_updated_at on public.expansion_financial_models;
create trigger expansion_financial_models_set_updated_at before update on public.expansion_financial_models for each row execute function public.set_updated_at();
drop trigger if exists expansion_forecast_months_set_updated_at on public.expansion_forecast_months;
create trigger expansion_forecast_months_set_updated_at before update on public.expansion_forecast_months for each row execute function public.set_updated_at();
drop trigger if exists launch_checklist_templates_set_updated_at on public.launch_checklist_templates;
create trigger launch_checklist_templates_set_updated_at before update on public.launch_checklist_templates for each row execute function public.set_updated_at();
drop trigger if exists expansion_checklist_items_set_updated_at on public.expansion_checklist_items;
create trigger expansion_checklist_items_set_updated_at before update on public.expansion_checklist_items for each row execute function public.set_updated_at();
drop trigger if exists expansion_staffing_plans_set_updated_at on public.expansion_staffing_plans;
create trigger expansion_staffing_plans_set_updated_at before update on public.expansion_staffing_plans for each row execute function public.set_updated_at();
drop trigger if exists expansion_training_items_set_updated_at on public.expansion_training_items;
create trigger expansion_training_items_set_updated_at before update on public.expansion_training_items for each row execute function public.set_updated_at();
drop trigger if exists expansion_inventory_requirements_set_updated_at on public.expansion_inventory_requirements;
create trigger expansion_inventory_requirements_set_updated_at before update on public.expansion_inventory_requirements for each row execute function public.set_updated_at();
drop trigger if exists expansion_equipment_items_set_updated_at on public.expansion_equipment_items;
create trigger expansion_equipment_items_set_updated_at before update on public.expansion_equipment_items for each row execute function public.set_updated_at();
drop trigger if exists expansion_marketing_plan_set_updated_at on public.expansion_marketing_plan;
create trigger expansion_marketing_plan_set_updated_at before update on public.expansion_marketing_plan for each row execute function public.set_updated_at();
drop trigger if exists location_operating_agreements_set_updated_at on public.location_operating_agreements;
create trigger location_operating_agreements_set_updated_at before update on public.location_operating_agreements for each row execute function public.set_updated_at();
drop trigger if exists management_fee_rules_set_updated_at on public.management_fee_rules;
create trigger management_fee_rules_set_updated_at before update on public.management_fee_rules for each row execute function public.set_updated_at();
drop trigger if exists management_fee_records_set_updated_at on public.management_fee_records;
create trigger management_fee_records_set_updated_at before update on public.management_fee_records for each row execute function public.set_updated_at();
drop trigger if exists brand_standard_templates_set_updated_at on public.brand_standard_templates;
create trigger brand_standard_templates_set_updated_at before update on public.brand_standard_templates for each row execute function public.set_updated_at();
drop trigger if exists brand_audits_set_updated_at on public.brand_audits;
create trigger brand_audits_set_updated_at before update on public.brand_audits for each row execute function public.set_updated_at();
drop trigger if exists brand_audit_items_set_updated_at on public.brand_audit_items;
create trigger brand_audit_items_set_updated_at before update on public.brand_audit_items for each row execute function public.set_updated_at();
drop trigger if exists location_setting_overrides_set_updated_at on public.location_setting_overrides;
create trigger location_setting_overrides_set_updated_at before update on public.location_setting_overrides for each row execute function public.set_updated_at();
drop trigger if exists region_setting_overrides_set_updated_at on public.region_setting_overrides;
create trigger region_setting_overrides_set_updated_at before update on public.region_setting_overrides for each row execute function public.set_updated_at();
drop trigger if exists expansion_document_links_set_updated_at on public.expansion_document_links;
create trigger expansion_document_links_set_updated_at before update on public.expansion_document_links for each row execute function public.set_updated_at();
drop trigger if exists expansion_milestones_set_updated_at on public.expansion_milestones;
create trigger expansion_milestones_set_updated_at before update on public.expansion_milestones for each row execute function public.set_updated_at();
drop trigger if exists expansion_budget_items_set_updated_at on public.expansion_budget_items;
create trigger expansion_budget_items_set_updated_at before update on public.expansion_budget_items for each row execute function public.set_updated_at();
drop trigger if exists expansion_alerts_set_updated_at on public.expansion_alerts;
create trigger expansion_alerts_set_updated_at before update on public.expansion_alerts for each row execute function public.set_updated_at();
drop trigger if exists expansion_ramp_metrics_set_updated_at on public.expansion_ramp_metrics;
create trigger expansion_ramp_metrics_set_updated_at before update on public.expansion_ramp_metrics for each row execute function public.set_updated_at();

create or replace function public.expansion_region_allowed(target_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_region_id is null
    or public.has_permission('regions.manage')
    or exists (
      select 1
      from public.region_managers rm
      where rm.region_id = target_region_id
        and rm.user_id = auth.uid()
        and rm.active = true
        and (rm.effective_end is null or rm.effective_end >= current_date)
    );
$$;

create or replace function public.expansion_location_allowed(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_location_id is null
    or exists (
      select 1
      from public.user_locations ul
      where ul.user_id = auth.uid()
        and ul.location_id = target_location_id
    )
    or exists (
      select 1
      from public.region_locations rl
      join public.region_managers rm on rm.region_id = rl.region_id
      where rl.location_id = target_location_id
        and rm.user_id = auth.uid()
        and rm.active = true
        and (rl.effective_end is null or rl.effective_end >= current_date)
        and (rm.effective_end is null or rm.effective_end >= current_date)
    );
$$;

create or replace function public.expansion_project_readiness(target_project_id uuid)
returns integer
language sql
stable
as $$
  with items as (
    select status, required, blocker
    from public.expansion_checklist_items
    where expansion_project_id = target_project_id
  )
  select case
    when not exists (select 1 from items) then 0
    when exists (select 1 from items where required and blocker and status <> 'complete') then least(79, round(100.0 * count(*) filter (where status in ('complete', 'not_applicable')) / greatest(1, count(*)))::integer)
    else round(100.0 * count(*) filter (where status in ('complete', 'not_applicable')) / greatest(1, count(*)))::integer
  end
  from items;
$$;

create or replace function public.expansion_budget_variance(target_project_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(budget_cents - greatest(committed_cents, actual_cents)), 0)::integer
  from public.expansion_budget_items
  where expansion_project_id = target_project_id;
$$;

create or replace function public.expansion_management_fee(calculation_base_cents integer, fee_type text, rate numeric)
returns integer
language sql
immutable
as $$
  select case
    when fee_type = 'percent' then round(coalesce(calculation_base_cents, 0) * coalesce(rate, 0))::integer
    when fee_type = 'flat_monthly' then round(coalesce(rate, 0))::integer
    when fee_type = 'hybrid' then round(coalesce(calculation_base_cents, 0) * coalesce(rate, 0))::integer
    else 0
  end;
$$;

alter table public.operating_entities enable row level security;
alter table public.regions enable row level security;
alter table public.region_locations enable row level security;
alter table public.region_managers enable row level security;
alter table public.territories enable row level security;
alter table public.territory_geographies enable row level security;
alter table public.location_territories enable row level security;
alter table public.location_entities enable row level security;
alter table public.territory_overlap_warnings enable row level security;
alter table public.expansion_projects enable row level security;
alter table public.expansion_sites enable row level security;
alter table public.market_assessments enable row level security;
alter table public.expansion_financial_models enable row level security;
alter table public.expansion_forecast_months enable row level security;
alter table public.launch_checklist_templates enable row level security;
alter table public.launch_checklist_template_items enable row level security;
alter table public.expansion_checklist_items enable row level security;
alter table public.expansion_readiness_snapshots enable row level security;
alter table public.expansion_staffing_plans enable row level security;
alter table public.expansion_training_items enable row level security;
alter table public.expansion_inventory_requirements enable row level security;
alter table public.expansion_equipment_items enable row level security;
alter table public.expansion_marketing_plan enable row level security;
alter table public.location_operating_agreements enable row level security;
alter table public.management_fee_rules enable row level security;
alter table public.management_fee_records enable row level security;
alter table public.brand_standard_templates enable row level security;
alter table public.brand_audits enable row level security;
alter table public.brand_audit_items enable row level security;
alter table public.location_setting_overrides enable row level security;
alter table public.region_setting_overrides enable row level security;
alter table public.expansion_document_links enable row level security;
alter table public.expansion_milestones enable row level security;
alter table public.expansion_budget_items enable row level security;
alter table public.expansion_alerts enable row level security;
alter table public.expansion_ramp_metrics enable row level security;

create policy "tenant operating entities read" on public.operating_entities for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.read'));
create policy "tenant operating entities manage" on public.operating_entities for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.manage'));
create policy "tenant regions read" on public.regions for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('regions.read') and public.expansion_region_allowed(id));
create policy "tenant regions manage" on public.regions for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('regions.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('regions.manage'));
create policy "tenant region locations access" on public.region_locations for all using (exists (select 1 from public.regions r where r.id = region_id and r.organization_id in (select public.current_organization_ids()) and public.has_permission('regions.read') and public.expansion_region_allowed(r.id))) with check (exists (select 1 from public.regions r where r.id = region_id and r.organization_id in (select public.current_organization_ids()) and public.has_permission('regions.manage')));
create policy "tenant region managers access" on public.region_managers for all using (exists (select 1 from public.regions r where r.id = region_id and r.organization_id in (select public.current_organization_ids()) and public.has_permission('regions.read') and public.expansion_region_allowed(r.id))) with check (exists (select 1 from public.regions r where r.id = region_id and r.organization_id in (select public.current_organization_ids()) and public.has_permission('regions.manage')));
create policy "tenant territories read" on public.territories for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('territories.read') and public.expansion_region_allowed(region_id));
create policy "tenant territories manage" on public.territories for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('territories.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('territories.manage'));
create policy "tenant territory geographies access" on public.territory_geographies for all using (exists (select 1 from public.territories t where t.id = territory_id and t.organization_id in (select public.current_organization_ids()) and public.has_permission('territories.read') and public.expansion_region_allowed(t.region_id))) with check (exists (select 1 from public.territories t where t.id = territory_id and t.organization_id in (select public.current_organization_ids()) and public.has_permission('territories.manage')));
create policy "tenant location territories access" on public.location_territories for all using (exists (select 1 from public.territories t where t.id = territory_id and t.organization_id in (select public.current_organization_ids()) and public.has_permission('territories.read') and public.expansion_location_allowed(location_id))) with check (exists (select 1 from public.territories t where t.id = territory_id and t.organization_id in (select public.current_organization_ids()) and public.has_permission('territories.manage')));
create policy "tenant location entities access" on public.location_entities for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.read') and public.expansion_location_allowed(location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.manage'));
create policy "tenant territory warnings access" on public.territory_overlap_warnings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('territories.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('territories.manage'));
create policy "tenant expansion projects read" on public.expansion_projects for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read') and public.expansion_region_allowed(region_id));
create policy "tenant expansion projects create" on public.expansion_projects for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.create') and public.expansion_region_allowed(region_id));
create policy "tenant expansion projects manage" on public.expansion_projects for update using (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage') and public.expansion_region_allowed(region_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage') and public.expansion_region_allowed(region_id));
create policy "tenant expansion sites access" on public.expansion_sites for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read') and public.expansion_region_allowed(p.region_id))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.sites.manage') and public.expansion_region_allowed(p.region_id)));
create policy "tenant market assessments access" on public.market_assessments for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
create policy "tenant expansion financial models read" on public.expansion_financial_models for select using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.read') and public.expansion_region_allowed(p.region_id)));
create policy "tenant expansion financial models manage" on public.expansion_financial_models for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage')));
create policy "tenant expansion forecast months read" on public.expansion_forecast_months for select using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.read')));
create policy "tenant expansion forecast months manage" on public.expansion_forecast_months for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage')));
create policy "tenant launch templates access" on public.launch_checklist_templates for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.checklists.manage'));
create policy "tenant launch template items access" on public.launch_checklist_template_items for all using (exists (select 1 from public.launch_checklist_templates t where t.id = template_id and t.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.launch_checklist_templates t where t.id = template_id and t.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.checklists.manage')));
create policy "tenant expansion checklist access" on public.expansion_checklist_items for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.readiness.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.checklists.manage')));
create policy "tenant readiness snapshots access" on public.expansion_readiness_snapshots for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.readiness.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.readiness.manage')));
create policy "tenant staffing plans read" on public.expansion_staffing_plans for select using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read')));
create policy "tenant staffing plans manage" on public.expansion_staffing_plans for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage')));
create policy "tenant training items access" on public.expansion_training_items for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
create policy "tenant inventory requirements access" on public.expansion_inventory_requirements for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
create policy "tenant equipment items access" on public.expansion_equipment_items for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
create policy "tenant expansion marketing plan access" on public.expansion_marketing_plan for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
create policy "tenant operating agreements read" on public.location_operating_agreements for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.read') and public.expansion_location_allowed(location_id));
create policy "tenant operating agreements manage" on public.location_operating_agreements for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('entities.manage'));
create policy "tenant management fee rules access" on public.management_fee_rules for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('management_fees.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('management_fees.manage'));
create policy "tenant management fee records read" on public.management_fee_records for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('management_fees.read') and public.expansion_location_allowed(location_id));
create policy "tenant management fee records manage" on public.management_fee_records for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('management_fees.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('management_fees.manage'));
create policy "tenant brand templates access" on public.brand_standard_templates for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('brand_audits.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('brand_audits.manage'));
create policy "tenant brand audits read" on public.brand_audits for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('brand_audits.read') and public.expansion_location_allowed(location_id));
create policy "tenant brand audits manage" on public.brand_audits for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('brand_audits.manage') and public.expansion_location_allowed(location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('brand_audits.manage') and public.expansion_location_allowed(location_id));
create policy "tenant brand audit items access" on public.brand_audit_items for all using (exists (select 1 from public.brand_audits ba where ba.id = brand_audit_id and ba.organization_id in (select public.current_organization_ids()) and public.has_permission('brand_audits.read') and public.expansion_location_allowed(ba.location_id))) with check (exists (select 1 from public.brand_audits ba where ba.id = brand_audit_id and ba.organization_id in (select public.current_organization_ids()) and public.has_permission('brand_audits.manage') and public.expansion_location_allowed(ba.location_id)));
create policy "tenant location overrides access" on public.location_setting_overrides for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read') and public.expansion_location_allowed(location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.manage') and public.expansion_location_allowed(location_id));
create policy "tenant region overrides access" on public.region_setting_overrides for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read') and public.expansion_region_allowed(region_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.manage') and public.expansion_region_allowed(region_id));
create policy "tenant expansion document links access" on public.expansion_document_links for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
create policy "tenant expansion milestones access" on public.expansion_milestones for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
create policy "tenant expansion budget items read" on public.expansion_budget_items for select using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.read')));
create policy "tenant expansion budget items manage" on public.expansion_budget_items for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.financials.manage')));
create policy "tenant expansion alerts access" on public.expansion_alerts for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.manage'));
create policy "tenant expansion ramp metrics read" on public.expansion_ramp_metrics for select using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.read')));
create policy "tenant expansion ramp metrics manage" on public.expansion_ramp_metrics for all using (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage'))) with check (exists (select 1 from public.expansion_projects p where p.id = expansion_project_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('expansion.projects.manage')));
