insert into public.permissions (key, description)
values
  ('inventory.read', 'Read inventory catalog, lots, and balances'),
  ('inventory.write', 'Create and update inventory catalog and stock records'),
  ('inventory.adjust', 'Record inventory adjustments'),
  ('inventory.waste', 'Record inventory waste'),
  ('inventory.transfer', 'Create and receive inventory transfers'),
  ('inventory.purchase_orders.read', 'Read purchase orders'),
  ('inventory.purchase_orders.create', 'Create and edit purchase orders'),
  ('inventory.purchase_orders.approve', 'Approve purchase orders'),
  ('inventory.receive', 'Receive inventory into stock'),
  ('inventory.vendors.manage', 'Manage inventory vendors'),
  ('inventory.settings.manage', 'Manage inventory settings'),
  ('inventory.cogs.read', 'Read inventory COGS and gross profit'),
  ('inventory.reports.read', 'Read inventory reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'inventory.%'
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'inventory.read',
  'inventory.write',
  'inventory.adjust',
  'inventory.waste',
  'inventory.transfer',
  'inventory.purchase_orders.read',
  'inventory.purchase_orders.create',
  'inventory.receive',
  'inventory.cogs.read',
  'inventory.reports.read'
)
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('inventory.read', 'inventory.write')
where r.name = 'provider'
on conflict do nothing;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  category text not null default 'Other',
  description text,
  unit_of_measure text not null default 'unit',
  default_cost_cents integer check (default_cost_cents is null or default_cost_cents >= 0),
  track_lot boolean not null default true,
  track_expiration boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, sku)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  account_number text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.vendor_items (
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  vendor_sku text,
  last_cost_cents integer check (last_cost_cents is null or last_cost_cents >= 0),
  preferred boolean not null default false,
  minimum_order_qty numeric(12,3) check (minimum_order_qty is null or minimum_order_qty > 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (vendor_id, inventory_item_id)
);

create table public.inventory_location_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  par_level numeric(12,3) check (par_level is null or par_level >= 0),
  reorder_point numeric(12,3) check (reorder_point is null or reorder_point >= 0),
  reorder_quantity numeric(12,3) check (reorder_quantity is null or reorder_quantity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, inventory_item_id)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  po_number text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'ordered', 'partially_received', 'received', 'cancelled', 'closed')),
  order_date date not null default current_date,
  expected_date date,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  created_by uuid references public.user_profiles(id) on delete set null,
  approved_by uuid references public.user_profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, po_number)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  vendor_sku text,
  quantity_ordered numeric(12,3) not null check (quantity_ordered > 0),
  quantity_received numeric(12,3) not null default 0 check (quantity_received >= 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  line_total_cents integer not null default 0 check (line_total_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_order_id, inventory_item_id, vendor_sku)
);

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  vendor_id uuid references public.vendors(id) on delete set null,
  lot_number text,
  expiration_date date,
  received_date date not null default current_date,
  cost_per_unit_cents integer not null check (cost_per_unit_cents >= 0),
  quantity_received numeric(12,3) not null default 0 check (quantity_received >= 0),
  quantity_available numeric(12,3) not null default 0 check (quantity_available >= 0),
  status text not null default 'active' check (status in ('active', 'quarantined', 'exhausted', 'expired', 'recalled', 'archived')),
  source_purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inventory_lots_lot_number_idx
on public.inventory_lots (organization_id, location_id, inventory_item_id, lot_number)
where lot_number is not null;

create unique index inventory_lots_source_po_item_idx
on public.inventory_lots (source_purchase_order_item_id, lot_number)
where source_purchase_order_item_id is not null and lot_number is not null;

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_lot_id uuid references public.inventory_lots(id) on delete set null,
  event_type text not null check (event_type in ('receive', 'use', 'transfer_out', 'transfer_in', 'waste', 'adjustment_increase', 'adjustment_decrease', 'return_to_vendor', 'expire', 'recall', 'opening_balance')),
  quantity numeric(12,3) not null check (quantity <> 0),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  source_type text,
  source_id uuid,
  idempotency_key text,
  reason text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index inventory_events_idempotency_idx
on public.inventory_events (organization_id, idempotency_key)
where idempotency_key is not null;

create table public.treatment_inventory_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  treatment_session_id uuid not null references public.treatment_sessions(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_lot_id uuid references public.inventory_lots(id) on delete set null,
  quantity_used numeric(12,3) not null check (quantity_used > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  total_cost_cents integer not null check (total_cost_cents >= 0),
  recorded_by uuid references public.user_profiles(id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.inventory_service_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  expected_quantity numeric(12,3) not null check (expected_quantity > 0),
  required boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, inventory_item_id)
);

create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id uuid not null references public.locations(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'in_transit', 'received', 'cancelled')),
  transfer_date date not null default current_date,
  received_at timestamptz,
  created_by uuid references public.user_profiles(id) on delete set null,
  received_by uuid references public.user_profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table public.inventory_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inventory_transfers(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_lot_id uuid references public.inventory_lots(id) on delete set null,
  quantity numeric(12,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (transfer_id, inventory_item_id, inventory_lot_id)
);

create table public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  inventory_lot_id uuid references public.inventory_lots(id) on delete cascade,
  alert_type text not null check (alert_type in ('low_stock', 'out_of_stock', 'lot_expiring', 'lot_expired', 'recall', 'quarantine')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (organization_id, location_id, inventory_item_id, inventory_lot_id, alert_type, status)
);

create trigger inventory_items_set_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger vendors_set_updated_at before update on public.vendors for each row execute function public.set_updated_at();
create trigger vendor_items_set_updated_at before update on public.vendor_items for each row execute function public.set_updated_at();
create trigger inventory_location_settings_set_updated_at before update on public.inventory_location_settings for each row execute function public.set_updated_at();
create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();
create trigger purchase_order_items_set_updated_at before update on public.purchase_order_items for each row execute function public.set_updated_at();
create trigger inventory_lots_set_updated_at before update on public.inventory_lots for each row execute function public.set_updated_at();
create trigger inventory_service_requirements_set_updated_at before update on public.inventory_service_requirements for each row execute function public.set_updated_at();
create trigger inventory_transfers_set_updated_at before update on public.inventory_transfers for each row execute function public.set_updated_at();

create index inventory_items_org_idx on public.inventory_items (organization_id, active, category);
create index vendors_org_idx on public.vendors (organization_id, active);
create index vendor_items_item_idx on public.vendor_items (inventory_item_id);
create index inventory_location_settings_location_idx on public.inventory_location_settings (location_id, active);
create index purchase_orders_org_idx on public.purchase_orders (organization_id, status, order_date desc);
create index purchase_orders_location_idx on public.purchase_orders (location_id);
create index purchase_order_items_item_idx on public.purchase_order_items (inventory_item_id);
create index inventory_lots_org_idx on public.inventory_lots (organization_id, status, expiration_date);
create index inventory_lots_location_item_idx on public.inventory_lots (location_id, inventory_item_id, status);
create index inventory_events_org_idx on public.inventory_events (organization_id, created_at desc);
create index inventory_events_lot_idx on public.inventory_events (inventory_lot_id, created_at desc);
create index inventory_events_source_idx on public.inventory_events (source_type, source_id);
create index treatment_inventory_usage_session_idx on public.treatment_inventory_usage (treatment_session_id);
create index treatment_inventory_usage_item_idx on public.treatment_inventory_usage (inventory_item_id);
create index inventory_service_requirements_service_idx on public.inventory_service_requirements (service_id);
create index inventory_transfers_org_idx on public.inventory_transfers (organization_id, status, transfer_date desc);
create index inventory_transfer_items_transfer_idx on public.inventory_transfer_items (transfer_id);
create index inventory_alerts_org_status_idx on public.inventory_alerts (organization_id, status, alert_type);

create or replace function public.recalculate_inventory_balance(target_lot_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  balance numeric(12,3);
begin
  select coalesce(sum(quantity), 0)
  into balance
  from public.inventory_events
  where inventory_lot_id = target_lot_id;

  update public.inventory_lots
  set
    quantity_available = greatest(balance, 0),
    status = case
      when status in ('quarantined', 'recalled', 'archived') then status
      when expiration_date is not null and expiration_date < current_date then 'expired'
      when balance <= 0 then 'exhausted'
      else 'active'
    end
  where id = target_lot_id;

  return balance;
end;
$$;

create or replace function public.receive_purchase_order_item(
  target_purchase_order_item_id uuid,
  received_quantity numeric,
  received_lot_number text,
  received_expiration_date date,
  received_date date,
  idempotency_key text,
  actor_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row record;
  po_row record;
  lot_id uuid;
  event_id uuid;
  total_received numeric(12,3);
begin
  if received_quantity <= 0 then
    raise exception 'Received quantity must be positive';
  end if;

  select poi.*, ii.track_lot, ii.track_expiration
  into item_row
  from public.purchase_order_items poi
  join public.inventory_items ii on ii.id = poi.inventory_item_id
  where poi.id = target_purchase_order_item_id;

  if item_row.id is null then
    raise exception 'Purchase order item was not found';
  end if;

  select * into po_row from public.purchase_orders where id = item_row.purchase_order_id;

  if idempotency_key is not null then
    select inventory_lot_id
    into lot_id
    from public.inventory_events
    where organization_id = po_row.organization_id
      and inventory_events.idempotency_key = receive_purchase_order_item.idempotency_key
    limit 1;

    if lot_id is not null then
      return lot_id;
    end if;
  end if;

  if po_row.status in ('cancelled', 'closed', 'received') and item_row.quantity_received >= item_row.quantity_ordered then
    return null;
  end if;

  if item_row.quantity_received + received_quantity > item_row.quantity_ordered then
    raise exception 'Cannot receive more than ordered quantity';
  end if;

  if item_row.track_lot and nullif(trim(received_lot_number), '') is null then
    raise exception 'Lot number is required for this item';
  end if;

  if item_row.track_expiration and received_expiration_date is null then
    raise exception 'Expiration date is required for this item';
  end if;

  insert into public.inventory_lots (
    organization_id, location_id, inventory_item_id, vendor_id, lot_number, expiration_date, received_date,
    cost_per_unit_cents, quantity_received, quantity_available, status, source_purchase_order_item_id
  )
  values (
    po_row.organization_id, po_row.location_id, item_row.inventory_item_id, po_row.vendor_id, nullif(trim(received_lot_number), ''),
    received_expiration_date, coalesce(received_date, current_date), item_row.unit_cost_cents, received_quantity, 0, 'active', item_row.id
  )
  on conflict (source_purchase_order_item_id, lot_number) where source_purchase_order_item_id is not null and lot_number is not null
  do update set quantity_received = public.inventory_lots.quantity_received + excluded.quantity_received, updated_at = now()
  returning id into lot_id;

  insert into public.inventory_events (
    organization_id, location_id, inventory_item_id, inventory_lot_id, event_type, quantity, unit_cost_cents,
    source_type, source_id, idempotency_key, reason, created_by
  )
  values (
    po_row.organization_id, po_row.location_id, item_row.inventory_item_id, lot_id, 'receive', received_quantity, item_row.unit_cost_cents,
    'purchase_order_item', item_row.id, idempotency_key, 'PO receiving', actor_user_id
  )
  on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into event_id;

  if event_id is null then
    return lot_id;
  end if;

  perform public.recalculate_inventory_balance(lot_id);

  update public.purchase_order_items
  set quantity_received = quantity_received + received_quantity
  where id = item_row.id;

  select coalesce(sum(quantity_received), 0) into total_received
  from public.purchase_order_items
  where purchase_order_id = po_row.id;

  update public.purchase_orders
  set status = case
      when total_received <= 0 then status
      when not exists (select 1 from public.purchase_order_items where purchase_order_id = po_row.id and quantity_received < quantity_ordered) then 'received'
      else 'partially_received'
    end
  where id = po_row.id;

  return lot_id;
end;
$$;

create or replace function public.receive_inventory_stock(
  target_organization_id uuid,
  target_location_id uuid,
  target_inventory_item_id uuid,
  target_vendor_id uuid,
  received_quantity numeric,
  received_lot_number text,
  received_expiration_date date,
  received_date date,
  unit_cost_cents integer,
  receive_reason text,
  idempotency_key text,
  actor_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row record;
  lot_id uuid;
  event_id uuid;
begin
  if received_quantity <= 0 then raise exception 'Received quantity must be positive'; end if;
  if unit_cost_cents < 0 then raise exception 'Unit cost must be non-negative'; end if;

  select * into item_row
  from public.inventory_items
  where id = target_inventory_item_id
    and organization_id = target_organization_id;

  if item_row.id is null then raise exception 'Inventory item was not found'; end if;
  if item_row.track_lot and nullif(trim(received_lot_number), '') is null then raise exception 'Lot number is required for this item'; end if;
  if item_row.track_expiration and received_expiration_date is null then raise exception 'Expiration date is required for this item'; end if;

  if idempotency_key is not null then
    select inventory_lot_id
    into lot_id
    from public.inventory_events
    where organization_id = target_organization_id
      and inventory_events.idempotency_key = receive_inventory_stock.idempotency_key
    limit 1;

    if lot_id is not null then return lot_id; end if;
  end if;

  insert into public.inventory_lots (
    organization_id, location_id, inventory_item_id, vendor_id, lot_number, expiration_date, received_date,
    cost_per_unit_cents, quantity_received, quantity_available, status
  )
  values (
    target_organization_id, target_location_id, target_inventory_item_id, target_vendor_id, nullif(trim(received_lot_number), ''),
    received_expiration_date, coalesce(received_date, current_date), unit_cost_cents, received_quantity, 0, 'active'
  )
  on conflict (organization_id, location_id, inventory_item_id, lot_number) where lot_number is not null
  do update set quantity_received = public.inventory_lots.quantity_received + excluded.quantity_received, updated_at = now()
  returning id into lot_id;

  insert into public.inventory_events (
    organization_id, location_id, inventory_item_id, inventory_lot_id, event_type, quantity, unit_cost_cents,
    source_type, source_id, idempotency_key, reason, created_by
  )
  values (
    target_organization_id, target_location_id, target_inventory_item_id, lot_id, 'receive', received_quantity, unit_cost_cents,
    'direct_receive', lot_id, idempotency_key, coalesce(receive_reason, 'Direct stock receiving'), actor_user_id
  )
  on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into event_id;

  if event_id is null then return lot_id; end if;

  perform public.recalculate_inventory_balance(lot_id);
  return lot_id;
end;
$$;

create or replace function public.record_inventory_adjustment(
  target_lot_id uuid,
  adjustment_quantity numeric,
  adjustment_type text,
  adjustment_reason text,
  idempotency_key text,
  actor_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lot_row record;
  event_id uuid;
  signed_quantity numeric(12,3);
begin
  select * into lot_row from public.inventory_lots where id = target_lot_id;
  if lot_row.id is null then raise exception 'Lot was not found'; end if;
  if adjustment_quantity <= 0 then raise exception 'Adjustment quantity must be positive'; end if;

  signed_quantity := case
    when adjustment_type in ('adjustment_decrease', 'waste', 'return_to_vendor', 'expire', 'recall') then -adjustment_quantity
    else adjustment_quantity
  end;

  if lot_row.quantity_available + signed_quantity < 0 then
    raise exception 'Inventory cannot go below zero';
  end if;

  insert into public.inventory_events (organization_id, location_id, inventory_item_id, inventory_lot_id, event_type, quantity, unit_cost_cents, source_type, source_id, idempotency_key, reason, created_by)
  values (lot_row.organization_id, lot_row.location_id, lot_row.inventory_item_id, lot_row.id, adjustment_type, signed_quantity, lot_row.cost_per_unit_cents, 'inventory_lot', lot_row.id, idempotency_key, adjustment_reason, actor_user_id)
  on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into event_id;

  perform public.recalculate_inventory_balance(lot_row.id);
  return event_id;
end;
$$;

create or replace function public.record_treatment_inventory_usage(
  target_treatment_session_id uuid,
  target_lot_id uuid,
  used_quantity numeric,
  idempotency_key text,
  actor_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row record;
  lot_row record;
  usage_id uuid;
begin
  if used_quantity <= 0 then raise exception 'Usage quantity must be positive'; end if;

  select * into session_row from public.treatment_sessions where id = target_treatment_session_id;
  if session_row.id is null then raise exception 'Treatment session was not found'; end if;

  select * into lot_row from public.inventory_lots where id = target_lot_id;
  if lot_row.id is null then raise exception 'Inventory lot was not found'; end if;
  if lot_row.status <> 'active' then raise exception 'Inventory lot is not active'; end if;
  if lot_row.expiration_date is not null and lot_row.expiration_date < current_date then raise exception 'Expired inventory cannot be used'; end if;
  if lot_row.quantity_available < used_quantity then raise exception 'Insufficient inventory available'; end if;

  insert into public.treatment_inventory_usage (
    organization_id, location_id, treatment_session_id, inventory_item_id, inventory_lot_id, quantity_used, unit_cost_cents, total_cost_cents, recorded_by, idempotency_key
  )
  values (
    session_row.organization_id, session_row.location_id, session_row.id, lot_row.inventory_item_id, lot_row.id, used_quantity, lot_row.cost_per_unit_cents,
    round(used_quantity * lot_row.cost_per_unit_cents)::integer, actor_user_id, idempotency_key
  )
  on conflict (organization_id, idempotency_key) do update
  set quantity_used = public.treatment_inventory_usage.quantity_used
  returning id into usage_id;

  insert into public.inventory_events (organization_id, location_id, inventory_item_id, inventory_lot_id, event_type, quantity, unit_cost_cents, source_type, source_id, idempotency_key, reason, created_by)
  values (session_row.organization_id, session_row.location_id, lot_row.inventory_item_id, lot_row.id, 'use', -used_quantity, lot_row.cost_per_unit_cents, 'treatment_inventory_usage', usage_id, 'usage-' || idempotency_key, 'Treatment inventory usage', actor_user_id)
  on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing;

  perform public.recalculate_inventory_balance(lot_row.id);
  return usage_id;
end;
$$;

create or replace function public.ship_inventory_transfer(target_transfer_id uuid, idempotency_key text, actor_user_id uuid default auth.uid())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_row record;
  item_row record;
begin
  select * into transfer_row from public.inventory_transfers where id = target_transfer_id;
  if transfer_row.id is null then raise exception 'Transfer was not found'; end if;
  if transfer_row.status <> 'draft' then return transfer_row.id; end if;

  for item_row in select iti.*, il.quantity_available, il.cost_per_unit_cents from public.inventory_transfer_items iti join public.inventory_lots il on il.id = iti.inventory_lot_id where iti.transfer_id = target_transfer_id loop
    if item_row.quantity_available < item_row.quantity then raise exception 'Insufficient inventory for transfer'; end if;
    insert into public.inventory_events (organization_id, location_id, inventory_item_id, inventory_lot_id, event_type, quantity, unit_cost_cents, source_type, source_id, idempotency_key, reason, created_by)
    values (transfer_row.organization_id, transfer_row.from_location_id, item_row.inventory_item_id, item_row.inventory_lot_id, 'transfer_out', -item_row.quantity, item_row.cost_per_unit_cents, 'inventory_transfer', target_transfer_id, idempotency_key || '-out-' || item_row.id::text, 'Transfer shipped', actor_user_id)
    on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing;
    perform public.recalculate_inventory_balance(item_row.inventory_lot_id);
  end loop;

  update public.inventory_transfers set status = 'in_transit', transfer_date = current_date where id = target_transfer_id;
  return target_transfer_id;
end;
$$;

create or replace function public.receive_inventory_transfer(target_transfer_id uuid, idempotency_key text, actor_user_id uuid default auth.uid())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_row record;
  item_row record;
  source_lot record;
  destination_lot_id uuid;
begin
  select * into transfer_row from public.inventory_transfers where id = target_transfer_id;
  if transfer_row.id is null then raise exception 'Transfer was not found'; end if;
  if transfer_row.status = 'received' then return target_transfer_id; end if;
  if transfer_row.status <> 'in_transit' then raise exception 'Transfer must be in transit before receipt'; end if;

  for item_row in select * from public.inventory_transfer_items where transfer_id = target_transfer_id loop
    select * into source_lot from public.inventory_lots where id = item_row.inventory_lot_id;
    insert into public.inventory_lots (organization_id, location_id, inventory_item_id, vendor_id, lot_number, expiration_date, received_date, cost_per_unit_cents, quantity_received, quantity_available, status)
    values (transfer_row.organization_id, transfer_row.to_location_id, source_lot.inventory_item_id, source_lot.vendor_id, source_lot.lot_number, source_lot.expiration_date, current_date, source_lot.cost_per_unit_cents, item_row.quantity, 0, 'active')
    on conflict (organization_id, location_id, inventory_item_id, lot_number) where lot_number is not null
    do update set quantity_received = public.inventory_lots.quantity_received + excluded.quantity_received, updated_at = now()
    returning id into destination_lot_id;

    insert into public.inventory_events (organization_id, location_id, inventory_item_id, inventory_lot_id, event_type, quantity, unit_cost_cents, source_type, source_id, idempotency_key, reason, created_by)
    values (transfer_row.organization_id, transfer_row.to_location_id, item_row.inventory_item_id, destination_lot_id, 'transfer_in', item_row.quantity, source_lot.cost_per_unit_cents, 'inventory_transfer', target_transfer_id, idempotency_key || '-in-' || item_row.id::text, 'Transfer received', actor_user_id)
    on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing;
    perform public.recalculate_inventory_balance(destination_lot_id);
  end loop;

  update public.inventory_transfers set status = 'received', received_at = now(), received_by = actor_user_id where id = target_transfer_id;
  return target_transfer_id;
end;
$$;

alter table public.inventory_items enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_items enable row level security;
alter table public.inventory_location_settings enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_events enable row level security;
alter table public.treatment_inventory_usage enable row level security;
alter table public.inventory_service_requirements enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_transfer_items enable row level security;
alter table public.inventory_alerts enable row level security;

create policy "tenant inventory items read" on public.inventory_items for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read'));
create policy "tenant inventory items write" on public.inventory_items for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.write')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.write'));
create policy "tenant vendors read" on public.vendors for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read'));
create policy "tenant vendors manage" on public.vendors for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.vendors.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.vendors.manage'));
create policy "tenant vendor items access" on public.vendor_items for all using (exists (select 1 from public.vendors v where v.id = vendor_id and v.organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read'))) with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.vendors.manage')));
create policy "tenant inventory location settings read" on public.inventory_location_settings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read'));
create policy "tenant inventory location settings manage" on public.inventory_location_settings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.settings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.settings.manage'));
create policy "tenant purchase orders read" on public.purchase_orders for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.purchase_orders.read') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = purchase_orders.location_id));
create policy "tenant purchase orders create" on public.purchase_orders for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.purchase_orders.create') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = purchase_orders.location_id));
create policy "tenant purchase orders update" on public.purchase_orders for update using (organization_id in (select public.current_organization_ids()) and (public.has_permission('inventory.purchase_orders.create') or public.has_permission('inventory.purchase_orders.approve')) and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = purchase_orders.location_id)) with check (organization_id in (select public.current_organization_ids()) and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = purchase_orders.location_id));
create policy "tenant purchase order items access" on public.purchase_order_items for all using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and po.organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.purchase_orders.read'))) with check (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and po.organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.purchase_orders.create')));
create policy "tenant inventory lots read" on public.inventory_lots for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = inventory_lots.location_id));
create policy "tenant inventory lots write" on public.inventory_lots for all using (organization_id in (select public.current_organization_ids()) and (public.has_permission('inventory.receive') or public.has_permission('inventory.adjust')) and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = inventory_lots.location_id)) with check (organization_id in (select public.current_organization_ids()) and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = inventory_lots.location_id));
create policy "tenant inventory events read" on public.inventory_events for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = inventory_events.location_id));
create policy "tenant inventory events insert" on public.inventory_events for insert with check (false);
create policy "tenant treatment inventory usage read" on public.treatment_inventory_usage for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('inventory.read') or public.has_permission('inventory.cogs.read')) and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_inventory_usage.location_id));
create policy "tenant treatment inventory usage insert" on public.treatment_inventory_usage for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.write') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_inventory_usage.location_id));
create policy "tenant inventory service requirements access" on public.inventory_service_requirements for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.settings.manage'));
create policy "tenant inventory transfers read" on public.inventory_transfers for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.transfer') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id in (inventory_transfers.from_location_id, inventory_transfers.to_location_id)));
create policy "tenant inventory transfers manage" on public.inventory_transfers for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.transfer') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id in (inventory_transfers.from_location_id, inventory_transfers.to_location_id))) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.transfer'));
create policy "tenant inventory transfer items access" on public.inventory_transfer_items for all using (exists (select 1 from public.inventory_transfers it where it.id = transfer_id and it.organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.transfer'))) with check (exists (select 1 from public.inventory_transfers it where it.id = transfer_id and it.organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.transfer')));
create policy "tenant inventory alerts read" on public.inventory_alerts for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = inventory_alerts.location_id)));
create policy "tenant inventory alerts manage" on public.inventory_alerts for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.write')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('inventory.write'));

revoke all on function public.recalculate_inventory_balance(uuid) from public;
revoke all on function public.receive_purchase_order_item(uuid, numeric, text, date, date, text, uuid) from public;
revoke all on function public.receive_inventory_stock(uuid, uuid, uuid, uuid, numeric, text, date, date, integer, text, text, uuid) from public;
revoke all on function public.record_inventory_adjustment(uuid, numeric, text, text, text, uuid) from public;
revoke all on function public.record_treatment_inventory_usage(uuid, uuid, numeric, text, uuid) from public;
revoke all on function public.ship_inventory_transfer(uuid, text, uuid) from public;
revoke all on function public.receive_inventory_transfer(uuid, text, uuid) from public;
grant execute on function public.recalculate_inventory_balance(uuid) to authenticated;
grant execute on function public.receive_purchase_order_item(uuid, numeric, text, date, date, text, uuid) to authenticated;
grant execute on function public.receive_inventory_stock(uuid, uuid, uuid, uuid, numeric, text, date, date, integer, text, text, uuid) to authenticated;
grant execute on function public.record_inventory_adjustment(uuid, numeric, text, text, text, uuid) to authenticated;
grant execute on function public.record_treatment_inventory_usage(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.ship_inventory_transfer(uuid, text, uuid) to authenticated;
grant execute on function public.receive_inventory_transfer(uuid, text, uuid) to authenticated;
