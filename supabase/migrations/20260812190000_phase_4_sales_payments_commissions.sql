insert into public.permissions (key, description)
values
  ('sales.read', 'Read sales and sale items'),
  ('sales.write', 'Create and update sales'),
  ('sales.adjust', 'Create sale discounts and adjustments'),
  ('payments.read', 'Read payments and refunds'),
  ('payments.write', 'Record payments'),
  ('payments.refund', 'Create refunds'),
  ('commissions.read', 'Read commission ledger'),
  ('commissions.manage', 'Approve and pay commissions'),
  ('royalties.read', 'Read royalty ledger'),
  ('royalties.manage', 'Manage royalty rules and payments'),
  ('financial_reports.read', 'Read financial reports'),
  ('services.manage', 'Manage services and packages')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name in ('owner', 'administrator')
  and p.key in ('sales.read', 'sales.write', 'sales.adjust', 'payments.read', 'payments.write', 'payments.refund', 'commissions.read', 'commissions.manage', 'royalties.read', 'royalties.manage', 'financial_reports.read', 'services.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'manager'
  and p.key in ('sales.read', 'sales.write', 'sales.adjust', 'payments.read', 'payments.write', 'payments.refund', 'commissions.read', 'commissions.manage', 'royalties.read', 'financial_reports.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'salesperson'
  and p.key in ('sales.read', 'sales.write', 'payments.read', 'payments.write', 'commissions.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'provider'
  and p.key in ('sales.read', 'payments.read')
on conflict do nothing;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  default_price_cents integer not null default 0 check (default_price_cents >= 0),
  active boolean not null default true,
  commission_eligible boolean not null default true,
  royalty_eligible boolean not null default true,
  default_commission_rate numeric(7,4),
  default_royalty_rate numeric(7,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  package_price_cents integer not null default 0 check (package_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.package_items (
  package_id uuid not null references public.packages(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_value_cents integer not null default 0 check (unit_value_cents >= 0),
  created_at timestamptz not null default now(),
  primary key (package_id, service_id)
);

create table public.location_service_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  package_id uuid references public.packages(id) on delete cascade,
  price_cents integer check (price_cents is null or price_cents >= 0),
  active boolean,
  commission_eligible boolean,
  royalty_eligible boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((service_id is not null and package_id is null) or (service_id is null and package_id is not null)),
  unique (location_id, service_id),
  unique (location_id, package_id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  salesperson_id uuid references public.user_profiles(id) on delete set null,
  created_by uuid references public.user_profiles(id) on delete set null,
  status text not null default 'open',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_amount_cents integer not null default 0 check (discount_amount_cents >= 0),
  adjustment_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0 check (total_amount_cents >= 0),
  paid_amount_cents integer not null default 0 check (paid_amount_cents >= 0),
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  balance_due_cents integer not null default 0 check (balance_due_cents >= 0),
  currency text not null default 'USD',
  sale_date timestamptz not null default now(),
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  discount_amount_cents integer not null default 0 check (discount_amount_cents >= 0),
  line_total_cents integer not null default 0 check (line_total_cents >= 0),
  commission_eligible boolean not null default true,
  royalty_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_id is not null or package_id is not null or description <> '')
);

create table public.sale_discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  discount_value numeric(12,4) not null check (discount_value >= 0),
  discount_amount_cents integer not null default 0 check (discount_amount_cents >= 0),
  reason text,
  authorized_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.sale_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('credit', 'write_off', 'price_correction', 'post_sale_discount', 'manual')),
  amount_cents integer not null,
  reason text not null,
  authorized_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.payment_method_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  payment_method text not null,
  provider text not null default 'manual',
  fee_percentage numeric(7,4) not null default 0,
  fee_fixed_cents integer not null default 0 check (fee_fixed_cents >= 0),
  affects_commission_basis boolean not null default false,
  affects_royalty_basis boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, payment_method, provider)
);

create unique index payment_method_rules_org_default_idx
on public.payment_method_rules(organization_id, payment_method, provider)
where location_id is null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'USD',
  payment_method text not null,
  payment_provider text not null default 'manual',
  payment_purpose text not null default 'installment',
  provider_payment_id text,
  status text not null default 'succeeded',
  received_at timestamptz not null default now(),
  processed_by uuid references public.user_profiles(id) on delete set null,
  notes text,
  external_reference text,
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payments_provider_payment_id_idx
on public.payments(payment_provider, provider_payment_id)
where provider_payment_id is not null;

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  payment_id uuid not null references public.payments(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  reason text,
  provider_refund_id text,
  status text not null default 'succeeded',
  processed_by uuid references public.user_profiles(id) on delete set null,
  refunded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index refunds_provider_refund_id_idx
on public.refunds(provider_refund_id)
where provider_refund_id is not null;

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  package_id uuid references public.packages(id) on delete cascade,
  category text,
  commission_type text not null default 'percentage' check (commission_type in ('percentage', 'fixed_amount')),
  rate numeric(9,4) not null default 0,
  active boolean not null default true,
  effective_start_date date not null default current_date,
  effective_end_date date,
  basis text not null default 'money_collected' check (basis in ('gross_sale', 'money_collected', 'net_after_payment_fees', 'custom_manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  commission_rule_id uuid references public.commission_rules(id) on delete set null,
  basis_amount_cents integer not null default 0,
  commission_rate numeric(9,4) not null default 0,
  commission_amount_cents integer not null default 0,
  status text not null default 'pending',
  calculated_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index commissions_payment_rule_idx
on public.commissions(payment_id, commission_rule_id, sale_item_id)
where payment_id is not null and refund_id is null;

create unique index commissions_refund_rule_idx
on public.commissions(refund_id, commission_rule_id, sale_item_id)
where refund_id is not null;

create table public.royalty_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  category text,
  service_id uuid references public.services(id) on delete cascade,
  package_id uuid references public.packages(id) on delete cascade,
  rate numeric(9,4) not null default 0,
  basis text not null default 'money_collected' check (basis in ('gross_sale', 'money_collected', 'net_after_refunds')),
  active boolean not null default true,
  effective_start_date date not null default current_date,
  effective_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.royalties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  sale_id uuid not null references public.sales(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  royalty_rule_id uuid references public.royalty_rules(id) on delete set null,
  basis_amount_cents integer not null default 0,
  royalty_rate numeric(9,4) not null default 0,
  royalty_amount_cents integer not null default 0,
  status text not null default 'pending',
  calculated_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index royalties_payment_rule_idx
on public.royalties(payment_id, royalty_rule_id, sale_item_id)
where payment_id is not null and refund_id is null;

create unique index royalties_refund_rule_idx
on public.royalties(refund_id, royalty_rule_id, sale_item_id)
where refund_id is not null;

create table public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, contact_id),
  unique (stripe_customer_id)
);

create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  unique (provider_event_id)
);

create table public.stripe_terminal_placeholders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  terminal_location_id text,
  reader_id text,
  label text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_org_category_idx on public.services(organization_id, category);
create index packages_org_idx on public.packages(organization_id);
create index sales_org_location_date_idx on public.sales(organization_id, location_id, sale_date desc);
create index sales_contact_idx on public.sales(contact_id);
create index sales_salesperson_idx on public.sales(salesperson_id);
create index sales_status_idx on public.sales(status);
create index sale_items_sale_idx on public.sale_items(sale_id);
create index payments_sale_idx on public.payments(sale_id);
create index payments_org_location_received_idx on public.payments(organization_id, location_id, received_at desc);
create index payments_status_idx on public.payments(status);
create index refunds_sale_idx on public.refunds(sale_id);
create index commissions_user_idx on public.commissions(user_id, status);
create index royalties_location_idx on public.royalties(location_id, status);

create or replace function public.recalculate_sale_financials(target_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_subtotal integer;
  item_discount integer;
  adjustment_total integer;
  payment_total integer;
  refund_total integer;
  sale_total integer;
  balance_total integer;
  sale_status text;
begin
  select
    coalesce(sum(quantity * unit_price_cents), 0),
    coalesce(sum(discount_amount_cents), 0)
  into item_subtotal, item_discount
  from public.sale_items
  where sale_id = target_sale_id;

  select coalesce(sum(amount_cents), 0)
  into adjustment_total
  from public.sale_adjustments
  where sale_id = target_sale_id;

  select coalesce(sum(amount_cents), 0)
  into payment_total
  from public.payments
  where sale_id = target_sale_id
    and status = 'succeeded';

  select coalesce(sum(amount_cents), 0)
  into refund_total
  from public.refunds
  where sale_id = target_sale_id
    and status = 'succeeded';

  sale_total := greatest(item_subtotal - item_discount + adjustment_total, 0);
  balance_total := greatest(sale_total - payment_total + refund_total, 0);

  sale_status := case
    when sale_total = 0 then 'open'
    when refund_total > 0 and refund_total >= payment_total then 'refunded'
    when refund_total > 0 then 'partially_refunded'
    when payment_total <= 0 then 'open'
    when balance_total > 0 then 'partially_paid'
    else 'paid'
  end;

  update public.sales
  set
    subtotal_cents = item_subtotal,
    discount_amount_cents = item_discount,
    adjustment_amount_cents = adjustment_total,
    total_amount_cents = sale_total,
    paid_amount_cents = payment_total,
    refunded_amount_cents = refund_total,
    balance_due_cents = balance_total,
    status = case when status in ('cancelled') then status else sale_status end,
    updated_at = now()
  where id = target_sale_id;
end;
$$;

create or replace function public.sale_item_set_line_total()
returns trigger
language plpgsql
as $$
begin
  new.line_total_cents := greatest((new.quantity * new.unit_price_cents) - new.discount_amount_cents, 0);
  return new;
end;
$$;

create or replace function public.recalculate_sale_from_item()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_sale_financials(coalesce(new.sale_id, old.sale_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.recalculate_sale_from_payment()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_sale_financials(coalesce(new.sale_id, old.sale_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_excess_refund()
returns trigger
language plpgsql
as $$
declare
  payment_total integer;
  other_refunds integer;
begin
  select amount_cents
  into payment_total
  from public.payments
  where id = new.payment_id;

  select coalesce(sum(amount_cents), 0)
  into other_refunds
  from public.refunds
  where payment_id = new.payment_id
    and status = 'succeeded'
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if new.status = 'succeeded' and other_refunds + new.amount_cents > payment_total then
    raise exception 'Refund amount exceeds refundable payment balance';
  end if;

  return new;
end;
$$;

create trigger sale_items_set_line_total before insert or update on public.sale_items for each row execute function public.sale_item_set_line_total();
create trigger sale_items_recalculate_sale after insert or update or delete on public.sale_items for each row execute function public.recalculate_sale_from_item();
create trigger payments_recalculate_sale after insert or update or delete on public.payments for each row execute function public.recalculate_sale_from_payment();
create trigger refunds_prevent_excess before insert or update on public.refunds for each row execute function public.prevent_excess_refund();
create trigger refunds_recalculate_sale after insert or update or delete on public.refunds for each row execute function public.recalculate_sale_from_payment();
create trigger sale_adjustments_recalculate_sale after insert or update or delete on public.sale_adjustments for each row execute function public.recalculate_sale_from_payment();

create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger packages_set_updated_at before update on public.packages for each row execute function public.set_updated_at();
create trigger location_service_settings_set_updated_at before update on public.location_service_settings for each row execute function public.set_updated_at();
create trigger sales_set_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger sale_items_set_updated_at before update on public.sale_items for each row execute function public.set_updated_at();
create trigger payment_method_rules_set_updated_at before update on public.payment_method_rules for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger refunds_set_updated_at before update on public.refunds for each row execute function public.set_updated_at();
create trigger commission_rules_set_updated_at before update on public.commission_rules for each row execute function public.set_updated_at();
create trigger commissions_set_updated_at before update on public.commissions for each row execute function public.set_updated_at();
create trigger royalty_rules_set_updated_at before update on public.royalty_rules for each row execute function public.set_updated_at();
create trigger royalties_set_updated_at before update on public.royalties for each row execute function public.set_updated_at();

alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.location_service_settings enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_discounts enable row level security;
alter table public.sale_adjustments enable row level security;
alter table public.payment_method_rules enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commissions enable row level security;
alter table public.royalty_rules enable row level security;
alter table public.royalties enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_terminal_placeholders enable row level security;

create policy "tenant services read" on public.services for select
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('sales.read') or public.has_permission('services.manage')));
create policy "tenant services manage" on public.services for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('services.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('services.manage'));

create policy "tenant packages read" on public.packages for select
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('sales.read') or public.has_permission('services.manage')));
create policy "tenant packages manage" on public.packages for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('services.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('services.manage'));

create policy "tenant package items read" on public.package_items for select
using (exists (select 1 from public.packages p where p.id = package_id and p.organization_id in (select public.current_organization_ids())));
create policy "tenant package items manage" on public.package_items for all
using (exists (select 1 from public.packages p where p.id = package_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('services.manage')))
with check (exists (select 1 from public.packages p where p.id = package_id and p.organization_id in (select public.current_organization_ids()) and public.has_permission('services.manage')));

create policy "tenant location service settings" on public.location_service_settings for all
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('sales.read') or public.has_permission('services.manage')))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('services.manage'));

create policy "tenant sales access" on public.sales for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('sales.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('sales.write'));

create policy "tenant sale items access" on public.sale_items for all
using (exists (select 1 from public.sales s where s.id = sale_id and s.organization_id in (select public.current_organization_ids()) and public.has_permission('sales.read')))
with check (exists (select 1 from public.sales s where s.id = sale_id and s.organization_id in (select public.current_organization_ids()) and public.has_permission('sales.write')));

create policy "tenant sale discounts access" on public.sale_discounts for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('sales.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('sales.adjust'));

create policy "tenant sale adjustments access" on public.sale_adjustments for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('sales.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('sales.adjust'));

create policy "tenant payment method rules access" on public.payment_method_rules for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.write'));

create policy "tenant payments access" on public.payments for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.write'));

create policy "tenant refunds access" on public.refunds for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.refund'));

create policy "tenant commission rules access" on public.commission_rules for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('commissions.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('commissions.manage'));

create policy "tenant commissions access" on public.commissions for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('commissions.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('commissions.manage'));

create policy "tenant royalty rules access" on public.royalty_rules for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('royalties.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('royalties.manage'));

create policy "tenant royalties access" on public.royalties for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('royalties.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('royalties.manage'));

create policy "tenant stripe customers access" on public.stripe_customers for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.write'));

create policy "tenant stripe webhook events read" on public.stripe_webhook_events for select
using (organization_id is null or organization_id in (select public.current_organization_ids()));

create policy "tenant stripe terminal placeholders" on public.stripe_terminal_placeholders for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('payments.write'));
