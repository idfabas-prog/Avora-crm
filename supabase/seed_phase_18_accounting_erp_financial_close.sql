with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
)
insert into public.accounting_connections (id, organization_id, provider, status, external_company_id, company_name, sync_mode, metadata)
select '10000000-0000-4000-8000-000000018001'::uuid, org.id, 'csv_export', 'development', 'AVORA-DEMO-BOOKS', 'Avora Demo Accounting File', 'development', '{"demo":true,"provider":"mock","tokens_stored":false}'::jsonb
from org
on conflict (organization_id, provider, (coalesce(external_company_id, 'development'))) do update
set status = excluded.status, company_name = excluded.company_name, sync_mode = excluded.sync_mode, metadata = excluded.metadata, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1)
insert into public.accounting_accounts (id, organization_id, accounting_connection_id, external_account_id, account_name, account_type, account_subtype, active, metadata, synced_at)
select seed.id, (select id from org), (select id from connection), seed.external_account_id, seed.account_name, seed.account_type, seed.account_subtype, true, '{"demo":true}'::jsonb, now()
from (
  values
    ('10000000-0000-4000-8000-000000018101'::uuid, '1000', 'Cash', 'asset', 'bank'),
    ('10000000-0000-4000-8000-000000018102'::uuid, '1010', 'Stripe Clearing', 'asset', 'clearing'),
    ('10000000-0000-4000-8000-000000018103'::uuid, '1100', 'Accounts Receivable', 'asset', 'receivable'),
    ('10000000-0000-4000-8000-000000018104'::uuid, '1200', 'Inventory Asset', 'asset', 'inventory'),
    ('10000000-0000-4000-8000-000000018105'::uuid, '4000', 'Hair Restoration Revenue', 'income', 'service_revenue'),
    ('10000000-0000-4000-8000-000000018106'::uuid, '4010', 'T-Shape Revenue', 'income', 'service_revenue'),
    ('10000000-0000-4000-8000-000000018107'::uuid, '4020', 'NeoGen Revenue', 'income', 'service_revenue'),
    ('10000000-0000-4000-8000-000000018108'::uuid, '4030', 'Injectables Revenue', 'income', 'service_revenue'),
    ('10000000-0000-4000-8000-000000018109'::uuid, '4040', 'Membership Revenue', 'income', 'membership_revenue'),
    ('10000000-0000-4000-8000-000000018110'::uuid, '5000', 'Inventory COGS', 'expense', 'cogs'),
    ('10000000-0000-4000-8000-000000018111'::uuid, '6100', 'Commissions Expense', 'expense', 'commissions'),
    ('10000000-0000-4000-8000-000000018112'::uuid, '6200', 'Royalties Expense', 'expense', 'royalties'),
    ('10000000-0000-4000-8000-000000018113'::uuid, '6300', 'Management Fees', 'expense', 'management_fees'),
    ('10000000-0000-4000-8000-000000018114'::uuid, '6400', 'Merchant Fees', 'expense', 'merchant_fees')
) as seed(id, external_account_id, account_name, account_type, account_subtype)
on conflict (accounting_connection_id, external_account_id) do update
set account_name = excluded.account_name, account_type = excluded.account_type, account_subtype = excluded.account_subtype, active = excluded.active, metadata = excluded.metadata, synced_at = excluded.synced_at, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1),
creator as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.accounting_mappings (id, organization_id, accounting_connection_id, mapping_type, source_key, external_account_id, external_tracking_id, description, active, created_by)
select seed.id, (select id from org), (select id from connection), seed.mapping_type, seed.source_key, seed.external_account_id, seed.external_tracking_id, seed.description, true, (select id from creator)
from (
  values
    ('10000000-0000-4000-8000-000000018201'::uuid, 'cash', 'stripe_card', '1010', null::text, 'Stripe card payments clear through the demo clearing account.'),
    ('10000000-0000-4000-8000-000000018202'::uuid, 'cash', 'cash', '1000', null::text, 'Cash deposits map to demo cash.'),
    ('10000000-0000-4000-8000-000000018203'::uuid, 'undeposited_funds', 'default', '1100', null::text, 'Operational receivable/undeposited funds placeholder.'),
    ('10000000-0000-4000-8000-000000018204'::uuid, 'revenue', 'Hair Restoration', '4000', null::text, 'Demo hair restoration revenue mapping.'),
    ('10000000-0000-4000-8000-000000018205'::uuid, 'revenue', 'T-Shape', '4010', null::text, 'Demo T-Shape revenue mapping.'),
    ('10000000-0000-4000-8000-000000018206'::uuid, 'revenue', 'NeoGen', '4020', null::text, 'Demo NeoGen revenue mapping.'),
    ('10000000-0000-4000-8000-000000018207'::uuid, 'revenue', 'Injectables', '4030', null::text, 'Demo injectables revenue mapping.'),
    ('10000000-0000-4000-8000-000000018208'::uuid, 'membership_revenue', 'membership', '4040', null::text, 'Demo recurring membership revenue mapping.'),
    ('10000000-0000-4000-8000-000000018209'::uuid, 'refund', 'default', '4000', null::text, 'Demo refund contra mapping.'),
    ('10000000-0000-4000-8000-000000018210'::uuid, 'cogs', 'inventory_usage', '5000', null::text, 'Demo inventory COGS mapping.'),
    ('10000000-0000-4000-8000-000000018211'::uuid, 'inventory_asset', 'default', '1200', null::text, 'Demo inventory asset mapping.'),
    ('10000000-0000-4000-8000-000000018212'::uuid, 'commission_expense', 'default', '6100', null::text, 'Demo commission expense mapping.'),
    ('10000000-0000-4000-8000-000000018213'::uuid, 'royalty_expense', 'default', '6200', null::text, 'Demo royalty expense mapping.'),
    ('10000000-0000-4000-8000-000000018214'::uuid, 'management_fee', 'default', '6300', null::text, 'Demo management fee mapping.'),
    ('10000000-0000-4000-8000-000000018215'::uuid, 'merchant_fees', 'stripe', '6400', null::text, 'Demo Stripe merchant-fee mapping.'),
    ('10000000-0000-4000-8000-000000018216'::uuid, 'payment_plan_receivable', 'default', '1100', null::text, 'Demo payment-plan receivable mapping.'),
    ('10000000-0000-4000-8000-000000018217'::uuid, 'labor_expense', 'default', '6100', null::text, 'Demo labor support export mapping.'),
    ('10000000-0000-4000-8000-000000018218'::uuid, 'vendor_bills_future', 'inventory_receiving', '1200', null::text, 'Future vendor bill mapping placeholder; no bill is posted.')
) as seed(id, mapping_type, source_key, external_account_id, external_tracking_id, description)
on conflict (organization_id, accounting_connection_id, mapping_type, source_key) do update
set external_account_id = excluded.external_account_id, external_tracking_id = excluded.external_tracking_id, description = excluded.description, active = excluded.active, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1),
locations as (select slug, id, name from public.locations where organization_id = (select id from org))
insert into public.accounting_location_mappings (organization_id, location_id, accounting_connection_id, external_location_id, external_location_name, active)
select (select id from org), locations.id, (select id from connection), seed.external_location_id, seed.external_location_name, true
from (
  values
    ('miami', 'CLASS-MIA', 'Miami Demo Class'),
    ('tampa', 'CLASS-TPA', 'Tampa Demo Class'),
    ('jacksonville', 'CLASS-JAX', 'Jacksonville Demo Class')
) as seed(location_slug, external_location_id, external_location_name)
join locations on locations.slug = seed.location_slug
on conflict (location_id, accounting_connection_id) do update
set external_location_id = excluded.external_location_id, external_location_name = excluded.external_location_name, active = excluded.active, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1),
entities as (select id, name from public.operating_entities where organization_id = (select id from org))
insert into public.accounting_entity_mappings (organization_id, operating_entity_id, accounting_connection_id, external_entity_id, external_entity_name, mapping_mode, active, metadata)
select (select id from org), entities.id, (select id from connection), 'ENTITY-' || replace(upper(entities.name), ' ', '-'), entities.name || ' Demo Books', case when entities.name like '%Franchise%' then 'tracking_only' else 'same_company' end, true, '{"demo":true,"no_consolidation_inferred":true}'::jsonb
from entities
on conflict (operating_entity_id, accounting_connection_id) do update
set external_entity_id = excluded.external_entity_id, external_entity_name = excluded.external_entity_name, mapping_mode = excluded.mapping_mode, active = excluded.active, metadata = excluded.metadata, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1),
demo_contacts as (
  select id, row_number() over (order by created_at, id) as rn
  from public.contacts
  where organization_id = (select id from org)
  limit 3
)
insert into public.accounting_customer_mappings (organization_id, contact_id, accounting_connection_id, external_customer_id, last_synced_at)
select (select id from org), demo_contacts.id, (select id from connection), 'CUST-DEMO-' || demo_contacts.rn::text, now() - interval '1 day'
from demo_contacts
on conflict (contact_id, accounting_connection_id) do update
set external_customer_id = excluded.external_customer_id, last_synced_at = excluded.last_synced_at, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.accounting_export_batches (id, organization_id, accounting_connection_id, batch_type, period_start, period_end, status, record_count, debit_total_cents, credit_total_cents, export_version, created_by, approved_by, approved_at, exported_at, validation_json)
select seed.id, (select id from org), (select id from connection), seed.batch_type, seed.period_start, seed.period_end, seed.status, seed.record_count, seed.debits, seed.credits, 1, (select id from owner_user), seed.approved_by, seed.approved_at, seed.exported_at, seed.validation_json
from (
  values
    ('10000000-0000-4000-8000-000000018301'::uuid, 'journal_preview', date_trunc('month', current_date - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 day')::date, 'exported', 8, 2250000, 2250000, (select id from owner_user), now() - interval '10 days', now() - interval '9 days', '{"balanced":true,"demo_export":"csv_only"}'::jsonb),
    ('10000000-0000-4000-8000-000000018302'::uuid, 'payments', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'draft', 2, 600000, 525000, null::uuid, null::timestamptz, null::timestamptz, '{"balanced":false,"exception":"unbalanced_journal"}'::jsonb)
) as seed(id, batch_type, period_start, period_end, status, record_count, debits, credits, approved_by, approved_at, exported_at, validation_json)
on conflict (organization_id, accounting_connection_id, batch_type, period_start, period_end, export_version) do update
set status = excluded.status, record_count = excluded.record_count, debit_total_cents = excluded.debit_total_cents, credit_total_cents = excluded.credit_total_cents, approved_by = excluded.approved_by, approved_at = excluded.approved_at, exported_at = excluded.exported_at, validation_json = excluded.validation_json, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org)),
entities as (select name, id from public.operating_entities where organization_id = (select id from org))
insert into public.accounting_export_items (id, organization_id, accounting_export_batch_id, accounting_connection_id, source_type, source_id, export_version, location_id, operating_entity_id, external_account_id, amount_cents, debit_credit, description, export_status, external_transaction_id)
select seed.id, (select id from org), seed.batch_id, (select id from connection), seed.source_type, seed.source_id, 1, locations.id, entities.id, seed.account_id, seed.amount_cents, seed.debit_credit, seed.description, seed.export_status, seed.external_transaction_id
from (
  values
    ('10000000-0000-4000-8000-000000018401'::uuid, '10000000-0000-4000-8000-000000018301'::uuid, 'sale', '10000000-0000-4000-8000-000000018901'::uuid, 'miami', 'Avora Corporate Operations', '1100', 1250000, 'debit', 'Demo sale receivable preview', 'exported', 'MOCK-JE-001'),
    ('10000000-0000-4000-8000-000000018402'::uuid, '10000000-0000-4000-8000-000000018301'::uuid, 'sale', '10000000-0000-4000-8000-000000018901'::uuid, 'miami', 'Avora Corporate Operations', '4000', 1250000, 'credit', 'Demo sale revenue preview', 'exported', 'MOCK-JE-001'),
    ('10000000-0000-4000-8000-000000018403'::uuid, '10000000-0000-4000-8000-000000018301'::uuid, 'payment', '10000000-0000-4000-8000-000000018902'::uuid, 'miami', 'Avora Corporate Operations', '1010', 725000, 'debit', 'Demo Stripe payment clearing', 'exported', 'MOCK-JE-002'),
    ('10000000-0000-4000-8000-000000018404'::uuid, '10000000-0000-4000-8000-000000018301'::uuid, 'payment', '10000000-0000-4000-8000-000000018902'::uuid, 'miami', 'Avora Corporate Operations', '1100', 725000, 'credit', 'Demo payment applied to receivable', 'exported', 'MOCK-JE-002'),
    ('10000000-0000-4000-8000-000000018405'::uuid, '10000000-0000-4000-8000-000000018301'::uuid, 'cogs', '10000000-0000-4000-8000-000000018903'::uuid, 'tampa', 'Avora Florida Management', '5000', 275000, 'debit', 'Demo treatment inventory COGS', 'exported', 'MOCK-JE-003'),
    ('10000000-0000-4000-8000-000000018406'::uuid, '10000000-0000-4000-8000-000000018301'::uuid, 'cogs', '10000000-0000-4000-8000-000000018903'::uuid, 'tampa', 'Avora Florida Management', '1200', 275000, 'credit', 'Demo inventory asset reduction', 'exported', 'MOCK-JE-003'),
    ('10000000-0000-4000-8000-000000018407'::uuid, '10000000-0000-4000-8000-000000018302'::uuid, 'payment', '10000000-0000-4000-8000-000000018904'::uuid, 'jacksonville', 'North Florida Franchise Demo', '1010', 600000, 'debit', 'Draft demo payment clearing awaiting review', 'draft', null::text),
    ('10000000-0000-4000-8000-000000018408'::uuid, '10000000-0000-4000-8000-000000018302'::uuid, 'payment', '10000000-0000-4000-8000-000000018904'::uuid, 'jacksonville', 'North Florida Franchise Demo', '1100', 525000, 'credit', 'Draft demo receivable offset intentionally imbalanced', 'draft', null::text)
) as seed(id, batch_id, source_type, source_id, location_slug, entity_name, account_id, amount_cents, debit_credit, description, export_status, external_transaction_id)
left join locations on locations.slug = seed.location_slug
left join entities on entities.name = seed.entity_name
on conflict (organization_id, accounting_connection_id, source_type, source_id, export_version, debit_credit, external_account_id) do update
set accounting_export_batch_id = excluded.accounting_export_batch_id, location_id = excluded.location_id, operating_entity_id = excluded.operating_entity_id, amount_cents = excluded.amount_cents, description = excluded.description, export_status = excluded.export_status, external_transaction_id = excluded.external_transaction_id, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org))
insert into public.accounting_exceptions (id, organization_id, location_id, source_type, source_id, exception_type, severity, message, status)
select seed.id, (select id from org), locations.id, seed.source_type, seed.source_id, seed.exception_type, seed.severity, seed.message, seed.status
from (
  values
    ('10000000-0000-4000-8000-000000018501'::uuid, 'miami', 'service', '10000000-0000-4000-8000-000000018911'::uuid, 'missing_revenue_mapping', 'watch', 'Demo service category needs accounting review.', 'open'),
    ('10000000-0000-4000-8000-000000018502'::uuid, 'tampa', 'payment', '10000000-0000-4000-8000-000000018912'::uuid, 'unmatched_payment', 'important', 'Demo Stripe processor row is not matched to an Avora payment.', 'open'),
    ('10000000-0000-4000-8000-000000018503'::uuid, 'jacksonville', 'journal_preview', '10000000-0000-4000-8000-000000018302'::uuid, 'unbalanced_journal', 'critical', 'Draft demo payment export does not balance and cannot be approved.', 'open')
) as seed(id, location_slug, source_type, source_id, exception_type, severity, message, status)
left join locations on locations.slug = seed.location_slug
on conflict (organization_id, source_type, source_id, exception_type) do update
set location_id = excluded.location_id, severity = excluded.severity, message = excluded.message, status = excluded.status, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
locations as (select slug, id from public.locations where organization_id = (select id from org))
insert into public.processor_reconciliation_records (id, organization_id, location_id, processor, processor_transaction_id, payment_id, gross_cents, fee_cents, net_cents, settlement_date, status, metadata)
select seed.id, (select id from org), locations.id, 'stripe', seed.processor_transaction_id, null::uuid, seed.gross_cents, seed.fee_cents, seed.net_cents, seed.settlement_date, seed.status, seed.metadata
from (
  values
    ('10000000-0000-4000-8000-000000018601'::uuid, 'miami', 'pi_demo_matched_001', 725000, 22000, 703000, current_date - interval '4 days', 'matched', '{"demo":true,"matched_to":"mock_payment"}'::jsonb),
    ('10000000-0000-4000-8000-000000018602'::uuid, 'tampa', 'pi_demo_unmatched_002', 185000, 6200, 178800, current_date - interval '3 days', 'unmatched', '{"demo":true,"reason":"No Avora payment link"}'::jsonb),
    ('10000000-0000-4000-8000-000000018603'::uuid, 'jacksonville', 'pi_demo_partial_003', 600000, 18000, 582000, current_date - interval '2 days', 'partial', '{"demo":true,"reason":"Fee pending review"}'::jsonb)
) as seed(id, location_slug, processor_transaction_id, gross_cents, fee_cents, net_cents, settlement_date, status, metadata)
left join locations on locations.slug = seed.location_slug
on conflict (organization_id, processor, processor_transaction_id) do update
set location_id = excluded.location_id, gross_cents = excluded.gross_cents, fee_cents = excluded.fee_cents, net_cents = excluded.net_cents, settlement_date = excluded.settlement_date, status = excluded.status, metadata = excluded.metadata, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.accounting_periods (id, organization_id, period_start, period_end, status, closed_at, closed_by, close_notes)
select seed.id, (select id from org), seed.period_start, seed.period_end, seed.status, seed.closed_at, seed.closed_by, seed.close_notes
from (
  values
    ('10000000-0000-4000-8000-000000018701'::uuid, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'open', null::timestamptz, null::uuid, 'Current fictional open accounting period.'),
    ('10000000-0000-4000-8000-000000018702'::uuid, date_trunc('month', current_date - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 day')::date, 'closed', now() - interval '8 days', (select id from owner_user), 'Prior fictional closed accounting period.')
) as seed(id, period_start, period_end, status, closed_at, closed_by, close_notes)
on conflict (organization_id, period_start, period_end) do update
set status = excluded.status, closed_at = excluded.closed_at, closed_by = excluded.closed_by, close_notes = excluded.close_notes, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1)
insert into public.close_checklist_templates (id, organization_id, category, title, description, required, active, sort_order)
select seed.id, (select id from org), seed.category, seed.title, 'Fictional Phase 18 close checklist template item.', true, true, seed.sort_order
from (
  values
    ('10000000-0000-4000-8000-000000018801'::uuid, 'Sales', 'Review sales export preview', 10),
    ('10000000-0000-4000-8000-000000018802'::uuid, 'Payments', 'Review payment export preview', 20),
    ('10000000-0000-4000-8000-000000018803'::uuid, 'Refunds', 'Review refunds and reversals', 30),
    ('10000000-0000-4000-8000-000000018804'::uuid, 'Stripe Reconciliation', 'Resolve unmatched processor rows', 40),
    ('10000000-0000-4000-8000-000000018805'::uuid, 'Commissions', 'Review commission export support', 50),
    ('10000000-0000-4000-8000-000000018806'::uuid, 'Royalties', 'Review royalty export support', 60),
    ('10000000-0000-4000-8000-000000018807'::uuid, 'Inventory', 'Review inventory receiving support', 70),
    ('10000000-0000-4000-8000-000000018808'::uuid, 'COGS', 'Review treatment usage COGS', 80),
    ('10000000-0000-4000-8000-000000018809'::uuid, 'Payroll/Labor', 'Review labor support export', 90),
    ('10000000-0000-4000-8000-000000018810'::uuid, 'Memberships', 'Review membership revenue mapping', 100),
    ('10000000-0000-4000-8000-000000018811'::uuid, 'Payment Plans', 'Review payment plan receivable treatment', 110),
    ('10000000-0000-4000-8000-000000018812'::uuid, 'Accounting Exports', 'Confirm journal preview balances', 120),
    ('10000000-0000-4000-8000-000000018813'::uuid, 'Exceptions', 'Resolve critical accounting exceptions', 130),
    ('10000000-0000-4000-8000-000000018814'::uuid, 'Management Review', 'Owner review of operational close', 140)
) as seed(id, category, title, sort_order)
on conflict (organization_id, category, title) do update
set description = excluded.description, required = excluded.required, active = excluded.active, sort_order = excluded.sort_order, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
period as (
  select id from public.accounting_periods where organization_id = (select id from org) and status = 'open' order by period_start desc limit 1
),
templates as (
  select title, category, required, sort_order from public.close_checklist_templates where organization_id = (select id from org)
)
insert into public.accounting_close_items (accounting_period_id, title, category, required, status, completed_at, notes)
select (select id from period), templates.title, templates.category, templates.required,
  case when templates.sort_order <= 30 then 'complete' when templates.sort_order = 130 then 'blocked' else 'in_progress' end,
  case when templates.sort_order <= 30 then now() - interval '1 day' else null end,
  'Fictional Phase 18 close checklist row.'
from templates
on conflict (accounting_period_id, title) do update
set category = excluded.category, required = excluded.required, status = excluded.status, completed_at = excluded.completed_at, notes = excluded.notes, updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1)
insert into public.accounting_sync_runs (id, accounting_connection_id, sync_type, started_at, completed_at, status, records_processed, records_created, records_updated, records_failed, error_summary)
select seed.id, (select id from connection), seed.sync_type, seed.started_at, seed.completed_at, seed.status, seed.processed, seed.created, seed.updated, seed.failed, seed.error_summary
from (
  values
    ('10000000-0000-4000-8000-000000018851'::uuid, 'chart_of_accounts', '2026-08-12 10:00:00+00'::timestamptz, '2026-08-12 10:02:00+00'::timestamptz, 'completed', 14, 14, 0, 0, null::text),
    ('10000000-0000-4000-8000-000000018852'::uuid, 'export_batch', '2026-08-05 14:00:00+00'::timestamptz, '2026-08-05 14:01:00+00'::timestamptz, 'completed', 8, 1, 0, 0, null::text)
) as seed(id, sync_type, started_at, completed_at, status, processed, created, updated, failed, error_summary)
on conflict (id) do update
set accounting_connection_id = excluded.accounting_connection_id, sync_type = excluded.sync_type, started_at = excluded.started_at, completed_at = excluded.completed_at, status = excluded.status, records_processed = excluded.records_processed, records_created = excluded.records_created, records_updated = excluded.records_updated, records_failed = excluded.records_failed, error_summary = excluded.error_summary;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' limit 1),
connection as (select id from public.accounting_connections where organization_id = (select id from org) and provider = 'csv_export' limit 1)
insert into public.accounting_webhook_events (id, accounting_connection_id, provider_event_id, event_type, payload, processed_at, status)
select '10000000-0000-4000-8000-000000018861'::uuid, (select id from connection), 'demo-accounting-webhook-001', 'mock.connection.synced', '{"demo":true,"no_live_webhook_required":true}'::jsonb, now() - interval '2 days', 'processed'
on conflict (accounting_connection_id, provider_event_id) do update
set event_type = excluded.event_type, payload = excluded.payload, processed_at = excluded.processed_at, status = excluded.status;

-- Verification queries for Supabase SQL Editor:
-- select count(*) as phase18_accounting_connections from public.accounting_connections ac join public.organizations o on o.id = ac.organization_id where o.slug = 'avora';
-- select count(*) as phase18_accounting_accounts from public.accounting_accounts aa join public.organizations o on o.id = aa.organization_id where o.slug = 'avora';
-- select count(*) as phase18_accounting_mappings from public.accounting_mappings am join public.organizations o on o.id = am.organization_id where o.slug = 'avora';
-- select count(*) as phase18_location_mappings from public.accounting_location_mappings alm join public.organizations o on o.id = alm.organization_id where o.slug = 'avora';
-- select count(*) as phase18_entity_mappings from public.accounting_entity_mappings aem join public.organizations o on o.id = aem.organization_id where o.slug = 'avora';
-- select count(*) as phase18_customer_mappings from public.accounting_customer_mappings acm join public.organizations o on o.id = acm.organization_id where o.slug = 'avora';
-- select count(*) as phase18_export_batches from public.accounting_export_batches aeb join public.organizations o on o.id = aeb.organization_id where o.slug = 'avora';
-- select count(*) as phase18_export_items from public.accounting_export_items aei join public.organizations o on o.id = aei.organization_id where o.slug = 'avora';
-- select count(*) as phase18_exceptions from public.accounting_exceptions ae join public.organizations o on o.id = ae.organization_id where o.slug = 'avora';
-- select count(*) as phase18_reconciliation from public.processor_reconciliation_records prr join public.organizations o on o.id = prr.organization_id where o.slug = 'avora';
-- select count(*) as phase18_periods from public.accounting_periods ap join public.organizations o on o.id = ap.organization_id where o.slug = 'avora';
-- select count(*) as phase18_close_templates from public.close_checklist_templates cct join public.organizations o on o.id = cct.organization_id where o.slug = 'avora';
-- select count(*) as phase18_close_items from public.accounting_close_items aci join public.accounting_periods ap on ap.id = aci.accounting_period_id join public.organizations o on o.id = ap.organization_id where o.slug = 'avora';
-- select count(*) as phase18_sync_runs from public.accounting_sync_runs asr join public.accounting_connections ac on ac.id = asr.accounting_connection_id join public.organizations o on o.id = ac.organization_id where o.slug = 'avora';
-- select count(*) as phase18_webhook_events from public.accounting_webhook_events awe join public.accounting_connections ac on ac.id = awe.accounting_connection_id join public.organizations o on o.id = ac.organization_id where o.slug = 'avora';
