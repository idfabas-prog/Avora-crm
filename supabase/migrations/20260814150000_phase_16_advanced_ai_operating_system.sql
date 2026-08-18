insert into public.permissions (key, description)
values
  ('ai.operating_brief', 'Read AI operating briefs'),
  ('ai.proactive_insights', 'Read and refresh proactive AI insights'),
  ('ai.predictions.read', 'Read AI predictive scores'),
  ('ai.recommendations.read', 'Read AI recommendations'),
  ('ai.recommendations.manage', 'Manage AI recommendation status'),
  ('ai.forecasts.read', 'Read AI forecast records'),
  ('ai.forecasts.manage', 'Manage AI forecast records'),
  ('ai.risk.read', 'Read AI risk worklists'),
  ('ai.collections.read', 'Read AI collections worklists'),
  ('ai.location_intelligence', 'Read AI location intelligence'),
  ('ai.operating_settings.manage', 'Manage AI operating system settings')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'ai.operating_brief',
  'ai.proactive_insights',
  'ai.predictions.read',
  'ai.recommendations.read',
  'ai.recommendations.manage',
  'ai.forecasts.read',
  'ai.forecasts.manage',
  'ai.risk.read',
  'ai.collections.read',
  'ai.location_intelligence',
  'ai.operating_settings.manage'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'ai.operating_brief',
  'ai.proactive_insights',
  'ai.predictions.read',
  'ai.recommendations.read',
  'ai.risk.read',
  'ai.collections.read',
  'ai.location_intelligence'
)
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'ai.operating_brief',
  'ai.predictions.read',
  'ai.recommendations.read',
  'ai.risk.read'
)
where r.name = 'salesperson'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'ai.operating_brief',
  'ai.recommendations.read'
)
where r.name = 'provider'
on conflict do nothing;

alter table public.ai_insights
  add column if not exists insight_key text,
  add column if not exists category text not null default 'sales',
  add column if not exists confidence numeric(5, 4) not null default 0.65 check (confidence between 0 and 1),
  add column if not exists comparison_period text,
  add column if not exists current_value numeric,
  add column if not exists baseline_value numeric,
  add column if not exists difference_value numeric,
  add column if not exists affected_records_count integer not null default 0,
  add column if not exists supporting_route text,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists generated_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists model_version text not null default 'deterministic-operating-v1',
  add column if not exists rules_version text not null default 'phase-16-v1';

alter table public.ai_insights drop constraint if exists ai_insights_severity_check;
alter table public.ai_insights
  add constraint ai_insights_severity_check check (severity in ('info', 'watch', 'important', 'critical'));

alter table public.ai_insights drop constraint if exists ai_insights_status_check;
alter table public.ai_insights
  add constraint ai_insights_status_check check (status in ('active', 'acknowledged', 'resolved', 'dismissed', 'expired'));

create unique index if not exists ai_insights_org_key_idx
on public.ai_insights (organization_id, insight_key)
where insight_key is not null;

create index if not exists ai_insights_category_idx on public.ai_insights (organization_id, category, status);

create table public.ai_operating_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  setting_key text not null,
  ai_operating_mode text not null default 'development' check (ai_operating_mode in ('disabled', 'development', 'enabled')),
  enabled boolean not null default true,
  configuration_json jsonb not null default '{}'::jsonb,
  notification_rules_json jsonb not null default '{}'::jsonb,
  safety_rules_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_operating_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  audience_user_id uuid references public.user_profiles(id) on delete set null,
  brief_key text not null,
  brief_type text not null check (brief_type in ('daily', 'weekly', 'monthly', 'manager', 'salesperson', 'executive_daily', 'manager_daily', 'sales_daily', 'provider_daily')),
  brief_date date not null,
  audience_type text not null check (audience_type in ('owner', 'administrator', 'manager', 'salesperson', 'provider')),
  title text not null,
  summary text not null,
  metrics_snapshot_json jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  sections_json jsonb not null default '[]'::jsonb,
  top_priorities_json jsonb not null default '[]'::jsonb,
  limitations_json jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4) not null default 0.65 check (confidence between 0 and 1),
  status text not null default 'ready' check (status in ('draft', 'ready', 'archived')),
  generated_by uuid references public.user_profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  model text not null default 'deterministic-operating-v1',
  model_version text not null default 'deterministic-operating-v1',
  rules_version text not null default 'phase-16-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, brief_key)
);

create table public.predictive_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  score_key text not null,
  score_type text not null check (score_type in ('lead_conversion', 'no_show', 'no_show_risk', 'churn', 'churn_risk', 'collection', 'collection_priority', 'reactivation', 'reactivation_priority', 'revenue_opportunity')),
  entity_type text not null check (entity_type in ('contact', 'opportunity', 'appointment', 'sale', 'membership', 'location', 'campaign', 'call')),
  entity_id uuid,
  score integer not null check (score between 0 and 100),
  label text not null,
  band text not null check (band in ('low', 'medium', 'high', 'urgent')),
  confidence numeric(5, 4) not null default 0.65 check (confidence between 0 and 1),
  factors_json jsonb not null default '[]'::jsonb,
  explainability_json jsonb not null default '[]'::jsonb,
  excluded_factors_json jsonb not null default '[]'::jsonb,
  recommended_next_step text not null,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  model_version text not null default 'deterministic-operating-v1',
  rules_version text not null default 'phase-16-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, score_key)
);

create table public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  recommendation_key text not null,
  recommendation_type text not null check (recommendation_type in ('operating_priority', 'lead_follow_up', 'no_show_prevention', 'churn_prevention', 'collections', 'revenue_opportunity', 'location_risk', 'workflow_suggestion')),
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  title text not null,
  summary text not null,
  rationale_json jsonb not null default '[]'::jsonb,
  suggested_actions_json jsonb not null default '[]'::jsonb,
  safety_json jsonb not null default '{}'::jsonb,
  expected_impact_json jsonb not null default '{}'::jsonb,
  related_entity_type text,
  related_entity_id uuid,
  status text not null default 'open' check (status in ('open', 'accepted', 'deferred', 'dismissed', 'completed')),
  due_at timestamptz,
  acted_at timestamptz,
  acted_by uuid references public.user_profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  model_version text not null default 'deterministic-operating-v1',
  rules_version text not null default 'phase-16-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, recommendation_key)
);

create table public.forecast_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  forecast_key text not null,
  metric_key text not null,
  metric_label text not null,
  period_start date not null,
  period_end date not null,
  actual_value numeric(14, 2) not null default 0,
  forecast_value numeric(14, 2) not null default 0,
  target_value numeric(14, 2),
  gap_value numeric(14, 2),
  method text not null check (method in ('run_rate', 'rolling_average', 'weighted_recent_average')),
  confidence text not null check (confidence in ('high', 'moderate', 'limited')),
  assumptions_json jsonb not null default '[]'::jsonb,
  limitations_json jsonb not null default '[]'::jsonb,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  model_version text not null default 'deterministic-operating-v1',
  rules_version text not null default 'phase-16-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, forecast_key)
);

create trigger ai_operating_settings_set_updated_at before update on public.ai_operating_settings for each row execute function public.set_updated_at();
create trigger ai_operating_briefs_set_updated_at before update on public.ai_operating_briefs for each row execute function public.set_updated_at();
create trigger predictive_scores_set_updated_at before update on public.predictive_scores for each row execute function public.set_updated_at();
create trigger ai_recommendations_set_updated_at before update on public.ai_recommendations for each row execute function public.set_updated_at();
create trigger forecast_records_set_updated_at before update on public.forecast_records for each row execute function public.set_updated_at();

create unique index ai_operating_settings_org_key_idx
on public.ai_operating_settings (organization_id, setting_key)
where location_id is null;

create unique index ai_operating_settings_location_key_idx
on public.ai_operating_settings (organization_id, location_id, setting_key)
where location_id is not null;

create index ai_operating_briefs_audience_idx on public.ai_operating_briefs (organization_id, audience_type, brief_date desc);
create index ai_operating_briefs_location_idx on public.ai_operating_briefs (location_id, brief_date desc);
create index predictive_scores_type_score_idx on public.predictive_scores (organization_id, score_type, score desc);
create index predictive_scores_location_idx on public.predictive_scores (location_id, score_type);
create index ai_recommendations_status_idx on public.ai_recommendations (organization_id, status, priority);
create index ai_recommendations_location_idx on public.ai_recommendations (location_id, status);
create index forecast_records_metric_idx on public.forecast_records (organization_id, metric_key, period_end desc);
create index forecast_records_location_idx on public.forecast_records (location_id, metric_key);

alter table public.ai_operating_settings enable row level security;
alter table public.ai_operating_briefs enable row level security;
alter table public.predictive_scores enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.forecast_records enable row level security;

create or replace function public.ai_location_allowed(target_location_id uuid)
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
    );
$$;

create or replace function public.ai_confidence_label(sample_size integer, completeness numeric, period_maturity numeric)
returns text
language sql
immutable
as $$
  select case
    when coalesce(sample_size, 0) >= 30 and coalesce(completeness, 0) >= 0.85 and coalesce(period_maturity, 0) >= 0.5 then 'high'
    when coalesce(sample_size, 0) >= 10 and coalesce(completeness, 0) >= 0.65 then 'moderate'
    else 'limited'
  end;
$$;

create or replace function public.ai_recommendation_priority(score integer)
returns text
language sql
immutable
as $$
  select case
    when coalesce(score, 0) >= 85 then 'urgent'
    when coalesce(score, 0) >= 70 then 'high'
    when coalesce(score, 0) >= 45 then 'medium'
    else 'low'
  end;
$$;

create or replace function public.ai_insight_severity(metric_change numeric, sample_size integer)
returns text
language sql
immutable
as $$
  select case
    when abs(coalesce(metric_change, 0)) >= 0.35 and coalesce(sample_size, 0) >= 20 then 'critical'
    when abs(coalesce(metric_change, 0)) >= 0.2 and coalesce(sample_size, 0) >= 10 then 'important'
    when abs(coalesce(metric_change, 0)) >= 0.1 then 'watch'
    else 'info'
  end;
$$;

create policy "tenant ai insights acknowledge phase16" on public.ai_insights for update
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.proactive_insights')
  and public.ai_location_allowed(location_id)
)
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.proactive_insights')
  and public.ai_location_allowed(location_id)
);

create policy "tenant ai operating settings read" on public.ai_operating_settings for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.operating_brief') and public.ai_location_allowed(location_id));
create policy "tenant ai operating settings manage" on public.ai_operating_settings for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.operating_settings.manage') and public.ai_location_allowed(location_id))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.operating_settings.manage') and public.ai_location_allowed(location_id));

create policy "tenant ai operating briefs read" on public.ai_operating_briefs for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.operating_brief')
  and public.ai_location_allowed(location_id)
  and (audience_user_id is null or audience_user_id = auth.uid() or public.has_permission('ai.owner_analytics'))
);
create policy "tenant ai operating briefs manage" on public.ai_operating_briefs for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.proactive_insights') and public.ai_location_allowed(location_id))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.proactive_insights') and public.ai_location_allowed(location_id));

create policy "tenant predictive scores read" on public.predictive_scores for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.predictions.read') and public.ai_location_allowed(location_id));
create policy "tenant predictive scores manage" on public.predictive_scores for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.proactive_insights') and public.ai_location_allowed(location_id))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.proactive_insights') and public.ai_location_allowed(location_id));

create policy "tenant ai recommendations read" on public.ai_recommendations for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.recommendations.read')
  and public.ai_location_allowed(location_id)
  and (assigned_user_id is null or assigned_user_id = auth.uid() or public.has_permission('ai.owner_analytics'))
);
create policy "tenant ai recommendations manage" on public.ai_recommendations for update
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.recommendations.manage')
  and public.ai_location_allowed(location_id)
)
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.recommendations.manage')
  and public.ai_location_allowed(location_id)
);
create policy "tenant ai recommendations insert" on public.ai_recommendations for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.proactive_insights') and public.ai_location_allowed(location_id));

create policy "tenant forecast records read" on public.forecast_records for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.forecasts.read') and public.ai_location_allowed(location_id));
create policy "tenant forecast records manage" on public.forecast_records for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.forecasts.manage') and public.ai_location_allowed(location_id))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.forecasts.manage') and public.ai_location_allowed(location_id));
