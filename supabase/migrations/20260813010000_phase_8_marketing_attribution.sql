insert into public.permissions (key, description)
values
  ('marketing.read', 'Read marketing sources and campaign basics'),
  ('marketing.manage', 'Manage marketing sources and campaigns'),
  ('marketing.spend.read', 'Read marketing spend and ROI metrics'),
  ('marketing.spend.write', 'Create and update marketing spend'),
  ('marketing.attribution.read', 'Read lead and sale attribution'),
  ('marketing.attribution.manage', 'Create and correct attribution'),
  ('marketing.integrations.manage', 'Manage marketing integration mappings and sync runs'),
  ('marketing.reports.read', 'Read marketing performance reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'marketing.%'
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('marketing.read', 'marketing.attribution.read', 'marketing.reports.read', 'marketing.spend.read')
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('marketing.read', 'marketing.attribution.read')
where r.name = 'salesperson'
on conflict do nothing;

create table public.marketing_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('Meta', 'Google', 'TikTok', 'Organic Search', 'Organic Social', 'Referral', 'Website', 'Walk-In', 'Email', 'SMS', 'Existing Patient', 'Direct', 'Unknown', 'Other')),
  provider text not null default 'manual' check (provider in ('manual', 'meta', 'google', 'highlevel', 'website', 'referral', 'tiktok', 'unknown', 'other')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.marketing_source_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.marketing_sources(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, normalized_alias)
);

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  source_id uuid not null references public.marketing_sources(id) on delete restrict,
  provider text not null default 'manual',
  external_campaign_id text,
  name text not null,
  service_category text,
  objective text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  start_date date not null default current_date,
  end_date date,
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create unique index marketing_campaigns_external_idx
on public.marketing_campaigns (organization_id, provider, external_campaign_id)
where external_campaign_id is not null;

create table public.marketing_campaign_locations (
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, location_id)
);

create table public.marketing_ad_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  provider text not null default 'manual',
  external_ad_group_id text,
  name text not null,
  targeting_summary text,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, name)
);

create unique index marketing_ad_groups_external_idx
on public.marketing_ad_groups (organization_id, provider, external_ad_group_id)
where external_ad_group_id is not null;

create table public.marketing_ads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  ad_group_id uuid references public.marketing_ad_groups(id) on delete set null,
  provider text not null default 'manual',
  external_ad_id text,
  name text not null,
  creative_name text,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  landing_page_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, name)
);

create unique index marketing_ads_external_idx
on public.marketing_ads (organization_id, provider, external_ad_id)
where external_ad_id is not null;

create table public.contact_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source_id uuid references public.marketing_sources(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  ad_group_id uuid references public.marketing_ad_groups(id) on delete set null,
  ad_id uuid references public.marketing_ads(id) on delete set null,
  attribution_type text not null check (attribution_type in ('first_touch', 'last_touch', 'lead_creation', 'manual')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_page text,
  external_click_id text,
  referral_source_contact_id uuid references public.contacts(id) on delete set null,
  referral_partner text,
  referral_code text,
  captured_at timestamptz not null default now(),
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index contact_attributions_primary_idx
on public.contact_attributions (organization_id, contact_id)
where is_primary;

create unique index contact_attributions_external_click_idx
on public.contact_attributions (organization_id, external_click_id)
where external_click_id is not null;

create table public.sale_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  contact_attribution_id uuid references public.contact_attributions(id) on delete set null,
  source_id uuid references public.marketing_sources(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  ad_group_id uuid references public.marketing_ad_groups(id) on delete set null,
  ad_id uuid references public.marketing_ads(id) on delete set null,
  attribution_model text not null check (attribution_model in ('first_touch', 'last_touch', 'lead_creation', 'primary_attribution', 'manual')),
  created_at timestamptz not null default now(),
  unique (sale_id, attribution_model)
);

create table public.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  source_id uuid not null references public.marketing_sources(id) on delete restrict,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  ad_group_id uuid references public.marketing_ad_groups(id) on delete set null,
  ad_id uuid references public.marketing_ads(id) on delete set null,
  spend_date date not null,
  spend_cents integer not null check (spend_cents >= 0),
  impressions integer check (impressions is null or impressions >= 0),
  clicks integer check (clicks is null or clicks >= 0),
  leads integer check (leads is null or leads >= 0),
  imported boolean not null default false,
  provider text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, source_id, campaign_id, ad_group_id, ad_id, spend_date, provider)
);

create unique index marketing_spend_org_default_idx
on public.marketing_spend (organization_id, source_id, campaign_id, ad_group_id, ad_id, spend_date, provider)
where location_id is null;

create table public.marketing_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  sync_type text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  records_processed integer not null default 0 check (records_processed >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.marketing_attribution_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  old_contact_attribution_id uuid references public.contact_attributions(id) on delete set null,
  new_contact_attribution_id uuid references public.contact_attributions(id) on delete set null,
  reason text not null,
  corrected_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create trigger marketing_sources_set_updated_at before update on public.marketing_sources for each row execute function public.set_updated_at();
create trigger marketing_source_aliases_set_updated_at before update on public.marketing_source_aliases for each row execute function public.set_updated_at();
create trigger marketing_campaigns_set_updated_at before update on public.marketing_campaigns for each row execute function public.set_updated_at();
create trigger marketing_ad_groups_set_updated_at before update on public.marketing_ad_groups for each row execute function public.set_updated_at();
create trigger marketing_ads_set_updated_at before update on public.marketing_ads for each row execute function public.set_updated_at();
create trigger marketing_spend_set_updated_at before update on public.marketing_spend for each row execute function public.set_updated_at();

create index marketing_sources_org_idx on public.marketing_sources (organization_id, active);
create index marketing_source_aliases_source_idx on public.marketing_source_aliases (source_id);
create index marketing_campaigns_org_idx on public.marketing_campaigns (organization_id, status, active);
create index marketing_campaigns_location_idx on public.marketing_campaigns (location_id);
create index marketing_campaigns_source_idx on public.marketing_campaigns (source_id);
create index marketing_campaign_locations_location_idx on public.marketing_campaign_locations (location_id);
create index marketing_ad_groups_campaign_idx on public.marketing_ad_groups (campaign_id);
create index marketing_ads_campaign_idx on public.marketing_ads (campaign_id);
create index marketing_ads_ad_group_idx on public.marketing_ads (ad_group_id);
create index contact_attributions_org_idx on public.contact_attributions (organization_id, captured_at desc);
create index contact_attributions_location_idx on public.contact_attributions (location_id);
create index contact_attributions_contact_idx on public.contact_attributions (contact_id, captured_at desc);
create index contact_attributions_source_idx on public.contact_attributions (source_id);
create index contact_attributions_campaign_idx on public.contact_attributions (campaign_id);
create index sale_attributions_sale_idx on public.sale_attributions (sale_id);
create index sale_attributions_campaign_idx on public.sale_attributions (campaign_id);
create index marketing_spend_org_date_idx on public.marketing_spend (organization_id, spend_date desc);
create index marketing_spend_location_idx on public.marketing_spend (location_id);
create index marketing_spend_source_idx on public.marketing_spend (source_id);
create index marketing_spend_campaign_idx on public.marketing_spend (campaign_id);
create index marketing_sync_runs_org_idx on public.marketing_sync_runs (organization_id, provider, started_at desc);
create index marketing_attribution_corrections_contact_idx on public.marketing_attribution_corrections (contact_id, created_at desc);

create or replace function public.snapshot_sale_attribution_for_sale(target_sale_id uuid, model text default 'primary_attribution')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sale_row record;
  attribution_row record;
  snapshot_id uuid;
begin
  select s.id, s.organization_id, s.contact_id
  into sale_row
  from public.sales s
  where s.id = target_sale_id;

  if sale_row.id is null then
    return null;
  end if;

  select ca.*
  into attribution_row
  from public.contact_attributions ca
  where ca.organization_id = sale_row.organization_id
    and ca.contact_id = sale_row.contact_id
  order by
    case
      when model = 'first_touch' and ca.attribution_type = 'first_touch' then 0
      when model = 'last_touch' and ca.attribution_type = 'last_touch' then 0
      when model = 'lead_creation' and ca.attribution_type = 'lead_creation' then 0
      when model = 'primary_attribution' and ca.is_primary then 0
      else 1
    end,
    case when model = 'first_touch' then ca.captured_at end asc,
    ca.captured_at desc
  limit 1;

  if attribution_row.id is null then
    return null;
  end if;

  insert into public.sale_attributions (
    organization_id,
    sale_id,
    contact_attribution_id,
    source_id,
    campaign_id,
    ad_group_id,
    ad_id,
    attribution_model
  )
  values (
    sale_row.organization_id,
    sale_row.id,
    attribution_row.id,
    attribution_row.source_id,
    attribution_row.campaign_id,
    attribution_row.ad_group_id,
    attribution_row.ad_id,
    model
  )
  on conflict (sale_id, attribution_model) do nothing
  returning id into snapshot_id;

  return snapshot_id;
end;
$$;

alter table public.marketing_sources enable row level security;
alter table public.marketing_source_aliases enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_locations enable row level security;
alter table public.marketing_ad_groups enable row level security;
alter table public.marketing_ads enable row level security;
alter table public.contact_attributions enable row level security;
alter table public.sale_attributions enable row level security;
alter table public.marketing_spend enable row level security;
alter table public.marketing_sync_runs enable row level security;
alter table public.marketing_attribution_corrections enable row level security;

create policy "tenant marketing sources read" on public.marketing_sources for select
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('marketing.read') or public.has_permission('marketing.attribution.read')));
create policy "tenant marketing sources manage" on public.marketing_sources for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'));

create policy "tenant marketing source aliases read" on public.marketing_source_aliases for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.read'));
create policy "tenant marketing source aliases manage" on public.marketing_source_aliases for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'));

create policy "tenant marketing campaigns read" on public.marketing_campaigns for select
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('marketing.read') or public.has_permission('marketing.reports.read')));
create policy "tenant marketing campaigns manage" on public.marketing_campaigns for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'));

create policy "tenant marketing campaign locations read" on public.marketing_campaign_locations for select
using (exists (select 1 from public.marketing_campaigns mc where mc.id = campaign_id and mc.organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.read')));
create policy "tenant marketing campaign locations manage" on public.marketing_campaign_locations for all
using (exists (select 1 from public.marketing_campaigns mc where mc.id = campaign_id and mc.organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage')))
with check (exists (select 1 from public.marketing_campaigns mc where mc.id = campaign_id and mc.organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage')));

create policy "tenant marketing ad groups read" on public.marketing_ad_groups for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.read'));
create policy "tenant marketing ad groups manage" on public.marketing_ad_groups for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'));

create policy "tenant marketing ads read" on public.marketing_ads for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.read'));
create policy "tenant marketing ads manage" on public.marketing_ads for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.manage'));

create policy "tenant contact attribution read" on public.contact_attributions for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = contact_attributions.location_id)));
create policy "tenant contact attribution manage" on public.contact_attributions for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.manage') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = contact_attributions.location_id)));

create policy "tenant sale attribution read" on public.sale_attributions for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.read'));
create policy "tenant sale attribution manage" on public.sale_attributions for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.manage'));

create policy "tenant marketing spend read" on public.marketing_spend for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.spend.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = marketing_spend.location_id)));
create policy "tenant marketing spend write" on public.marketing_spend for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.spend.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.spend.write') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = marketing_spend.location_id)));

create policy "tenant marketing sync runs read" on public.marketing_sync_runs for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.integrations.manage'));
create policy "tenant marketing sync runs manage" on public.marketing_sync_runs for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.integrations.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.integrations.manage'));

create policy "tenant marketing attribution corrections read" on public.marketing_attribution_corrections for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.read'));
create policy "tenant marketing attribution corrections manage" on public.marketing_attribution_corrections for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('marketing.attribution.manage'));

revoke all on function public.snapshot_sale_attribution_for_sale(uuid, text) from public;
grant execute on function public.snapshot_sale_attribution_for_sale(uuid, text) to authenticated;
