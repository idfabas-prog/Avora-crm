-- Diagnostic queries to run before this seed if needed:
-- select id, name, slug from public.organizations where lower(trim(slug)) = 'avora' or lower(trim(name)) = 'avora' or id = '10000000-0000-4000-8000-000000000001';
-- select l.id, l.name, l.slug from public.locations l join public.organizations o on o.id = l.organization_id where lower(trim(o.slug)) = 'avora' and lower(trim(l.slug)) in ('miami', 'tampa', 'jacksonville');
-- select c.id, c.first_name, c.last_name, c.email from public.contacts c join public.organizations o on o.id = c.organization_id where lower(trim(o.slug)) = 'avora' and lower(trim(c.email)) in ('isabella.m@example.com', 'camila.s@example.com', 'danielle.c@example.com');
-- select up.id, up.full_name, up.email from public.user_profiles up join public.organizations o on o.id = up.organization_id where lower(trim(o.slug)) = 'avora' and lower(trim(up.email)) in ('owner@avora-demo.com', 'manager@avora-demo.com', 'sales@avora-demo.com');
-- select 'services' as table_name, count(*) from public.services union all select 'packages', count(*) from public.packages union all select 'sales', count(*) from public.sales union all select 'payments', count(*) from public.payments union all select 'commissions', count(*) from public.commissions union all select 'royalties', count(*) from public.royalties;

do $$
begin
  if not exists (
    select 1
    from public.organizations
    where lower(trim(slug)) = 'avora'
       or lower(trim(name)) = 'avora'
       or id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Phase 4 seed could not find the Avora organization.';
  end if;
end;
$$;

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
seeded_services (id, name, category, description, default_price_cents, commission_eligible, royalty_eligible, default_commission_rate, default_royalty_rate) as (
  values
    ('10000000-0000-4000-8000-000000000701'::uuid, 'Hair Restoration Consultation', 'Hair Restoration', 'Fictional development consultation.', 5000, true, true, 0.0500, 0.0700),
    ('10000000-0000-4000-8000-000000000702'::uuid, 'Hair Restoration Treatment', 'Hair Restoration', 'Fictional development hair restoration session.', 220000, true, true, 0.0500, 0.0700),
    ('10000000-0000-4000-8000-000000000703'::uuid, 'T-Shape Consultation', 'T-Shape', 'Fictional development T-Shape consultation.', 5000, true, false, 0.0400, 0.0000),
    ('10000000-0000-4000-8000-000000000704'::uuid, 'T-Shape Treatment', 'T-Shape', 'Fictional development body contouring session.', 45000, true, false, 0.0400, 0.0000),
    ('10000000-0000-4000-8000-000000000705'::uuid, 'NeoGen Consultation', 'NeoGen', 'Fictional development NeoGen consultation.', 5000, true, false, 0.0400, 0.0000),
    ('10000000-0000-4000-8000-000000000706'::uuid, 'NeoGen Treatment', 'NeoGen', 'Fictional development NeoGen session.', 65000, true, false, 0.0400, 0.0000),
    ('10000000-0000-4000-8000-000000000707'::uuid, 'Botox', 'Botox', 'Fictional development injectable service.', 42000, true, false, 0.0300, 0.0000),
    ('10000000-0000-4000-8000-000000000708'::uuid, 'Dermal Filler', 'Fillers', 'Fictional development filler service.', 78000, true, true, 0.0300, 0.0700),
    ('10000000-0000-4000-8000-000000000709'::uuid, 'Peptides', 'Peptides', 'Fictional development wellness service.', 24000, true, false, 0.0300, 0.0000),
    ('10000000-0000-4000-8000-000000000710'::uuid, 'Blood Work', 'Blood Work', 'Fictional development lab service.', 18000, false, false, 0.0000, 0.0000),
    ('10000000-0000-4000-8000-000000000711'::uuid, 'IV Therapy', 'IV Therapy', 'Fictional development IV therapy service.', 26000, true, true, 0.0300, 0.0700),
    ('10000000-0000-4000-8000-000000000712'::uuid, 'Weight Loss Consultation', 'Weight Loss', 'Fictional development weight loss consultation.', 7500, true, true, 0.0300, 0.0700)
)
insert into public.services (id, organization_id, name, category, description, default_price_cents, active, commission_eligible, royalty_eligible, default_commission_rate, default_royalty_rate)
select seeded_services.id, org.id, seeded_services.name, seeded_services.category, seeded_services.description, seeded_services.default_price_cents, true, seeded_services.commission_eligible, seeded_services.royalty_eligible, seeded_services.default_commission_rate, seeded_services.default_royalty_rate
from org
cross join seeded_services
on conflict (organization_id, name) do update
set
  category = excluded.category,
  description = excluded.description,
  default_price_cents = excluded.default_price_cents,
  commission_eligible = excluded.commission_eligible,
  royalty_eligible = excluded.royalty_eligible,
  default_commission_rate = excluded.default_commission_rate,
  default_royalty_rate = excluded.default_royalty_rate,
  active = excluded.active;

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
seeded_packages (id, name, description, package_price_cents) as (
  values
    ('10000000-0000-4000-8000-000000000801'::uuid, 'Hair Restoration - 2 Sessions', 'Fictional two-session hair restoration package.', 420000),
    ('10000000-0000-4000-8000-000000000802'::uuid, 'Hair Restoration - 3 Sessions', 'Fictional three-session hair restoration package.', 550000),
    ('10000000-0000-4000-8000-000000000803'::uuid, 'Hair Restoration - 4 Sessions', 'Fictional four-session hair restoration package.', 700000),
    ('10000000-0000-4000-8000-000000000804'::uuid, 'Hair Restoration - 5 Sessions', 'Fictional five-session hair restoration package.', 840000),
    ('10000000-0000-4000-8000-000000000805'::uuid, 'Hair Restoration - 6 Sessions', 'Fictional six-session hair restoration package.', 960000)
)
insert into public.packages (id, organization_id, name, description, package_price_cents, active)
select seeded_packages.id, org.id, seeded_packages.name, seeded_packages.description, seeded_packages.package_price_cents, true
from org
cross join seeded_packages
on conflict (organization_id, name) do update
set description = excluded.description, package_price_cents = excluded.package_price_cents, active = excluded.active;

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
seeded_package_items (package_name, service_name, quantity, unit_value_cents) as (
  values
    ('Hair Restoration - 2 Sessions', 'Hair Restoration Treatment', 2, 220000),
    ('Hair Restoration - 3 Sessions', 'Hair Restoration Treatment', 3, 220000),
    ('Hair Restoration - 4 Sessions', 'Hair Restoration Treatment', 4, 220000),
    ('Hair Restoration - 5 Sessions', 'Hair Restoration Treatment', 5, 220000),
    ('Hair Restoration - 6 Sessions', 'Hair Restoration Treatment', 6, 220000)
)
insert into public.package_items (package_id, service_id, quantity, unit_value_cents)
select packages.id, services.id, seeded_package_items.quantity, seeded_package_items.unit_value_cents
from org
join public.packages packages on packages.organization_id = org.id
join seeded_package_items on seeded_package_items.package_name = packages.name
join public.services services on services.organization_id = org.id and services.name = seeded_package_items.service_name
on conflict (package_id, service_id) do update
set quantity = excluded.quantity, unit_value_cents = excluded.unit_value_cents;

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
seeded_rules (location_slug, payment_method, provider, fee_percentage, fee_fixed_cents, affects_commission_basis, affects_royalty_basis) as (
  values
    (null, 'card', 'stripe', 0.0290, 30, true, false),
    (null, 'cash', 'manual', 0.0000, 0, false, false),
    (null, 'cherry', 'external', 0.0600, 0, true, true),
    (null, 'external_financing', 'external', 0.0500, 0, true, true)
),
resolved_rules as (
  select org.id as organization_id, locations.id as location_id, seeded_rules.payment_method, seeded_rules.provider, seeded_rules.fee_percentage, seeded_rules.fee_fixed_cents, seeded_rules.affects_commission_basis, seeded_rules.affects_royalty_basis
  from org
  cross join seeded_rules
  left join public.locations locations on locations.organization_id = org.id and locations.slug = seeded_rules.location_slug
),
updated_rules as (
  update public.payment_method_rules existing
  set fee_percentage = resolved.fee_percentage, fee_fixed_cents = resolved.fee_fixed_cents, affects_commission_basis = resolved.affects_commission_basis, affects_royalty_basis = resolved.affects_royalty_basis, active = true
  from resolved_rules resolved
  where existing.organization_id = resolved.organization_id
    and existing.payment_method = resolved.payment_method
    and existing.provider = resolved.provider
    and existing.location_id is not distinct from resolved.location_id
  returning existing.id
)
insert into public.payment_method_rules (organization_id, location_id, payment_method, provider, fee_percentage, fee_fixed_cents, affects_commission_basis, affects_royalty_basis, active)
select organization_id, location_id, payment_method, provider, fee_percentage, fee_fixed_cents, affects_commission_basis, affects_royalty_basis, true
from resolved_rules resolved
where not exists (
  select 1
  from public.payment_method_rules existing
  where existing.organization_id = resolved.organization_id
    and existing.payment_method = resolved.payment_method
    and existing.provider = resolved.provider
    and existing.location_id is not distinct from resolved.location_id
);

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
staff as (
  select (
    select id
    from public.user_profiles
    where organization_id = (select id from org)
      and lower(trim(email)) in ('sales@avora-demo.com', 'owner@avora-demo.com')
    order by case when lower(trim(email)) = 'sales@avora-demo.com' then 0 else 1 end
    limit 1
  ) as salesperson_id
),
seeded_rules (id, service_name, package_name, category, rate, basis) as (
  values
    ('10000000-0000-4000-8000-000000000901'::uuid, null, null, null, 0.0500, 'money_collected'),
    ('10000000-0000-4000-8000-000000000902'::uuid, null, null, 'Botox', 0.0300, 'money_collected'),
    ('10000000-0000-4000-8000-000000000903'::uuid, 'Blood Work', null, null, 0.0000, 'money_collected')
)
insert into public.commission_rules (id, organization_id, user_id, service_id, package_id, category, commission_type, rate, active, basis)
select seeded_rules.id, org.id, staff.salesperson_id, services.id, packages.id, seeded_rules.category, 'percentage', seeded_rules.rate, true, seeded_rules.basis
from org
cross join staff
cross join seeded_rules
left join public.services services on services.organization_id = org.id and services.name = seeded_rules.service_name
left join public.packages packages on packages.organization_id = org.id and packages.name = seeded_rules.package_name
on conflict (id) do update
set user_id = excluded.user_id, service_id = excluded.service_id, package_id = excluded.package_id, rate = excluded.rate, basis = excluded.basis, active = excluded.active;

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
seeded_rules (id, category, service_name, package_name, rate, basis, active) as (
  values
    ('10000000-0000-4000-8000-000000000921'::uuid, null, null, null, 0.0700, 'money_collected', true),
    ('10000000-0000-4000-8000-000000000922'::uuid, 'Botox', null, null, 0.0000, 'money_collected', true),
    ('10000000-0000-4000-8000-000000000923'::uuid, 'T-Shape', null, null, 0.0000, 'money_collected', true),
    ('10000000-0000-4000-8000-000000000924'::uuid, 'NeoGen', null, null, 0.0000, 'money_collected', true),
    ('10000000-0000-4000-8000-000000000925'::uuid, 'Blood Work', null, null, 0.0000, 'money_collected', true),
    ('10000000-0000-4000-8000-000000000926'::uuid, 'Peptides', null, null, 0.0000, 'money_collected', true)
)
insert into public.royalty_rules (id, organization_id, category, service_id, package_id, rate, basis, active)
select seeded_rules.id, org.id, seeded_rules.category, services.id, packages.id, seeded_rules.rate, seeded_rules.basis, seeded_rules.active
from org
cross join seeded_rules
left join public.services services on services.organization_id = org.id and services.name = seeded_rules.service_name
left join public.packages packages on packages.organization_id = org.id and packages.name = seeded_rules.package_name
on conflict (id) do update
set service_id = excluded.service_id, package_id = excluded.package_id, rate = excluded.rate, basis = excluded.basis, active = excluded.active;

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
staff as (
  select
    (
      select id
      from public.user_profiles
      where organization_id = (select id from org)
        and lower(trim(email)) in ('sales@avora-demo.com', 'owner@avora-demo.com')
      order by case when lower(trim(email)) = 'sales@avora-demo.com' then 0 else 1 end
      limit 1
    ) as salesperson_id,
    (
      select id
      from public.user_profiles
      where organization_id = (select id from org)
        and lower(trim(email)) in ('owner@avora-demo.com', 'sales@avora-demo.com')
      order by case when lower(trim(email)) = 'owner@avora-demo.com' then 0 else 1 end
      limit 1
    ) as creator_id
),
seeded_sales (id, contact_email, location_slug, opportunity_name, sale_date, notes, source) as (
  values
    ('10000000-0000-4000-8000-000000001001'::uuid, 'isabella.m@example.com', 'miami', 'Hair Restoration - Isabella Martin', now() - interval '5 days', 'Fictional partial-payment hair restoration sale.', 'seed'),
    ('10000000-0000-4000-8000-000000001002'::uuid, 'camila.s@example.com', 'tampa', 'Hair Restoration - Camila Stone', now() - interval '3 days', 'Fictional fully paid Cherry financing sale.', 'seed'),
    ('10000000-0000-4000-8000-000000001003'::uuid, 'danielle.c@example.com', 'jacksonville', 'Hair Restoration - Danielle Cross', now() - interval '2 days', 'Fictional multi-service sale with partial refund.', 'seed')
)
insert into public.sales (id, organization_id, location_id, contact_id, opportunity_id, salesperson_id, created_by, status, currency, sale_date, notes, source)
select seeded_sales.id, org.id, locations.id, contacts.id, opportunities.id, staff.salesperson_id, staff.creator_id, 'open', 'USD', seeded_sales.sale_date, seeded_sales.notes, seeded_sales.source
from org
cross join seeded_sales
cross join staff
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = seeded_sales.location_slug
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = seeded_sales.contact_email
left join public.opportunities opportunities on opportunities.organization_id = org.id and opportunities.name = seeded_sales.opportunity_name
on conflict (id) do update
set location_id = excluded.location_id, contact_id = excluded.contact_id, opportunity_id = excluded.opportunity_id, salesperson_id = excluded.salesperson_id, created_by = excluded.created_by, notes = excluded.notes;

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when lower(trim(slug)) = 'avora' then 0 when lower(trim(name)) = 'avora' then 1 else 2 end
  limit 1
),
seeded_items (id, sale_id, service_name, package_name, description, quantity, unit_price_cents, discount_amount_cents, commission_eligible, royalty_eligible) as (
  values
    ('10000000-0000-4000-8000-000000001101'::uuid, '10000000-0000-4000-8000-000000001001'::uuid, null, 'Hair Restoration - 3 Sessions', 'Hair Restoration - 3 Sessions', 1, 550000, 0, true, true),
    ('10000000-0000-4000-8000-000000001102'::uuid, '10000000-0000-4000-8000-000000001002'::uuid, null, 'Hair Restoration - 4 Sessions', 'Hair Restoration - 4 Sessions', 1, 700000, 50000, true, true),
    ('10000000-0000-4000-8000-000000001103'::uuid, '10000000-0000-4000-8000-000000001003'::uuid, null, 'Hair Restoration - 2 Sessions', 'Hair Restoration - 2 Sessions', 1, 420000, 0, true, true),
    ('10000000-0000-4000-8000-000000001104'::uuid, '10000000-0000-4000-8000-000000001003'::uuid, 'Botox', null, 'Botox', 1, 42000, 0, true, false)
)
insert into public.sale_items (id, sale_id, service_id, package_id, description, quantity, unit_price_cents, discount_amount_cents, commission_eligible, royalty_eligible)
select seeded_items.id, sales.id, services.id, packages.id, seeded_items.description, seeded_items.quantity, seeded_items.unit_price_cents, seeded_items.discount_amount_cents, seeded_items.commission_eligible, seeded_items.royalty_eligible
from org
join public.sales sales on sales.organization_id = org.id
join seeded_items on seeded_items.sale_id = sales.id
left join public.services services on services.organization_id = org.id and services.name = seeded_items.service_name
left join public.packages packages on packages.organization_id = org.id and packages.name = seeded_items.package_name
on conflict (id) do update
set service_id = excluded.service_id, package_id = excluded.package_id, unit_price_cents = excluded.unit_price_cents, discount_amount_cents = excluded.discount_amount_cents, commission_eligible = excluded.commission_eligible, royalty_eligible = excluded.royalty_eligible;

with processor as (
  select (
    select id
    from public.user_profiles
    where lower(trim(email)) in ('owner@avora-demo.com', 'manager@avora-demo.com')
    order by case when lower(trim(email)) = 'owner@avora-demo.com' then 0 else 1 end
    limit 1
  ) as id
),
seeded_payments (id, sale_id, amount_cents, payment_method, payment_provider, payment_purpose, provider_payment_id, status, received_at, notes, external_reference) as (
  values
    ('10000000-0000-4000-8000-000000001201'::uuid, '10000000-0000-4000-8000-000000001001'::uuid, 100000, 'card', 'stripe', 'deposit', 'sim_pi_isabella_deposit', 'succeeded', now() - interval '5 days', 'Simulated card deposit.', 'SIM-CARD-DEP'),
    ('10000000-0000-4000-8000-000000001202'::uuid, '10000000-0000-4000-8000-000000001002'::uuid, 650000, 'cherry', 'external', 'full_payment', 'sim_cherry_camila_full', 'succeeded', now() - interval '3 days', 'Simulated Cherry financing payment.', 'SIM-CHERRY'),
    ('10000000-0000-4000-8000-000000001203'::uuid, '10000000-0000-4000-8000-000000001003'::uuid, 250000, 'cash', 'manual', 'partial_payment', 'sim_cash_danielle_partial', 'succeeded', now() - interval '2 days', 'Simulated cash partial payment.', 'SIM-CASH'),
    ('10000000-0000-4000-8000-000000001204'::uuid, '10000000-0000-4000-8000-000000001003'::uuid, 212000, 'external_financing', 'external', 'final_payment', 'sim_external_danielle_final', 'succeeded', now() - interval '1 day', 'Simulated external financing final payment.', 'SIM-FIN')
)
insert into public.payments (id, organization_id, location_id, contact_id, sale_id, amount_cents, currency, payment_method, payment_provider, payment_purpose, provider_payment_id, status, received_at, processed_by, notes, external_reference, simulated)
select seeded_payments.id, sales.organization_id, sales.location_id, sales.contact_id, sales.id, seeded_payments.amount_cents, 'USD', seeded_payments.payment_method, seeded_payments.payment_provider, seeded_payments.payment_purpose, seeded_payments.provider_payment_id, seeded_payments.status, seeded_payments.received_at, processor.id, seeded_payments.notes, seeded_payments.external_reference, true
from seeded_payments
join public.sales sales on sales.id = seeded_payments.sale_id
cross join processor
on conflict (id) do update
set amount_cents = excluded.amount_cents, status = excluded.status, notes = excluded.notes, processed_by = excluded.processed_by;

with processor as (
  select (
    select id
    from public.user_profiles
    where lower(trim(email)) in ('owner@avora-demo.com', 'manager@avora-demo.com')
    order by case when lower(trim(email)) = 'owner@avora-demo.com' then 0 else 1 end
    limit 1
  ) as id
)
insert into public.refunds (id, organization_id, location_id, payment_id, sale_id, contact_id, amount_cents, reason, provider_refund_id, status, processed_by, refunded_at)
select '10000000-0000-4000-8000-000000001301'::uuid, payments.organization_id, payments.location_id, payments.id, payments.sale_id, payments.contact_id, 42000, 'Fictional partial refund for Botox line item.', 'sim_refund_danielle_botox', 'succeeded', processor.id, now() - interval '12 hours'
from public.payments payments
cross join processor
where payments.id = '10000000-0000-4000-8000-000000001204'
on conflict (id) do update
set amount_cents = excluded.amount_cents, status = excluded.status, reason = excluded.reason, processed_by = excluded.processed_by;

select public.recalculate_sale_financials(id)
from public.sales
where id in (
  '10000000-0000-4000-8000-000000001001',
  '10000000-0000-4000-8000-000000001002',
  '10000000-0000-4000-8000-000000001003'
);

with payment_lines as (
  select payments.id as payment_id, null::uuid as refund_id, payments.organization_id, payments.location_id, sales.id as sale_id, sales.salesperson_id as user_id, sale_items.id as sale_item_id, commission_rules.id as commission_rule_id, round(payments.amount_cents * (sale_items.line_total_cents::numeric / nullif(sales.total_amount_cents, 0)))::integer as basis_amount_cents, commission_rules.rate as commission_rate, 'pending' as status, 'Fictional commission generated from collected payment.' as notes
  from public.payments payments
  join public.sales sales on sales.id = payments.sale_id
  join public.sale_items sale_items on sale_items.sale_id = sales.id and sale_items.commission_eligible
  join public.commission_rules commission_rules on commission_rules.organization_id = payments.organization_id and commission_rules.id = '10000000-0000-4000-8000-000000000901'
  where payments.id in ('10000000-0000-4000-8000-000000001201', '10000000-0000-4000-8000-000000001202', '10000000-0000-4000-8000-000000001203', '10000000-0000-4000-8000-000000001204')
    and payments.status = 'succeeded'
    and sales.salesperson_id is not null
),
refund_lines as (
  select null::uuid as payment_id, refunds.id as refund_id, refunds.organization_id, refunds.location_id, sales.id as sale_id, sales.salesperson_id as user_id, sale_items.id as sale_item_id, commission_rules.id as commission_rule_id, -round(refunds.amount_cents * (sale_items.line_total_cents::numeric / nullif(sales.total_amount_cents, 0)))::integer as basis_amount_cents, commission_rules.rate as commission_rate, 'reversed' as status, 'Fictional commission reversal from refund.' as notes
  from public.refunds refunds
  join public.sales sales on sales.id = refunds.sale_id
  join public.sale_items sale_items on sale_items.sale_id = sales.id and sale_items.commission_eligible
  join public.commission_rules commission_rules on commission_rules.organization_id = refunds.organization_id and commission_rules.id = '10000000-0000-4000-8000-000000000901'
  where refunds.id = '10000000-0000-4000-8000-000000001301'
    and refunds.status = 'succeeded'
    and sales.salesperson_id is not null
),
ledger as (
  select * from payment_lines
  union all
  select * from refund_lines
)
insert into public.commissions (organization_id, location_id, user_id, sale_id, sale_item_id, payment_id, refund_id, commission_rule_id, basis_amount_cents, commission_rate, commission_amount_cents, status, notes)
select organization_id, location_id, user_id, sale_id, sale_item_id, payment_id, refund_id, commission_rule_id, basis_amount_cents, commission_rate, round(basis_amount_cents * commission_rate)::integer, status, notes
from ledger
on conflict do nothing;

with payment_lines as (
  select payments.id as payment_id, null::uuid as refund_id, payments.organization_id, payments.location_id, sales.id as sale_id, sale_items.id as sale_item_id, royalty_rules.id as royalty_rule_id, round(payments.amount_cents * (sale_items.line_total_cents::numeric / nullif(sales.total_amount_cents, 0)))::integer as basis_amount_cents, royalty_rules.rate as royalty_rate, 'pending' as status
  from public.payments payments
  join public.sales sales on sales.id = payments.sale_id
  join public.sale_items sale_items on sale_items.sale_id = sales.id and sale_items.royalty_eligible
  join public.royalty_rules royalty_rules on royalty_rules.organization_id = payments.organization_id and royalty_rules.id = '10000000-0000-4000-8000-000000000921'
  where payments.id in ('10000000-0000-4000-8000-000000001201', '10000000-0000-4000-8000-000000001202', '10000000-0000-4000-8000-000000001203', '10000000-0000-4000-8000-000000001204')
    and payments.status = 'succeeded'
),
refund_lines as (
  select null::uuid as payment_id, refunds.id as refund_id, refunds.organization_id, refunds.location_id, sales.id as sale_id, sale_items.id as sale_item_id, royalty_rules.id as royalty_rule_id, -round(refunds.amount_cents * (sale_items.line_total_cents::numeric / nullif(sales.total_amount_cents, 0)))::integer as basis_amount_cents, royalty_rules.rate as royalty_rate, 'reversed' as status
  from public.refunds refunds
  join public.sales sales on sales.id = refunds.sale_id
  join public.sale_items sale_items on sale_items.sale_id = sales.id and sale_items.royalty_eligible
  join public.royalty_rules royalty_rules on royalty_rules.organization_id = refunds.organization_id and royalty_rules.id = '10000000-0000-4000-8000-000000000921'
  where refunds.id = '10000000-0000-4000-8000-000000001301'
    and refunds.status = 'succeeded'
),
ledger as (
  select * from payment_lines
  union all
  select * from refund_lines
)
insert into public.royalties (organization_id, location_id, sale_id, sale_item_id, payment_id, refund_id, royalty_rule_id, basis_amount_cents, royalty_rate, royalty_amount_cents, status)
select organization_id, location_id, sale_id, sale_item_id, payment_id, refund_id, royalty_rule_id, basis_amount_cents, royalty_rate, round(basis_amount_cents * royalty_rate)::integer, status
from ledger
on conflict do nothing;

-- Diagnostic queries to run after this seed:
-- select 'services' as table_name, count(*) from public.services union all select 'packages', count(*) from public.packages union all select 'sales', count(*) from public.sales union all select 'payments', count(*) from public.payments union all select 'commissions', count(*) from public.commissions union all select 'royalties', count(*) from public.royalties;
-- select s.id, s.status, s.total_amount_cents, s.paid_amount_cents, s.refunded_amount_cents, s.balance_due_cents, c.email from public.sales s join public.contacts c on c.id = s.contact_id where s.id in ('10000000-0000-4000-8000-000000001001', '10000000-0000-4000-8000-000000001002', '10000000-0000-4000-8000-000000001003') order by c.email;
