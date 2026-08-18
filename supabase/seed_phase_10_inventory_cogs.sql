-- Phase 10 development seed. All inventory, lot, vendor, and COGS records are fictional/demo data.

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  limit 1
),
item_seed (id, name, sku, category, description, unit_of_measure, default_cost_cents, track_lot, track_expiration) as (
  values
    ('10000000-0000-4000-8000-000000010001'::uuid, 'Hair Restoration Biologic Vial', 'INV-HR-BIO-VIAL', 'Biologic', 'Fictional demo biologic vial for hair restoration.', 'vial', 35000, true, true),
    ('10000000-0000-4000-8000-000000010002'::uuid, 'Sterile Syringe', 'INV-SYR-STERILE', 'Consumable', 'Fictional sterile syringe.', 'syringe', 250, false, false),
    ('10000000-0000-4000-8000-000000010003'::uuid, 'Needle Pack', 'INV-NEEDLE-PACK', 'Consumable', 'Fictional sterile needle pack.', 'pack', 500, false, false),
    ('10000000-0000-4000-8000-000000010004'::uuid, 'T-Shape Conductive Consumable', 'INV-TSHAPE-CONS', 'Device Consumable', 'Fictional T-Shape treatment consumable.', 'piece', 8500, true, false),
    ('10000000-0000-4000-8000-000000010005'::uuid, 'NeoGen Treatment Consumable', 'INV-NEOGEN-CONS', 'Device Consumable', 'Fictional NeoGen consumable.', 'cartridge', 12000, true, true),
    ('10000000-0000-4000-8000-000000010006'::uuid, 'Botox Demo Vial', 'INV-BOTOX-DEMO', 'Injectable', 'Fictional injectable vial for development testing.', 'vial', 62000, true, true),
    ('10000000-0000-4000-8000-000000010007'::uuid, 'Dermal Filler Demo Syringe', 'INV-FILLER-DEMO', 'Injectable', 'Fictional filler syringe for development testing.', 'syringe', 98000, true, true),
    ('10000000-0000-4000-8000-000000010008'::uuid, 'IV Saline Bag', 'INV-IV-SALINE', 'IV Supply', 'Fictional IV saline bag.', 'bag', 1400, true, true),
    ('10000000-0000-4000-8000-000000010009'::uuid, 'Skincare Retail Product', 'INV-SKINCARE-DEMO', 'Retail Product', 'Fictional retail skincare product.', 'bottle', 2200, false, false)
)
insert into public.inventory_items (id, organization_id, name, sku, category, description, unit_of_measure, default_cost_cents, track_lot, track_expiration, active)
select item_seed.id, org.id, item_seed.name, item_seed.sku, item_seed.category, item_seed.description, item_seed.unit_of_measure, item_seed.default_cost_cents, item_seed.track_lot, item_seed.track_expiration, true
from org
join item_seed on true
on conflict (organization_id, name) do update
set
  sku = excluded.sku,
  category = excluded.category,
  description = excluded.description,
  unit_of_measure = excluded.unit_of_measure,
  default_cost_cents = excluded.default_cost_cents,
  track_lot = excluded.track_lot,
  track_expiration = excluded.track_expiration,
  active = true,
  updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
vendor_seed (id, name, contact_name, email, phone, website, account_number, notes) as (
  values
    ('10000000-0000-4000-8000-000000010101'::uuid, 'Demo BioSupply Partners', 'Avery Demo', 'orders@biosupply-demo.example', '(305) 555-0201', 'https://biosupply-demo.example', 'DEMO-BIO-001', 'Fictional vendor for demo biologics.'),
    ('10000000-0000-4000-8000-000000010102'::uuid, 'Fictional Clinical Consumables Co.', 'Jordan Demo', 'support@clinical-consumables.example', '(813) 555-0202', 'https://clinical-consumables.example', 'DEMO-CONS-002', 'Fictional vendor for demo supplies.'),
    ('10000000-0000-4000-8000-000000010103'::uuid, 'Avora Demo Retail Supply', 'Taylor Demo', 'retail@avora-supply.example', '(904) 555-0203', 'https://retail-supply.example', 'DEMO-RET-003', 'Fictional vendor for retail products.')
)
insert into public.vendors (id, organization_id, name, contact_name, email, phone, website, account_number, notes, active)
select vendor_seed.id, org.id, vendor_seed.name, vendor_seed.contact_name, vendor_seed.email, vendor_seed.phone, vendor_seed.website, vendor_seed.account_number, vendor_seed.notes, true
from org
join vendor_seed on true
on conflict (organization_id, name) do update
set contact_name = excluded.contact_name, email = excluded.email, phone = excluded.phone, website = excluded.website, account_number = excluded.account_number, notes = excluded.notes, active = true, updated_at = now();

insert into public.vendor_items (vendor_id, inventory_item_id, vendor_sku, last_cost_cents, preferred, minimum_order_qty, lead_time_days)
values
  ('10000000-0000-4000-8000-000000010101', '10000000-0000-4000-8000-000000010001', 'DEMO-HR-VIAL', 35000, true, 5, 7),
  ('10000000-0000-4000-8000-000000010102', '10000000-0000-4000-8000-000000010002', 'DEMO-SYR', 250, true, 50, 3),
  ('10000000-0000-4000-8000-000000010102', '10000000-0000-4000-8000-000000010003', 'DEMO-NDL', 500, true, 50, 3),
  ('10000000-0000-4000-8000-000000010101', '10000000-0000-4000-8000-000000010006', 'DEMO-BTX', 62000, true, 2, 10),
  ('10000000-0000-4000-8000-000000010103', '10000000-0000-4000-8000-000000010009', 'DEMO-RET', 2200, true, 12, 5)
on conflict (vendor_id, inventory_item_id) do update
set vendor_sku = excluded.vendor_sku, last_cost_cents = excluded.last_cost_cents, preferred = excluded.preferred, minimum_order_qty = excluded.minimum_order_qty, lead_time_days = excluded.lead_time_days, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
settings_seed (location_slug, item_id, par_level, reorder_point, reorder_quantity) as (
  values
    ('miami', '10000000-0000-4000-8000-000000010001'::uuid, 10, 5, 8),
    ('miami', '10000000-0000-4000-8000-000000010002'::uuid, 100, 25, 75),
    ('miami', '10000000-0000-4000-8000-000000010006'::uuid, 4, 1, 3),
    ('tampa', '10000000-0000-4000-8000-000000010004'::uuid, 12, 4, 8),
    ('jacksonville', '10000000-0000-4000-8000-000000010005'::uuid, 8, 3, 5)
)
insert into public.inventory_location_settings (organization_id, location_id, inventory_item_id, par_level, reorder_point, reorder_quantity, active)
select org.id, locations.id, settings_seed.item_id, settings_seed.par_level, settings_seed.reorder_point, settings_seed.reorder_quantity, true
from org
join settings_seed on true
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = settings_seed.location_slug
on conflict (location_id, inventory_item_id) do update
set par_level = excluded.par_level, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, active = true, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (
  select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1
),
po_seed (id, location_slug, vendor_id, po_number, status, order_date, expected_date, subtotal_cents, shipping_cents, tax_cents, notes) as (
  values
    ('10000000-0000-4000-8000-000000010401'::uuid, 'miami', '10000000-0000-4000-8000-000000010101'::uuid, 'MIA-2026-0010', 'received', current_date - 20, current_date - 14, 350000, 2500, 0, 'Fictional received biologic PO.'),
    ('10000000-0000-4000-8000-000000010402'::uuid, 'tampa', '10000000-0000-4000-8000-000000010102'::uuid, 'TPA-2026-0007', 'partially_received', current_date - 8, current_date + 3, 102000, 1800, 0, 'Fictional partially received consumables PO.'),
    ('10000000-0000-4000-8000-000000010403'::uuid, 'jacksonville', '10000000-0000-4000-8000-000000010101'::uuid, 'JAX-2026-0004', 'ordered', current_date - 2, current_date + 9, 96000, 1200, 0, 'Fictional open NeoGen PO.')
)
insert into public.purchase_orders (id, organization_id, location_id, vendor_id, po_number, status, order_date, expected_date, subtotal_cents, shipping_cents, tax_cents, total_cents, notes, created_by, approved_by, approved_at)
select po_seed.id, org.id, locations.id, po_seed.vendor_id, po_seed.po_number, po_seed.status, po_seed.order_date, po_seed.expected_date, po_seed.subtotal_cents, po_seed.shipping_cents, po_seed.tax_cents, po_seed.subtotal_cents + po_seed.shipping_cents + po_seed.tax_cents, po_seed.notes, owner_user.id, owner_user.id, po_seed.order_date + interval '1 hour'
from org
join po_seed on true
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = po_seed.location_slug
left join owner_user on true
on conflict (organization_id, po_number) do update
set status = excluded.status, expected_date = excluded.expected_date, subtotal_cents = excluded.subtotal_cents, shipping_cents = excluded.shipping_cents, tax_cents = excluded.tax_cents, total_cents = excluded.total_cents, notes = excluded.notes, updated_at = now();

insert into public.purchase_order_items (id, purchase_order_id, inventory_item_id, vendor_sku, quantity_ordered, quantity_received, unit_cost_cents, line_total_cents, notes)
values
  ('10000000-0000-4000-8000-000000010411', '10000000-0000-4000-8000-000000010401', '10000000-0000-4000-8000-000000010001', 'DEMO-HR-VIAL', 10, 10, 35000, 350000, 'Fictional biologic vials.'),
  ('10000000-0000-4000-8000-000000010412', '10000000-0000-4000-8000-000000010402', '10000000-0000-4000-8000-000000010004', 'DEMO-TSHAPE-CONS', 12, 6, 8500, 102000, 'Fictional T-Shape consumables.'),
  ('10000000-0000-4000-8000-000000010413', '10000000-0000-4000-8000-000000010403', '10000000-0000-4000-8000-000000010005', 'DEMO-NEOGEN-CONS', 8, 0, 12000, 96000, 'Fictional NeoGen cartridges.')
on conflict (purchase_order_id, inventory_item_id, vendor_sku) do update
set quantity_ordered = excluded.quantity_ordered, quantity_received = excluded.quantity_received, unit_cost_cents = excluded.unit_cost_cents, line_total_cents = excluded.line_total_cents, notes = excluded.notes, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
lot_seed (id, location_slug, item_id, vendor_id, lot_number, expiration_date, received_date, cost_per_unit_cents, quantity_received, quantity_available, status, po_item_id) as (
  values
    ('10000000-0000-4000-8000-000000010201'::uuid, 'miami', '10000000-0000-4000-8000-000000010001'::uuid, '10000000-0000-4000-8000-000000010101'::uuid, 'DEMO-HR-LOT-2026A', current_date + 75, current_date - 14, 35000, 10, 8, 'active', '10000000-0000-4000-8000-000000010411'::uuid),
    ('10000000-0000-4000-8000-000000010202'::uuid, 'miami', '10000000-0000-4000-8000-000000010002'::uuid, '10000000-0000-4000-8000-000000010102'::uuid, 'DEMO-SYR-OPEN', null, current_date - 30, 250, 120, 119, 'active', null),
    ('10000000-0000-4000-8000-000000010203'::uuid, 'tampa', '10000000-0000-4000-8000-000000010004'::uuid, '10000000-0000-4000-8000-000000010102'::uuid, 'DEMO-TSHAPE-LOT-1', current_date + 45, current_date - 5, 8500, 6, 6, 'active', '10000000-0000-4000-8000-000000010412'::uuid),
    ('10000000-0000-4000-8000-000000010204'::uuid, 'jacksonville', '10000000-0000-4000-8000-000000010006'::uuid, '10000000-0000-4000-8000-000000010101'::uuid, 'DEMO-BTX-EXPIRING', current_date + 25, current_date - 35, 62000, 2, 2, 'active', null),
    ('10000000-0000-4000-8000-000000010205'::uuid, 'miami', '10000000-0000-4000-8000-000000010009'::uuid, '10000000-0000-4000-8000-000000010103'::uuid, 'DEMO-RETAIL-OPEN', null, current_date - 18, 2200, 24, 24, 'active', null),
    ('10000000-0000-4000-8000-000000010206'::uuid, 'tampa', '10000000-0000-4000-8000-000000010001'::uuid, '10000000-0000-4000-8000-000000010101'::uuid, 'DEMO-HR-LOT-2026A', current_date + 75, current_date - 1, 35000, 1, 1, 'active', null)
)
insert into public.inventory_lots (id, organization_id, location_id, inventory_item_id, vendor_id, lot_number, expiration_date, received_date, cost_per_unit_cents, quantity_received, quantity_available, status, source_purchase_order_item_id)
select lot_seed.id, org.id, locations.id, lot_seed.item_id, lot_seed.vendor_id, lot_seed.lot_number, lot_seed.expiration_date, lot_seed.received_date, lot_seed.cost_per_unit_cents, lot_seed.quantity_received, lot_seed.quantity_available, lot_seed.status, lot_seed.po_item_id
from org
join lot_seed on true
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = lot_seed.location_slug
on conflict (organization_id, location_id, inventory_item_id, lot_number) where lot_number is not null do update
set expiration_date = excluded.expiration_date, received_date = excluded.received_date, cost_per_unit_cents = excluded.cost_per_unit_cents, quantity_received = excluded.quantity_received, quantity_available = excluded.quantity_available, status = excluded.status, updated_at = now();

with owner_user as (
  select up.id
  from public.user_profiles up
  join public.organizations o on o.id = up.organization_id
  where lower(trim(o.slug)) = 'avora' and lower(trim(up.email)) = 'owner@avora-demo.com'
  limit 1
),
event_seed (id, lot_id, event_type, quantity, source_type, source_id, idempotency_key, reason) as (
  values
    ('10000000-0000-4000-8000-000000010301'::uuid, '10000000-0000-4000-8000-000000010201'::uuid, 'receive', 10, 'purchase_order_item', '10000000-0000-4000-8000-000000010411'::uuid, 'phase10-receive-hr-lot', 'Fictional PO receipt.'),
    ('10000000-0000-4000-8000-000000010302'::uuid, '10000000-0000-4000-8000-000000010202'::uuid, 'opening_balance', 120, 'seed', null, 'phase10-opening-syringe', 'Fictional opening balance.'),
    ('10000000-0000-4000-8000-000000010303'::uuid, '10000000-0000-4000-8000-000000010203'::uuid, 'receive', 6, 'purchase_order_item', '10000000-0000-4000-8000-000000010412'::uuid, 'phase10-receive-tshape-partial', 'Fictional partial PO receipt.'),
    ('10000000-0000-4000-8000-000000010304'::uuid, '10000000-0000-4000-8000-000000010204'::uuid, 'opening_balance', 2, 'seed', null, 'phase10-opening-botox', 'Fictional opening balance.'),
    ('10000000-0000-4000-8000-000000010305'::uuid, '10000000-0000-4000-8000-000000010205'::uuid, 'opening_balance', 24, 'seed', null, 'phase10-opening-retail', 'Fictional opening balance.'),
    ('10000000-0000-4000-8000-000000010306'::uuid, '10000000-0000-4000-8000-000000010201'::uuid, 'use', -1, 'treatment_inventory_usage', '10000000-0000-4000-8000-000000010501'::uuid, 'phase10-use-isabella-hair-vial', 'Fictional treatment usage.'),
    ('10000000-0000-4000-8000-000000010307'::uuid, '10000000-0000-4000-8000-000000010202'::uuid, 'waste', -1, 'inventory_lot', '10000000-0000-4000-8000-000000010202'::uuid, 'phase10-waste-syringe', 'Fictional damaged sterile packaging.'),
    ('10000000-0000-4000-8000-000000010308'::uuid, '10000000-0000-4000-8000-000000010201'::uuid, 'transfer_out', -1, 'inventory_transfer', '10000000-0000-4000-8000-000000010601'::uuid, 'phase10-transfer-out-hr-vial', 'Fictional Miami to Tampa transfer.'),
    ('10000000-0000-4000-8000-000000010309'::uuid, '10000000-0000-4000-8000-000000010206'::uuid, 'transfer_in', 1, 'inventory_transfer', '10000000-0000-4000-8000-000000010601'::uuid, 'phase10-transfer-in-hr-vial', 'Fictional Miami to Tampa transfer receipt.')
)
insert into public.inventory_events (id, organization_id, location_id, inventory_item_id, inventory_lot_id, event_type, quantity, unit_cost_cents, source_type, source_id, idempotency_key, reason, created_by)
select event_seed.id, lots.organization_id, lots.location_id, lots.inventory_item_id, lots.id, event_seed.event_type, event_seed.quantity, lots.cost_per_unit_cents, event_seed.source_type, event_seed.source_id, event_seed.idempotency_key, event_seed.reason, owner_user.id
from event_seed
join public.inventory_lots lots on lots.id = event_seed.lot_id
left join owner_user on true
on conflict (organization_id, idempotency_key) where idempotency_key is not null do update
set reason = excluded.reason;

insert into public.treatment_inventory_usage (id, organization_id, location_id, treatment_session_id, inventory_item_id, inventory_lot_id, quantity_used, unit_cost_cents, total_cost_cents, recorded_by, idempotency_key)
select '10000000-0000-4000-8000-000000010501'::uuid, ts.organization_id, ts.location_id, ts.id, lots.inventory_item_id, lots.id, 1, lots.cost_per_unit_cents, lots.cost_per_unit_cents, ts.provider_id, 'phase10-use-isabella-hair-vial'
from public.treatment_sessions ts
join public.inventory_lots lots on lots.id = '10000000-0000-4000-8000-000000010201'
where ts.id = '10000000-0000-4000-8000-000000007301'
on conflict (organization_id, idempotency_key) do update
set quantity_used = excluded.quantity_used, total_cost_cents = excluded.total_cost_cents;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1)
insert into public.inventory_service_requirements (id, organization_id, service_id, inventory_item_id, expected_quantity, required, notes)
select requirements.id, org.id, services.id, requirements.item_id, requirements.expected_quantity, requirements.required, requirements.notes
from org
join (
  values
    ('10000000-0000-4000-8000-000000010701'::uuid, 'Hair Restoration Treatment', '10000000-0000-4000-8000-000000010001'::uuid, 1, true, 'Expected fictional biologic vial per treatment.'),
    ('10000000-0000-4000-8000-000000010702'::uuid, 'Hair Restoration Treatment', '10000000-0000-4000-8000-000000010002'::uuid, 1, false, 'Expected sterile syringe.'),
    ('10000000-0000-4000-8000-000000010703'::uuid, 'T-Shape Treatment', '10000000-0000-4000-8000-000000010004'::uuid, 1, true, 'Expected fictional T-Shape consumable.')
) as requirements(id, service_name, item_id, expected_quantity, required, notes) on true
join public.services services on services.organization_id = org.id and services.name = requirements.service_name
on conflict (service_id, inventory_item_id) do update
set expected_quantity = excluded.expected_quantity, required = excluded.required, notes = excluded.notes, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1),
locations as (
  select
    max(id) filter (where lower(trim(slug)) = 'miami') as miami_id,
    max(id) filter (where lower(trim(slug)) = 'tampa') as tampa_id
  from public.locations
  where organization_id = (select id from org)
)
insert into public.inventory_transfers (id, organization_id, from_location_id, to_location_id, status, transfer_date, received_at, created_by, received_by, notes)
select '10000000-0000-4000-8000-000000010601'::uuid, org.id, locations.miami_id, locations.tampa_id, 'received', current_date - 1, now() - interval '12 hours', owner_user.id, owner_user.id, 'Fictional Miami to Tampa vial transfer.'
from org
cross join locations
left join owner_user on true
on conflict (id) do update
set status = excluded.status, received_at = excluded.received_at, notes = excluded.notes, updated_at = now();

insert into public.inventory_transfer_items (id, transfer_id, inventory_item_id, inventory_lot_id, quantity)
values ('10000000-0000-4000-8000-000000010611', '10000000-0000-4000-8000-000000010601', '10000000-0000-4000-8000-000000010001', '10000000-0000-4000-8000-000000010201', 1)
on conflict (transfer_id, inventory_item_id, inventory_lot_id) do update
set quantity = excluded.quantity;

insert into public.inventory_alerts (id, organization_id, location_id, inventory_item_id, inventory_lot_id, alert_type, status, message)
select alerts.id, lots.organization_id, lots.location_id, lots.inventory_item_id, lots.id, alerts.alert_type, 'open', alerts.message
from (
  values
    ('10000000-0000-4000-8000-000000010801'::uuid, '10000000-0000-4000-8000-000000010204'::uuid, 'lot_expiring', 'Botox Demo Vial fictional lot expires within 30 days.'),
    ('10000000-0000-4000-8000-000000010802'::uuid, '10000000-0000-4000-8000-000000010203'::uuid, 'low_stock', 'Tampa T-Shape consumables are near reorder point.')
) as alerts(id, lot_id, alert_type, message)
join public.inventory_lots lots on lots.id = alerts.lot_id
on conflict (id) do update
set status = excluded.status, message = excluded.message;

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join org on org.id = up.organization_id
  left join public.roles r on r.id = up.role_id
  where lower(trim(up.email)) = 'owner@avora-demo.com' or r.name = 'owner'
  order by case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end, up.created_at
  limit 1
),
seeded_workflows as (
  select *
  from (
    values
      ('Inventory Low Stock', 'inventory', 'Create an internal review task when stock falls below reorder threshold.', 'inventory.low_stock', 'Review low stock item'),
      ('Inventory Out of Stock', 'inventory', 'Notify managers when available inventory reaches zero.', 'inventory.out_of_stock', 'Review out-of-stock item'),
      ('Lot Expiring Soon', 'inventory', 'Create a manager review task for expiring lots.', 'inventory.lot_expiring', 'Review expiring lot'),
      ('Purchase Order Received', 'inventory', 'Create a follow-up task after inventory is received.', 'inventory.po_received', 'Verify received inventory'),
      ('Transfer Received', 'inventory', 'Notify the destination manager after a transfer is received.', 'inventory.transfer_received', 'Verify transferred inventory'),
      ('Waste Recorded', 'inventory', 'Create a review task when inventory waste is recorded.', 'inventory.waste_recorded', 'Review inventory waste')
  ) as workflow_seed(name, category, description, trigger_type, task_title)
),
workflow_definitions as (
  select
    seeded_workflows.name,
    seeded_workflows.category,
    seeded_workflows.description,
    jsonb_build_object(
      'nodes', jsonb_build_array(
        jsonb_build_object('id', 'trigger_inventory_event', 'type', 'trigger', 'position', jsonb_build_object('x', 360, 'y', 40), 'configuration', jsonb_build_object('trigger_type', seeded_workflows.trigger_type, 'filters', jsonb_build_array())),
        jsonb_build_object('id', 'task_manager_review', 'type', 'action', 'position', jsonb_build_object('x', 360, 'y', 220), 'configuration', jsonb_build_object('action_type', 'create_task', 'title', seeded_workflows.task_title, 'due', jsonb_build_object('amount', 1, 'unit', 'day', 'time', '09:00'))),
        jsonb_build_object('id', 'notify_manager', 'type', 'action', 'position', jsonb_build_object('x', 360, 'y', 400), 'configuration', jsonb_build_object('action_type', 'send_internal_notification', 'audience', 'manager', 'message', seeded_workflows.description))
      ),
      'edges', jsonb_build_array(
        jsonb_build_object('source', 'trigger_inventory_event', 'target', 'task_manager_review', 'label', 'DEFAULT'),
        jsonb_build_object('source', 'task_manager_review', 'target', 'notify_manager', 'label', 'SUCCESS')
      )
    ) as definition_json
  from seeded_workflows
),
upserted_workflows as (
  insert into public.workflows (
    organization_id, name, description, category, status, location_scope,
    enrollment_policy, re_enrollment_policy, failure_policy, test_mode, created_by, updated_by
  )
  select
    owner_user.organization_id, workflow_definitions.name, workflow_definitions.description, workflow_definitions.category, 'draft', 'all',
    'one_active_per_contact', 'after_completion', 'retry_then_stop', true, owner_user.id, owner_user.id
  from workflow_definitions
  cross join owner_user
  on conflict (organization_id, name) do update set
    description = excluded.description,
    category = excluded.category,
    status = 'draft',
    active_version_id = null,
    published_at = null,
    test_mode = true,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id, organization_id, name, updated_by as owner_user_id
),
all_seeded_workflows as (
  select upserted_workflows.id, upserted_workflows.organization_id, upserted_workflows.name, workflow_definitions.definition_json, upserted_workflows.owner_user_id
  from upserted_workflows
  join workflow_definitions on workflow_definitions.name = upserted_workflows.name
),
upserted_versions as (
  insert into public.workflow_versions (workflow_id, version_number, definition_json, status, validation_snapshot, created_by)
  select id, 1, definition_json, 'draft', '{"seeded":true,"phase":10,"starter_template":true}'::jsonb, owner_user_id
  from all_seeded_workflows
  on conflict (workflow_id, version_number) do update set
    definition_json = excluded.definition_json,
    status = 'draft',
    validation_snapshot = excluded.validation_snapshot,
    published_at = null
  returning id
)
select
  (select count(*) from upserted_workflows) as inventory_workflows_inserted_or_updated,
  (select count(*) from upserted_versions) as inventory_workflow_versions_inserted_or_updated;

select
  (select count(*) from public.inventory_items ii join public.organizations o on o.id = ii.organization_id where lower(trim(o.slug)) = 'avora') as inventory_items,
  (select count(*) from public.vendors v join public.organizations o on o.id = v.organization_id where lower(trim(o.slug)) = 'avora') as vendors,
  (select count(*) from public.inventory_lots il join public.organizations o on o.id = il.organization_id where lower(trim(o.slug)) = 'avora') as inventory_lots,
  (select count(*) from public.inventory_events ie join public.organizations o on o.id = ie.organization_id where lower(trim(o.slug)) = 'avora') as inventory_events,
  (select count(*) from public.purchase_orders po join public.organizations o on o.id = po.organization_id where lower(trim(o.slug)) = 'avora') as purchase_orders,
  (select count(*) from public.treatment_inventory_usage tiu join public.organizations o on o.id = tiu.organization_id where lower(trim(o.slug)) = 'avora') as treatment_inventory_usage;
