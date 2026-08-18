insert into public.permissions (key, description)
values
  ('accounting.read', 'Read accounting module'),
  ('accounting.manage', 'Manage accounting module'),
  ('accounting.connections.manage', 'Manage accounting connections'),
  ('accounting.mappings.read', 'Read accounting mappings'),
  ('accounting.mappings.manage', 'Manage accounting mappings'),
  ('accounting.exports.read', 'Read accounting exports'),
  ('accounting.exports.create', 'Create accounting export batches'),
  ('accounting.exports.approve', 'Approve accounting export batches'),
  ('accounting.exports.execute', 'Execute accounting exports'),
  ('accounting.reconciliation.read', 'Read accounting reconciliation'),
  ('accounting.reconciliation.manage', 'Manage accounting reconciliation'),
  ('accounting.exceptions.read', 'Read accounting exceptions'),
  ('accounting.exceptions.manage', 'Manage accounting exceptions'),
  ('accounting.close.read', 'Read accounting close'),
  ('accounting.close.manage', 'Manage accounting close'),
  ('accounting.reports.read', 'Read accounting reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'accounting.read',
  'accounting.manage',
  'accounting.connections.manage',
  'accounting.mappings.read',
  'accounting.mappings.manage',
  'accounting.exports.read',
  'accounting.exports.create',
  'accounting.exports.approve',
  'accounting.exports.execute',
  'accounting.reconciliation.read',
  'accounting.reconciliation.manage',
  'accounting.exceptions.read',
  'accounting.exceptions.manage',
  'accounting.close.read',
  'accounting.close.manage',
  'accounting.reports.read'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'accounting.read',
  'accounting.mappings.read',
  'accounting.exports.read',
  'accounting.reconciliation.read',
  'accounting.exceptions.read',
  'accounting.close.read',
  'accounting.reports.read'
)
where r.name = 'manager'
on conflict do nothing;

create table public.accounting_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('quickbooks_online', 'xero', 'csv_export', 'other')),
  status text not null default 'development' check (status in ('disconnected', 'development', 'connected', 'error', 'disabled')),
  external_company_id text,
  company_name text,
  last_sync_at timestamptz,
  sync_mode text not null default 'development' check (sync_mode in ('disabled', 'development', 'enabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  accounting_connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  external_account_id text not null,
  account_name text not null,
  account_type text not null,
  account_subtype text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accounting_connection_id, external_account_id)
);

create table public.accounting_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  accounting_connection_id uuid references public.accounting_connections(id) on delete cascade,
  mapping_type text not null check (mapping_type in ('revenue', 'refund', 'cogs', 'inventory_asset', 'commission_expense', 'royalty_expense', 'management_fee', 'membership_revenue', 'payment_plan_receivable', 'sales_tax_future', 'merchant_fees', 'cash', 'undeposited_funds', 'labor_expense', 'vendor_bills_future', 'other')),
  source_key text not null,
  external_account_id text,
  external_tracking_id text,
  description text,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, accounting_connection_id, mapping_type, source_key)
);

create table public.accounting_location_mappings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  accounting_connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  external_location_id text not null,
  external_location_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, accounting_connection_id)
);

create table public.accounting_entity_mappings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operating_entity_id uuid not null references public.operating_entities(id) on delete cascade,
  accounting_connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  external_entity_id text,
  external_entity_name text not null,
  mapping_mode text not null default 'same_company' check (mapping_mode in ('same_company', 'separate_company', 'tracking_only')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (operating_entity_id, accounting_connection_id)
);

create table public.accounting_customer_mappings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  accounting_connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  external_customer_id text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contact_id, accounting_connection_id)
);

create table public.accounting_export_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  accounting_connection_id uuid references public.accounting_connections(id) on delete set null,
  batch_type text not null check (batch_type in ('sales', 'payments', 'refunds', 'cogs', 'commissions', 'royalties', 'management_fees', 'labor_support', 'journal_preview', 'vendor_bills_future')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'exported', 'failed', 'cancelled')),
  record_count integer not null default 0,
  debit_total_cents integer,
  credit_total_cents integer,
  export_version integer not null default 1,
  created_by uuid references public.user_profiles(id) on delete set null,
  approved_by uuid references public.user_profiles(id) on delete set null,
  approved_at timestamptz,
  exported_at timestamptz,
  validation_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, accounting_connection_id, batch_type, period_start, period_end, export_version)
);

create table public.accounting_export_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  accounting_export_batch_id uuid not null references public.accounting_export_batches(id) on delete cascade,
  accounting_connection_id uuid references public.accounting_connections(id) on delete set null,
  source_type text not null,
  source_id uuid not null,
  export_version integer not null default 1,
  location_id uuid references public.locations(id) on delete set null,
  operating_entity_id uuid references public.operating_entities(id) on delete set null,
  external_account_id text,
  amount_cents integer not null,
  debit_credit text not null check (debit_credit in ('debit', 'credit')),
  description text not null,
  export_status text not null default 'draft' check (export_status in ('draft', 'ready', 'exported', 'failed', 'cancelled', 'reversed')),
  external_transaction_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, accounting_connection_id, source_type, source_id, export_version, debit_credit, external_account_id)
);

create table public.accounting_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  operating_entity_id uuid references public.operating_entities(id) on delete set null,
  source_type text not null,
  source_id uuid,
  exception_type text not null check (exception_type in ('missing_revenue_mapping', 'missing_location_mapping', 'payment_not_linked_to_sale', 'refund_exceeds_payment', 'unmapped_payment_method', 'unbalanced_journal', 'duplicate_export_attempt', 'missing_entity_mapping', 'post_close_adjustment', 'unmatched_payment', 'missing_management_fee_mapping', 'other')),
  severity text not null default 'watch' check (severity in ('info', 'watch', 'important', 'critical')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'assigned', 'resolved', 'dismissed')),
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_type, source_id, exception_type)
);

create table public.processor_reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  processor text not null check (processor in ('stripe', 'cash', 'manual', 'other')),
  processor_transaction_id text not null,
  payment_id uuid references public.payments(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  gross_cents integer not null default 0,
  fee_cents integer not null default 0,
  net_cents integer not null default 0,
  settlement_date date,
  status text not null default 'unmatched' check (status in ('matched', 'partial', 'unmatched', 'duplicate', 'exception')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, processor, processor_transaction_id)
);

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'review', 'closed', 'reopened')),
  closed_at timestamptz,
  closed_by uuid references public.user_profiles(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references public.user_profiles(id) on delete set null,
  close_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, period_start, period_end)
);

create table public.close_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  required boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category, title)
);

create table public.accounting_close_items (
  id uuid primary key default gen_random_uuid(),
  accounting_period_id uuid not null references public.accounting_periods(id) on delete cascade,
  title text not null,
  category text not null,
  required boolean not null default true,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'complete', 'not_applicable')),
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accounting_period_id, title)
);

create table public.accounting_sync_runs (
  id uuid primary key default gen_random_uuid(),
  accounting_connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  sync_type text not null check (sync_type in ('chart_of_accounts', 'tracking_categories', 'customers', 'export_batch', 'webhook', 'reconciliation', 'other')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed', 'cancelled')),
  records_processed integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_failed integer not null default 0,
  error_summary text,
  created_at timestamptz not null default now(),
  unique (accounting_connection_id, sync_type, started_at)
);

create table public.accounting_webhook_events (
  id uuid primary key default gen_random_uuid(),
  accounting_connection_id uuid not null references public.accounting_connections(id) on delete cascade,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  created_at timestamptz not null default now(),
  unique (accounting_connection_id, provider_event_id)
);

create index accounting_connections_org_idx on public.accounting_connections (organization_id, provider, status);
create unique index accounting_connections_provider_company_uidx on public.accounting_connections (organization_id, provider, (coalesce(external_company_id, 'development')));
create index accounting_accounts_org_idx on public.accounting_accounts (organization_id, active, account_type);
create index accounting_mappings_type_idx on public.accounting_mappings (organization_id, mapping_type, source_key, active);
create index accounting_location_mappings_connection_idx on public.accounting_location_mappings (accounting_connection_id, active);
create index accounting_entity_mappings_connection_idx on public.accounting_entity_mappings (accounting_connection_id, active);
create index accounting_customer_mappings_connection_idx on public.accounting_customer_mappings (accounting_connection_id, last_synced_at);
create index accounting_export_batches_period_idx on public.accounting_export_batches (organization_id, period_start, period_end, status);
create index accounting_export_items_batch_idx on public.accounting_export_items (accounting_export_batch_id, export_status);
create index accounting_export_items_source_idx on public.accounting_export_items (organization_id, source_type, source_id);
create index accounting_exceptions_status_idx on public.accounting_exceptions (organization_id, status, severity, exception_type);
create index processor_reconciliation_status_idx on public.processor_reconciliation_records (organization_id, processor, status, settlement_date);
create index accounting_periods_status_idx on public.accounting_periods (organization_id, status, period_start);
create index accounting_close_items_period_idx on public.accounting_close_items (accounting_period_id, status, category);
create index accounting_sync_runs_connection_idx on public.accounting_sync_runs (accounting_connection_id, status, started_at desc);
create index accounting_webhook_events_status_idx on public.accounting_webhook_events (accounting_connection_id, status, created_at);

drop trigger if exists accounting_connections_set_updated_at on public.accounting_connections;
create trigger accounting_connections_set_updated_at before update on public.accounting_connections for each row execute function public.set_updated_at();
drop trigger if exists accounting_accounts_set_updated_at on public.accounting_accounts;
create trigger accounting_accounts_set_updated_at before update on public.accounting_accounts for each row execute function public.set_updated_at();
drop trigger if exists accounting_mappings_set_updated_at on public.accounting_mappings;
create trigger accounting_mappings_set_updated_at before update on public.accounting_mappings for each row execute function public.set_updated_at();
drop trigger if exists accounting_location_mappings_set_updated_at on public.accounting_location_mappings;
create trigger accounting_location_mappings_set_updated_at before update on public.accounting_location_mappings for each row execute function public.set_updated_at();
drop trigger if exists accounting_entity_mappings_set_updated_at on public.accounting_entity_mappings;
create trigger accounting_entity_mappings_set_updated_at before update on public.accounting_entity_mappings for each row execute function public.set_updated_at();
drop trigger if exists accounting_customer_mappings_set_updated_at on public.accounting_customer_mappings;
create trigger accounting_customer_mappings_set_updated_at before update on public.accounting_customer_mappings for each row execute function public.set_updated_at();
drop trigger if exists accounting_export_batches_set_updated_at on public.accounting_export_batches;
create trigger accounting_export_batches_set_updated_at before update on public.accounting_export_batches for each row execute function public.set_updated_at();
drop trigger if exists accounting_export_items_set_updated_at on public.accounting_export_items;
create trigger accounting_export_items_set_updated_at before update on public.accounting_export_items for each row execute function public.set_updated_at();
drop trigger if exists accounting_exceptions_set_updated_at on public.accounting_exceptions;
create trigger accounting_exceptions_set_updated_at before update on public.accounting_exceptions for each row execute function public.set_updated_at();
drop trigger if exists processor_reconciliation_records_set_updated_at on public.processor_reconciliation_records;
create trigger processor_reconciliation_records_set_updated_at before update on public.processor_reconciliation_records for each row execute function public.set_updated_at();
drop trigger if exists accounting_periods_set_updated_at on public.accounting_periods;
create trigger accounting_periods_set_updated_at before update on public.accounting_periods for each row execute function public.set_updated_at();
drop trigger if exists close_checklist_templates_set_updated_at on public.close_checklist_templates;
create trigger close_checklist_templates_set_updated_at before update on public.close_checklist_templates for each row execute function public.set_updated_at();
drop trigger if exists accounting_close_items_set_updated_at on public.accounting_close_items;
create trigger accounting_close_items_set_updated_at before update on public.accounting_close_items for each row execute function public.set_updated_at();

create or replace function public.accounting_batch_balance(target_batch_id uuid)
returns table (debit_total_cents integer, credit_total_cents integer, balanced boolean)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(amount_cents) filter (where debit_credit = 'debit'), 0)::integer as debit_total_cents,
    coalesce(sum(amount_cents) filter (where debit_credit = 'credit'), 0)::integer as credit_total_cents,
    coalesce(sum(amount_cents) filter (where debit_credit = 'debit'), 0) = coalesce(sum(amount_cents) filter (where debit_credit = 'credit'), 0) as balanced
  from public.accounting_export_items
  where accounting_export_batch_id = target_batch_id;
$$;

create or replace function public.accounting_period_locked(target_organization_id uuid, target_date date)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounting_periods ap
    where ap.organization_id = target_organization_id
      and ap.status = 'closed'
      and target_date between ap.period_start and ap.period_end
  );
$$;

create or replace function public.accounting_close_readiness(target_period_id uuid)
returns table (readiness_score integer, blocker_count integer, open_exception_count integer, required_incomplete_count integer)
language sql
security definer
set search_path = public
as $$
  with period_row as (
    select * from public.accounting_periods where id = target_period_id
  ),
  close_items as (
    select *
    from public.accounting_close_items
    where accounting_period_id = target_period_id
  ),
  exceptions as (
    select ae.*
    from public.accounting_exceptions ae
    join period_row p on p.organization_id = ae.organization_id
    where ae.status in ('open', 'assigned')
      and ae.created_at::date between p.period_start and p.period_end
  ),
  unbalanced_batches as (
    select b.id
    from public.accounting_export_batches b
    join period_row p on p.organization_id = b.organization_id
    cross join lateral public.accounting_batch_balance(b.id) balance
    where b.period_start >= p.period_start
      and b.period_end <= p.period_end
      and b.status not in ('cancelled', 'failed')
      and not balance.balanced
  )
  select
    greatest(
      0,
      least(
        100,
        round(
          100
          * coalesce((select count(*) filter (where status in ('complete', 'not_applicable'))::numeric / nullif(count(*)::numeric, 0) from close_items), 0)
          - (select count(*) from exceptions where severity = 'critical') * 15
          - (select count(*) from unbalanced_batches) * 20
        )
      )
    )::integer as readiness_score,
    ((select count(*) from exceptions where severity = 'critical') + (select count(*) from unbalanced_batches))::integer as blocker_count,
    (select count(*) from exceptions)::integer as open_exception_count,
    (select count(*) from close_items where required and status not in ('complete', 'not_applicable'))::integer as required_incomplete_count;
$$;

create or replace function public.accounting_record_exception(
  target_organization_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_exception_type text,
  target_severity text,
  target_message text,
  target_location_id uuid default null,
  target_operating_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  exception_id uuid;
begin
  insert into public.accounting_exceptions (
    organization_id,
    location_id,
    operating_entity_id,
    source_type,
    source_id,
    exception_type,
    severity,
    message,
    status
  )
  values (
    target_organization_id,
    target_location_id,
    target_operating_entity_id,
    target_source_type,
    target_source_id,
    target_exception_type,
    target_severity,
    target_message,
    'open'
  )
  on conflict (organization_id, source_type, source_id, exception_type) do update
  set severity = excluded.severity,
      message = excluded.message,
      status = case when public.accounting_exceptions.status = 'resolved' then 'open' else public.accounting_exceptions.status end,
      updated_at = now()
  returning id into exception_id;

  return exception_id;
end;
$$;

alter table public.accounting_connections enable row level security;
alter table public.accounting_accounts enable row level security;
alter table public.accounting_mappings enable row level security;
alter table public.accounting_location_mappings enable row level security;
alter table public.accounting_entity_mappings enable row level security;
alter table public.accounting_customer_mappings enable row level security;
alter table public.accounting_export_batches enable row level security;
alter table public.accounting_export_items enable row level security;
alter table public.accounting_exceptions enable row level security;
alter table public.processor_reconciliation_records enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.close_checklist_templates enable row level security;
alter table public.accounting_close_items enable row level security;
alter table public.accounting_sync_runs enable row level security;
alter table public.accounting_webhook_events enable row level security;

create policy "tenant accounting connections read" on public.accounting_connections for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.read'));
create policy "tenant accounting connections manage" on public.accounting_connections for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage'));
create policy "tenant accounting accounts read" on public.accounting_accounts for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.read'));
create policy "tenant accounting accounts manage" on public.accounting_accounts for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage'));
create policy "tenant accounting mappings read" on public.accounting_mappings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.read'));
create policy "tenant accounting mappings manage" on public.accounting_mappings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage'));
create policy "tenant accounting location mappings read" on public.accounting_location_mappings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.read') and public.expansion_location_allowed(location_id));
create policy "tenant accounting location mappings manage" on public.accounting_location_mappings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage'));
create policy "tenant accounting entity mappings read" on public.accounting_entity_mappings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.read'));
create policy "tenant accounting entity mappings manage" on public.accounting_entity_mappings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.mappings.manage'));
create policy "tenant accounting customer mappings access" on public.accounting_customer_mappings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.create'));
create policy "tenant accounting export batches read" on public.accounting_export_batches for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.read'));
create policy "tenant accounting export batches create" on public.accounting_export_batches for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.create'));
create policy "tenant accounting export batches approve" on public.accounting_export_batches for update using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.approve')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.approve'));
create policy "tenant accounting export items read" on public.accounting_export_items for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.read') and (location_id is null or public.expansion_location_allowed(location_id)));
create policy "tenant accounting export items manage" on public.accounting_export_items for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.create')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exports.create'));
create policy "tenant accounting exceptions read" on public.accounting_exceptions for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exceptions.read') and (location_id is null or public.expansion_location_allowed(location_id)));
create policy "tenant accounting exceptions manage" on public.accounting_exceptions for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exceptions.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.exceptions.manage'));
create policy "tenant processor reconciliation read" on public.processor_reconciliation_records for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.reconciliation.read') and (location_id is null or public.expansion_location_allowed(location_id)));
create policy "tenant processor reconciliation manage" on public.processor_reconciliation_records for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.reconciliation.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.reconciliation.manage'));
create policy "tenant accounting periods read" on public.accounting_periods for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.read'));
create policy "tenant accounting periods manage" on public.accounting_periods for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.manage'));
create policy "tenant close checklist templates read" on public.close_checklist_templates for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.read'));
create policy "tenant close checklist templates manage" on public.close_checklist_templates for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.manage'));
create policy "tenant accounting close items access" on public.accounting_close_items for all using (exists (select 1 from public.accounting_periods ap where ap.id = accounting_period_id and ap.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.read'))) with check (exists (select 1 from public.accounting_periods ap where ap.id = accounting_period_id and ap.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.close.manage')));
create policy "tenant accounting sync runs read" on public.accounting_sync_runs for select using (exists (select 1 from public.accounting_connections c where c.id = accounting_connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage')));
create policy "tenant accounting sync runs manage" on public.accounting_sync_runs for all using (exists (select 1 from public.accounting_connections c where c.id = accounting_connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage'))) with check (exists (select 1 from public.accounting_connections c where c.id = accounting_connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage')));
create policy "tenant accounting webhook events read" on public.accounting_webhook_events for select using (exists (select 1 from public.accounting_connections c where c.id = accounting_connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage')));
create policy "tenant accounting webhook events manage" on public.accounting_webhook_events for all using (exists (select 1 from public.accounting_connections c where c.id = accounting_connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage'))) with check (exists (select 1 from public.accounting_connections c where c.id = accounting_connection_id and c.organization_id in (select public.current_organization_ids()) and public.has_permission('accounting.connections.manage')));
