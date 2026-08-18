-- Phase 9 development seed. All records are fictional/demo data.
-- This seed does not create Supabase Auth users or seed passwords.

do $$
begin
  if not exists (
    select 1
    from public.organizations
    where lower(trim(slug)) = 'avora'
       or lower(trim(name)) = 'avora'
       or id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Phase 9 seed could not find the Avora organization.';
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
)
insert into public.portal_settings (id, organization_id, portal_enabled, brand_name, support_email, support_phone, reschedule_minimum_notice_hours, cancellation_minimum_notice_hours, allow_balance_payments, allow_memberships, allow_payment_plans, development_mode, metadata)
select '10000000-0000-4000-8000-000000009001'::uuid, org.id, true, 'Avora', 'support@avora-demo.com', '(305) 555-0100', 48, 24, true, true, true, true, '{"demo":true}'::jsonb
from org
on conflict (organization_id) do update
set
  portal_enabled = excluded.portal_enabled,
  brand_name = excluded.brand_name,
  support_email = excluded.support_email,
  support_phone = excluded.support_phone,
  reschedule_minimum_notice_hours = excluded.reschedule_minimum_notice_hours,
  cancellation_minimum_notice_hours = excluded.cancellation_minimum_notice_hours,
  allow_balance_payments = excluded.allow_balance_payments,
  allow_memberships = excluded.allow_memberships,
  allow_payment_plans = excluded.allow_payment_plans,
  development_mode = excluded.development_mode,
  metadata = excluded.metadata,
  updated_at = now();

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  limit 1
),
account_seed (id, email, status, invited_offset) as (
  values
    ('10000000-0000-4000-8000-000000009101'::uuid, 'isabella.m@example.com', 'invited', interval '2 days'),
    ('10000000-0000-4000-8000-000000009102'::uuid, 'camila.s@example.com', 'invited', interval '1 day'),
    ('10000000-0000-4000-8000-000000009103'::uuid, 'danielle.c@example.com', 'invited', interval '6 hours')
)
insert into public.patient_accounts (id, organization_id, contact_id, status, invited_at, sms_reminders_enabled, email_reminders_enabled, billing_notifications_enabled)
select account_seed.id, org.id, contacts.id, account_seed.status, now() - account_seed.invited_offset, true, true, true
from org
join account_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = account_seed.email
on conflict (organization_id, contact_id) do update
set
  status = case when public.patient_accounts.status = 'active' then public.patient_accounts.status else excluded.status end,
  invited_at = coalesce(public.patient_accounts.invited_at, excluded.invited_at),
  sms_reminders_enabled = excluded.sms_reminders_enabled,
  email_reminders_enabled = excluded.email_reminders_enabled,
  billing_notifications_enabled = excluded.billing_notifications_enabled,
  updated_at = now();

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  limit 1
),
plan_seed (id, name, description, billing_interval, price_cents, benefits) as (
  values
    ('10000000-0000-4000-8000-000000009201'::uuid, 'Avora Essential', 'Fictional development monthly wellness membership.', 'monthly', 9900, '[{"key":"consultation","label":"Included monthly consultation","quantity":1},{"key":"priority_booking","label":"Priority booking","quantity":1}]'::jsonb),
    ('10000000-0000-4000-8000-000000009202'::uuid, 'Avora Aesthetic', 'Fictional development aesthetics membership with monthly treatment credit.', 'monthly', 24900, '[{"key":"tshape_credit","label":"Monthly T-Shape credit","quantity":1},{"key":"discount","label":"10% service discount","quantity":1},{"key":"priority_booking","label":"Priority booking","quantity":1}]'::jsonb),
    ('10000000-0000-4000-8000-000000009203'::uuid, 'Avora Elite', 'Fictional development premium membership with broader benefits.', 'monthly', 49900, '[{"key":"botox_credit","label":"Monthly Botox credit","quantity":1},{"key":"wellness_credit","label":"Monthly wellness credit","quantity":1},{"key":"priority_booking","label":"Priority booking","quantity":1}]'::jsonb)
)
insert into public.membership_plans (id, organization_id, name, description, billing_interval, price_cents, currency, active, included_benefits_json, metadata)
select plan_seed.id, org.id, plan_seed.name, plan_seed.description, plan_seed.billing_interval, plan_seed.price_cents, 'USD', true, plan_seed.benefits, '{"demo":true,"billing":"simulated"}'::jsonb
from org
join plan_seed on true
on conflict (organization_id, name) do update
set
  description = excluded.description,
  billing_interval = excluded.billing_interval,
  price_cents = excluded.price_cents,
  active = true,
  included_benefits_json = excluded.included_benefits_json,
  metadata = excluded.metadata,
  updated_at = now();

with org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
     or lower(trim(name)) = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  limit 1
),
membership_seed (id, contact_email, plan_name, status, billing_status, start_date, next_billing_date) as (
  values
    ('10000000-0000-4000-8000-000000009301'::uuid, 'camila.s@example.com', 'Avora Aesthetic', 'active', 'simulated', current_date - 20, current_date + 10),
    ('10000000-0000-4000-8000-000000009302'::uuid, 'isabella.m@example.com', 'Avora Essential', 'trial', 'simulated', current_date - 5, current_date + 25)
)
insert into public.patient_memberships (id, organization_id, contact_id, membership_plan_id, status, start_date, next_billing_date, billing_status, cancel_at_period_end, metadata)
select membership_seed.id, org.id, contacts.id, membership_plans.id, membership_seed.status, membership_seed.start_date, membership_seed.next_billing_date, membership_seed.billing_status, false, '{"demo":true}'::jsonb
from org
join membership_seed on true
join public.contacts contacts on contacts.organization_id = org.id and lower(trim(contacts.email)) = membership_seed.contact_email
join public.membership_plans membership_plans on membership_plans.organization_id = org.id and membership_plans.name = membership_seed.plan_name
on conflict (id) do update
set
  status = excluded.status,
  next_billing_date = excluded.next_billing_date,
  billing_status = excluded.billing_status,
  metadata = excluded.metadata,
  updated_at = now();

with benefit_seed (membership_id, benefit_key, event_type, quantity, balance_after, idempotency_key, reason) as (
  values
    ('10000000-0000-4000-8000-000000009301'::uuid, 'tshape_credit', 'grant', 1, 1, 'phase9-camila-tshape-grant-1', 'Fictional monthly membership grant.'),
    ('10000000-0000-4000-8000-000000009301'::uuid, 'discount', 'grant', 1, 1, 'phase9-camila-discount-grant-1', 'Fictional monthly membership grant.'),
    ('10000000-0000-4000-8000-000000009302'::uuid, 'consultation', 'grant', 1, 1, 'phase9-isabella-consult-grant-1', 'Fictional trial membership grant.')
)
insert into public.membership_benefit_events (organization_id, patient_membership_id, contact_id, benefit_key, event_type, quantity, balance_after, idempotency_key, reason)
select pm.organization_id, pm.id, pm.contact_id, benefit_seed.benefit_key, benefit_seed.event_type, benefit_seed.quantity, benefit_seed.balance_after, benefit_seed.idempotency_key, benefit_seed.reason
from benefit_seed
join public.patient_memberships pm on pm.id = benefit_seed.membership_id
on conflict (organization_id, idempotency_key) do update
set
  quantity = excluded.quantity,
  balance_after = excluded.balance_after,
  reason = excluded.reason;

with plan_seed as (
  select
    '10000000-0000-4000-8000-000000009401'::uuid as id,
    sales.organization_id,
    sales.contact_id,
    sales.id as sale_id,
    greatest(sales.balance_due_cents, 0) as total_amount_cents
  from public.sales sales
  join public.contacts contacts on contacts.id = sales.contact_id
  where sales.id = '10000000-0000-4000-8000-000000001001'
    and lower(trim(contacts.email)) = 'isabella.m@example.com'
)
insert into public.payment_plans (id, organization_id, contact_id, sale_id, total_amount_cents, down_payment_cents, installment_amount_cents, installment_count, frequency, status, start_date, next_due_date, provider, external_plan_id, metadata)
select id, organization_id, contact_id, sale_id, total_amount_cents, 100000, greatest(round((total_amount_cents - 100000)::numeric / 3), 0)::integer, 3, 'monthly', 'active', current_date + 7, current_date + 7, 'simulated', 'sim_phase9_isabella_plan', '{"demo":true,"collection":"simulated"}'::jsonb
from plan_seed
where total_amount_cents > 0
on conflict (id) do update
set
  total_amount_cents = excluded.total_amount_cents,
  down_payment_cents = excluded.down_payment_cents,
  installment_amount_cents = excluded.installment_amount_cents,
  installment_count = excluded.installment_count,
  frequency = excluded.frequency,
  status = excluded.status,
  next_due_date = excluded.next_due_date,
  metadata = excluded.metadata,
  updated_at = now();

with installment_seed (payment_plan_id, installment_number, due_offset_months) as (
  values
    ('10000000-0000-4000-8000-000000009401'::uuid, 1, 0),
    ('10000000-0000-4000-8000-000000009401'::uuid, 2, 1),
    ('10000000-0000-4000-8000-000000009401'::uuid, 3, 2)
)
insert into public.payment_plan_installments (id, payment_plan_id, installment_number, due_date, amount_cents, status)
select
  ('10000000-0000-4000-8000-00000000940' || installment_seed.installment_number)::uuid,
  pp.id,
  installment_seed.installment_number,
  pp.start_date + make_interval(months => installment_seed.due_offset_months),
  case
    when installment_seed.installment_number = pp.installment_count then pp.total_amount_cents - pp.down_payment_cents - (pp.installment_amount_cents * (pp.installment_count - 1))
    else pp.installment_amount_cents
  end,
  case when installment_seed.installment_number = 1 then 'due' else 'scheduled' end
from installment_seed
join public.payment_plans pp on pp.id = installment_seed.payment_plan_id
on conflict (payment_plan_id, installment_number) do update
set
  due_date = excluded.due_date,
  amount_cents = excluded.amount_cents,
  status = case when public.payment_plan_installments.status = 'paid' then public.payment_plan_installments.status else excluded.status end,
  updated_at = now();

with notification_seed (id, email, type, title, body, action_url) as (
  values
    ('10000000-0000-4000-8000-000000009501'::uuid, 'isabella.m@example.com', 'balance_due', 'Balance available for simulated payment', 'A fictional development balance is available in your Avora portal.', '/portal/payments'),
    ('10000000-0000-4000-8000-000000009502'::uuid, 'isabella.m@example.com', 'consent_required', 'Consent requires signature', 'Please review and sign your fictional development consent.', '/portal/consents'),
    ('10000000-0000-4000-8000-000000009503'::uuid, 'camila.s@example.com', 'membership_billing', 'Membership renewal upcoming', 'Your fictional Avora Aesthetic membership renews soon in simulated billing mode.', '/portal/memberships')
)
insert into public.patient_notifications (id, organization_id, contact_id, type, title, body, status, action_url, metadata)
select notification_seed.id, contacts.organization_id, contacts.id, notification_seed.type, notification_seed.title, notification_seed.body, 'unread', notification_seed.action_url, '{"demo":true}'::jsonb
from notification_seed
join public.contacts contacts on lower(trim(contacts.email)) = notification_seed.email
on conflict (id) do update
set
  title = excluded.title,
  body = excluded.body,
  action_url = excluded.action_url,
  metadata = excluded.metadata,
  updated_at = now();

update public.clinical_documents
set
  patient_visible = true,
  patient_visible_at = coalesce(patient_visible_at, now()),
  portal_description = coalesce(portal_description, 'Fictional development document visible in the patient portal.'),
  updated_at = now()
where id = '10000000-0000-4000-8000-000000007801';

select
  (select count(*) from public.patient_accounts pa join public.organizations o on o.id = pa.organization_id where lower(trim(o.slug)) = 'avora') as patient_accounts,
  (select count(*) from public.membership_plans mp join public.organizations o on o.id = mp.organization_id where lower(trim(o.slug)) = 'avora') as membership_plans,
  (select count(*) from public.patient_memberships pm join public.organizations o on o.id = pm.organization_id where lower(trim(o.slug)) = 'avora') as patient_memberships,
  (select count(*) from public.payment_plans pp join public.organizations o on o.id = pp.organization_id where lower(trim(o.slug)) = 'avora') as payment_plans,
  (select count(*) from public.patient_notifications pn join public.organizations o on o.id = pn.organization_id where lower(trim(o.slug)) = 'avora') as patient_notifications;
