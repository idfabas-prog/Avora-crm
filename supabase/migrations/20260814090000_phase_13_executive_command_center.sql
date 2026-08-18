insert into public.permissions (key, description)
values
  ('executive.read', 'Read the executive command center'),
  ('executive.company.read', 'Read company-wide executive KPIs'),
  ('executive.location.read', 'Read authorized-location executive scorecards'),
  ('executive.targets.read', 'Read executive targets and progress'),
  ('executive.targets.manage', 'Create and update executive targets'),
  ('executive.alerts.read', 'Read executive owner alerts'),
  ('executive.alerts.manage', 'Acknowledge and resolve executive owner alerts'),
  ('executive.forecast.read', 'Read deterministic executive forecasts'),
  ('executive.reports.read', 'Export executive operating reports'),
  ('executive.expansion.read', 'Read expansion-readiness scorecards')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'executive.%'
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'executive.read',
  'executive.location.read',
  'executive.targets.read',
  'executive.alerts.read',
  'executive.forecast.read',
  'executive.reports.read',
  'executive.expansion.read'
)
where r.name = 'manager'
on conflict do nothing;

create table public.executive_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  metric_key text not null,
  period_type text not null check (period_type in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  target_value numeric(14,4) not null,
  warning_threshold numeric(14,4),
  critical_threshold numeric(14,4),
  effective_start date not null,
  effective_end date,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_end is null or effective_end >= effective_start)
);

create unique index executive_targets_company_unique_idx
on public.executive_targets (organization_id, metric_key, period_type, effective_start)
where location_id is null;

create unique index executive_targets_location_unique_idx
on public.executive_targets (organization_id, location_id, metric_key, period_type, effective_start)
where location_id is not null;

create table public.executive_alert_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  alert_type text not null,
  enabled boolean not null default true,
  warning_threshold numeric(14,4),
  critical_threshold numeric(14,4),
  lookback_period text not null default 'this_month',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index executive_alert_settings_unique_idx
on public.executive_alert_settings (
  organization_id,
  coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  alert_type
);

create table public.executive_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'watch' check (severity in ('info', 'watch', 'important', 'critical')),
  title text not null,
  summary text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved', 'expired')),
  identity_key text not null,
  generated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index executive_alerts_active_identity_idx
on public.executive_alerts (organization_id, identity_key)
where status in ('active', 'acknowledged');

create index executive_alerts_location_status_idx
on public.executive_alerts (organization_id, location_id, status, severity);

create table public.executive_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  snapshot_date date not null,
  metric_key text not null,
  metric_value numeric(14,4) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index executive_metric_snapshots_unique_idx
on public.executive_metric_snapshots (
  organization_id,
  coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  snapshot_date,
  metric_key
);

create index executive_metric_snapshots_metric_date_idx
on public.executive_metric_snapshots (organization_id, metric_key, snapshot_date);

create table public.executive_scorecard_weights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('financial', 'sales', 'marketing', 'operations', 'retention')),
  weight numeric(8,4) not null check (weight >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category)
);

create table public.location_operating_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  opening_date date,
  maturity_stage text not null default 'established' check (maturity_stage in ('ramp_up', 'established', 'mature')),
  target_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id)
);

create table public.executive_saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  name text not null,
  view_type text not null default 'dashboard',
  filters_json jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create trigger executive_targets_set_updated_at before update on public.executive_targets for each row execute function public.set_updated_at();
create trigger executive_alert_settings_set_updated_at before update on public.executive_alert_settings for each row execute function public.set_updated_at();
create trigger executive_alerts_set_updated_at before update on public.executive_alerts for each row execute function public.set_updated_at();
create trigger executive_scorecard_weights_set_updated_at before update on public.executive_scorecard_weights for each row execute function public.set_updated_at();
create trigger location_operating_profiles_set_updated_at before update on public.location_operating_profiles for each row execute function public.set_updated_at();
create trigger executive_saved_views_set_updated_at before update on public.executive_saved_views for each row execute function public.set_updated_at();

alter table public.executive_targets enable row level security;
alter table public.executive_alert_settings enable row level security;
alter table public.executive_alerts enable row level security;
alter table public.executive_metric_snapshots enable row level security;
alter table public.executive_scorecard_weights enable row level security;
alter table public.location_operating_profiles enable row level security;
alter table public.executive_saved_views enable row level security;

create policy "tenant executive targets read" on public.executive_targets for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.read')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_targets.location_id))
);
create policy "tenant executive targets manage" on public.executive_targets for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_targets.location_id))
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_targets.location_id))
);

create policy "tenant executive alert settings read" on public.executive_alert_settings for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.alerts.read')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_alert_settings.location_id))
);
create policy "tenant executive alert settings manage" on public.executive_alert_settings for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.alerts.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_alert_settings.location_id))
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.alerts.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_alert_settings.location_id))
);

create policy "tenant executive alerts read" on public.executive_alerts for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.alerts.read')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_alerts.location_id))
);
create policy "tenant executive alerts manage" on public.executive_alerts for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.alerts.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_alerts.location_id))
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.alerts.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_alerts.location_id))
);

create policy "tenant executive snapshots read" on public.executive_metric_snapshots for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.reports.read')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_metric_snapshots.location_id))
);
create policy "tenant executive snapshots manage" on public.executive_metric_snapshots for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_metric_snapshots.location_id))
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = executive_metric_snapshots.location_id))
);

create policy "tenant executive scorecard weights read" on public.executive_scorecard_weights for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.read')
);
create policy "tenant executive scorecard weights manage" on public.executive_scorecard_weights for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
);

create policy "tenant location operating profiles read" on public.location_operating_profiles for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.location.read')
  and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = location_operating_profiles.location_id)
);
create policy "tenant location operating profiles manage" on public.location_operating_profiles for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
  and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = location_operating_profiles.location_id)
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.targets.manage')
  and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = location_operating_profiles.location_id)
);

create policy "tenant executive saved views read" on public.executive_saved_views for select using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.read')
  and (shared or user_id = auth.uid())
);
create policy "tenant executive saved views manage" on public.executive_saved_views for all using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.read')
  and (user_id = auth.uid() or public.has_permission('executive.targets.manage'))
) with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('executive.read')
  and (user_id = auth.uid() or public.has_permission('executive.targets.manage'))
);

create or replace function public.acknowledge_executive_alert(target_alert_id uuid)
returns uuid
language plpgsql
as $$
declare
  changed_id uuid;
begin
  update public.executive_alerts
  set status = 'acknowledged',
      acknowledged_at = coalesce(acknowledged_at, now())
  where id = target_alert_id
    and status = 'active'
    and organization_id in (select public.current_organization_ids())
    and public.has_permission('executive.alerts.manage')
  returning id into changed_id;

  return changed_id;
end;
$$;

create or replace function public.resolve_executive_alert(target_alert_id uuid)
returns uuid
language plpgsql
as $$
declare
  changed_id uuid;
begin
  update public.executive_alerts
  set status = 'resolved',
      resolved_at = coalesce(resolved_at, now())
  where id = target_alert_id
    and status in ('active', 'acknowledged')
    and organization_id in (select public.current_organization_ids())
    and public.has_permission('executive.alerts.manage')
  returning id into changed_id;

  return changed_id;
end;
$$;
