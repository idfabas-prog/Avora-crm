insert into public.permissions (key, description)
values
  ('portal.read', 'Read patient portal account and adoption data'),
  ('portal.manage', 'Invite and manage patient portal accounts'),
  ('portal.settings.manage', 'Manage patient portal settings'),
  ('memberships.read', 'Read membership plans and enrollments'),
  ('memberships.manage', 'Manage membership plans and patient enrollments'),
  ('payment_plans.read', 'Read patient payment plans'),
  ('payment_plans.manage', 'Create and manage patient payment plans'),
  ('portal.reports.read', 'Read portal, membership, and payment-plan reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'portal.read',
  'portal.manage',
  'portal.settings.manage',
  'memberships.read',
  'memberships.manage',
  'payment_plans.read',
  'payment_plans.manage',
  'portal.reports.read'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('portal.read', 'portal.manage', 'memberships.read', 'payment_plans.read', 'portal.reports.read')
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('portal.read', 'memberships.read', 'payment_plans.read')
where r.name = 'provider'
on conflict do nothing;

alter table public.clinical_documents
add column if not exists patient_visible boolean not null default false,
add column if not exists patient_visible_at timestamptz,
add column if not exists patient_visible_by uuid references public.user_profiles(id) on delete set null,
add column if not exists portal_description text;

create table public.portal_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portal_enabled boolean not null default true,
  brand_name text not null default 'Avora',
  support_email text,
  support_phone text,
  reschedule_minimum_notice_hours integer not null default 48 check (reschedule_minimum_notice_hours >= 0),
  cancellation_minimum_notice_hours integer not null default 24 check (cancellation_minimum_notice_hours >= 0),
  allow_balance_payments boolean not null default true,
  allow_memberships boolean not null default true,
  allow_payment_plans boolean not null default true,
  development_mode boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table public.patient_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled', 'archived')),
  invited_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  sms_reminders_enabled boolean not null default true,
  email_reminders_enabled boolean not null default true,
  billing_notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id)
);

create unique index patient_accounts_auth_user_org_idx
on public.patient_accounts (organization_id, auth_user_id)
where auth_user_id is not null;

create table public.portal_appointment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  request_type text not null check (request_type in ('reschedule', 'cancel')),
  requested_start_at timestamptz,
  reason text,
  status text not null default 'requested' check (status in ('requested', 'approved', 'declined', 'completed', 'cancelled')),
  resolved_by uuid references public.user_profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  billing_interval text not null check (billing_interval in ('monthly', 'quarterly', 'annual', 'custom')),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD',
  active boolean not null default true,
  stripe_price_id text,
  included_benefits_json jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create unique index membership_plans_stripe_price_idx
on public.membership_plans (stripe_price_id)
where stripe_price_id is not null;

create table public.patient_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  membership_plan_id uuid not null references public.membership_plans(id) on delete restrict,
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  start_date date not null default current_date,
  end_date date,
  next_billing_date date,
  stripe_subscription_id text,
  billing_status text not null default 'simulated' check (billing_status in ('simulated', 'trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'incomplete')),
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index patient_memberships_active_plan_idx
on public.patient_memberships (organization_id, contact_id, membership_plan_id)
where status in ('trial', 'active', 'past_due', 'paused');

create unique index patient_memberships_stripe_subscription_idx
on public.patient_memberships (stripe_subscription_id)
where stripe_subscription_id is not null;

create table public.membership_benefit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_membership_id uuid not null references public.patient_memberships(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  benefit_key text not null,
  event_type text not null check (event_type in ('grant', 'use', 'expire', 'restore', 'adjustment')),
  quantity integer not null check (quantity <> 0),
  balance_after integer,
  idempotency_key text not null,
  reason text,
  related_treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  total_amount_cents integer not null check (total_amount_cents >= 0),
  down_payment_cents integer not null default 0 check (down_payment_cents >= 0),
  installment_amount_cents integer not null check (installment_amount_cents >= 0),
  installment_count integer not null check (installment_count > 0),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'past_due', 'cancelled')),
  start_date date not null,
  next_due_date date,
  provider text not null default 'simulated' check (provider in ('simulated', 'stripe', 'manual', 'external')),
  external_plan_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payment_plans_external_plan_idx
on public.payment_plans (provider, external_plan_id)
where external_plan_id is not null;

create table public.payment_plan_installments (
  id uuid primary key default gen_random_uuid(),
  payment_plan_id uuid not null references public.payment_plans(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'due', 'paid', 'failed', 'past_due', 'cancelled')),
  payment_id uuid references public.payments(id) on delete set null,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_plan_id, installment_number)
);

create table public.patient_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  action_url text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger portal_settings_set_updated_at before update on public.portal_settings for each row execute function public.set_updated_at();
create trigger patient_accounts_set_updated_at before update on public.patient_accounts for each row execute function public.set_updated_at();
create trigger portal_appointment_requests_set_updated_at before update on public.portal_appointment_requests for each row execute function public.set_updated_at();
create trigger membership_plans_set_updated_at before update on public.membership_plans for each row execute function public.set_updated_at();
create trigger patient_memberships_set_updated_at before update on public.patient_memberships for each row execute function public.set_updated_at();
create trigger payment_plans_set_updated_at before update on public.payment_plans for each row execute function public.set_updated_at();
create trigger payment_plan_installments_set_updated_at before update on public.payment_plan_installments for each row execute function public.set_updated_at();
create trigger patient_notifications_set_updated_at before update on public.patient_notifications for each row execute function public.set_updated_at();

create index clinical_documents_patient_visible_idx on public.clinical_documents (organization_id, contact_id, patient_visible, status);
create index portal_settings_org_idx on public.portal_settings (organization_id);
create index patient_accounts_contact_idx on public.patient_accounts (contact_id);
create index patient_accounts_auth_idx on public.patient_accounts (auth_user_id);
create index patient_accounts_status_idx on public.patient_accounts (organization_id, status);
create index portal_appointment_requests_contact_idx on public.portal_appointment_requests (contact_id, created_at desc);
create index portal_appointment_requests_status_idx on public.portal_appointment_requests (organization_id, status);
create index membership_plans_org_idx on public.membership_plans (organization_id, active);
create index patient_memberships_contact_idx on public.patient_memberships (contact_id, status);
create index patient_memberships_plan_idx on public.patient_memberships (membership_plan_id);
create index membership_benefit_events_membership_idx on public.membership_benefit_events (patient_membership_id, benefit_key, created_at desc);
create index payment_plans_contact_idx on public.payment_plans (contact_id, status);
create index payment_plans_sale_idx on public.payment_plans (sale_id);
create index payment_plan_installments_plan_idx on public.payment_plan_installments (payment_plan_id, due_date);
create index payment_plan_installments_status_idx on public.payment_plan_installments (status, due_date);
create index patient_notifications_contact_idx on public.patient_notifications (contact_id, status, created_at desc);

create or replace function public.is_current_patient_contact(target_organization_id uuid, target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patient_accounts pa
    where pa.organization_id = target_organization_id
      and pa.contact_id = target_contact_id
      and pa.auth_user_id = auth.uid()
      and pa.status = 'active'
  );
$$;

create or replace function public.activate_patient_account_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_id uuid;
  user_email text;
begin
  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if auth.uid() is null or user_email = '' then
    return null;
  end if;

  update public.patient_accounts pa
  set
    auth_user_id = auth.uid(),
    status = 'active',
    activated_at = coalesce(pa.activated_at, now()),
    last_login_at = now()
  from public.contacts c
  where c.id = pa.contact_id
    and c.organization_id = pa.organization_id
    and lower(coalesce(c.email, '')) = user_email
    and pa.status in ('invited', 'active')
    and (pa.auth_user_id is null or pa.auth_user_id = auth.uid())
  returning pa.id into account_id;

  return account_id;
end;
$$;

create or replace function public.update_patient_safe_profile(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_sms_reminders boolean,
  p_email_reminders boolean,
  p_billing_notifications boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row record;
begin
  select *
  into account_row
  from public.patient_accounts
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;

  if account_row.id is null then
    raise exception 'Patient portal account not found';
  end if;

  update public.contacts
  set
    first_name = nullif(trim(p_first_name), ''),
    last_name = nullif(trim(p_last_name), ''),
    phone = nullif(trim(p_phone), ''),
    updated_at = now()
  where id = account_row.contact_id
    and organization_id = account_row.organization_id;

  update public.patient_accounts
  set
    sms_reminders_enabled = p_sms_reminders,
    email_reminders_enabled = p_email_reminders,
    billing_notifications_enabled = p_billing_notifications
  where id = account_row.id;
end;
$$;

create or replace function public.sign_patient_consent(target_consent_id uuid, signer_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  consent_row record;
begin
  select cr.*
  into consent_row
  from public.consent_records cr
  where cr.id = target_consent_id
    and public.is_current_patient_contact(cr.organization_id, cr.contact_id)
    and cr.status in ('required', 'pending');

  if consent_row.id is null then
    raise exception 'Consent is not available for signing';
  end if;

  update public.consent_records
  set
    signed_by_name = nullif(trim(signer_name), ''),
    signed_at = now(),
    signature_reference = 'portal-dev-signature-' || target_consent_id::text,
    status = 'signed',
    simulated_signature = true,
    updated_at = now()
  where id = target_consent_id;

  insert into public.audit_logs (organization_id, actor_id, action, entity_table, entity_id, metadata)
  values (consent_row.organization_id, null, 'Portal Consent Signed', 'consent_records', target_consent_id, jsonb_build_object('contact_id', consent_row.contact_id, 'simulated', true));

  return target_consent_id;
end;
$$;

create or replace function public.record_patient_simulated_payment(target_sale_id uuid, p_amount_cents integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sale_row record;
  payment_id uuid;
begin
  if p_amount_cents <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  select s.*
  into sale_row
  from public.sales s
  where s.id = target_sale_id
    and public.is_current_patient_contact(s.organization_id, s.contact_id);

  if sale_row.id is null then
    raise exception 'Sale is not available for portal payment';
  end if;

  if sale_row.balance_due_cents <= 0 then
    raise exception 'No balance is due for this sale';
  end if;

  insert into public.payments (
    organization_id,
    location_id,
    contact_id,
    sale_id,
    amount_cents,
    currency,
    payment_method,
    payment_provider,
    payment_purpose,
    provider_payment_id,
    status,
    received_at,
    notes,
    external_reference,
    simulated
  )
  values (
    sale_row.organization_id,
    sale_row.location_id,
    sale_row.contact_id,
    sale_row.id,
    least(p_amount_cents, sale_row.balance_due_cents),
    sale_row.currency,
    'card',
    'portal_simulated',
    'installment',
    'portal_sim_' || gen_random_uuid()::text,
    'succeeded',
    now(),
    'Development-safe patient portal simulated payment.',
    'PORTAL-SIM',
    true
  )
  returning id into payment_id;

  insert into public.audit_logs (organization_id, actor_id, action, entity_table, entity_id, metadata)
  values (sale_row.organization_id, null, 'Portal Payment Initiated', 'payments', payment_id, jsonb_build_object('contact_id', sale_row.contact_id, 'sale_id', sale_row.id, 'simulated', true));

  return payment_id;
end;
$$;

alter table public.portal_settings enable row level security;
alter table public.patient_accounts enable row level security;
alter table public.portal_appointment_requests enable row level security;
alter table public.membership_plans enable row level security;
alter table public.patient_memberships enable row level security;
alter table public.membership_benefit_events enable row level security;
alter table public.payment_plans enable row level security;
alter table public.payment_plan_installments enable row level security;
alter table public.patient_notifications enable row level security;

create policy "tenant portal settings read" on public.portal_settings for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.read'));
create policy "tenant portal settings manage" on public.portal_settings for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.settings.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.settings.manage'));
create policy "patient portal settings read" on public.portal_settings for select
using (exists (select 1 from public.patient_accounts pa where pa.organization_id = portal_settings.organization_id and pa.auth_user_id = auth.uid() and pa.status = 'active'));

create policy "tenant patient accounts read" on public.patient_accounts for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.read'));
create policy "tenant patient accounts manage" on public.patient_accounts for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.manage'));
create policy "patient account self read" on public.patient_accounts for select
using (auth_user_id = auth.uid() and status = 'active');

create policy "tenant portal appointment requests read" on public.portal_appointment_requests for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.read'));
create policy "tenant portal appointment requests manage" on public.portal_appointment_requests for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.manage'));
create policy "patient portal appointment requests read" on public.portal_appointment_requests for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient portal appointment requests create" on public.portal_appointment_requests for insert
with check (public.is_current_patient_contact(organization_id, contact_id));

create policy "tenant membership plans read" on public.membership_plans for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.read'));
create policy "tenant membership plans manage" on public.membership_plans for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.manage'));
create policy "patient membership plans read" on public.membership_plans for select
using (active and exists (select 1 from public.patient_accounts pa where pa.organization_id = membership_plans.organization_id and pa.auth_user_id = auth.uid() and pa.status = 'active'));

create policy "tenant patient memberships read" on public.patient_memberships for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.read'));
create policy "tenant patient memberships manage" on public.patient_memberships for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.manage'));
create policy "patient memberships read" on public.patient_memberships for select
using (public.is_current_patient_contact(organization_id, contact_id));

create policy "tenant membership benefit events read" on public.membership_benefit_events for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.read'));
create policy "tenant membership benefit events manage" on public.membership_benefit_events for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('memberships.manage'));
create policy "patient membership benefit events read" on public.membership_benefit_events for select
using (public.is_current_patient_contact(organization_id, contact_id));

create policy "tenant payment plans read" on public.payment_plans for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('payment_plans.read'));
create policy "tenant payment plans manage" on public.payment_plans for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('payment_plans.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('payment_plans.manage'));
create policy "patient payment plans read" on public.payment_plans for select
using (public.is_current_patient_contact(organization_id, contact_id));

create policy "tenant payment plan installments read" on public.payment_plan_installments for select
using (exists (select 1 from public.payment_plans pp where pp.id = payment_plan_id and pp.organization_id in (select public.current_organization_ids()) and public.has_permission('payment_plans.read')));
create policy "tenant payment plan installments manage" on public.payment_plan_installments for all
using (exists (select 1 from public.payment_plans pp where pp.id = payment_plan_id and pp.organization_id in (select public.current_organization_ids()) and public.has_permission('payment_plans.manage')))
with check (exists (select 1 from public.payment_plans pp where pp.id = payment_plan_id and pp.organization_id in (select public.current_organization_ids()) and public.has_permission('payment_plans.manage')));
create policy "patient payment plan installments read" on public.payment_plan_installments for select
using (exists (select 1 from public.payment_plans pp where pp.id = payment_plan_id and public.is_current_patient_contact(pp.organization_id, pp.contact_id)));

create policy "tenant patient notifications read" on public.patient_notifications for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.read'));
create policy "tenant patient notifications manage" on public.patient_notifications for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('portal.manage'));
create policy "patient notifications read" on public.patient_notifications for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient notifications update status" on public.patient_notifications for update
using (public.is_current_patient_contact(organization_id, contact_id))
with check (public.is_current_patient_contact(organization_id, contact_id) and status in ('read', 'dismissed'));

create policy "patient contacts read own portal profile" on public.contacts for select
using (public.is_current_patient_contact(organization_id, id));
create policy "patient locations read own locations" on public.locations for select
using (exists (select 1 from public.patient_accounts pa join public.contacts c on c.id = pa.contact_id where pa.organization_id = locations.organization_id and c.location_id = locations.id and pa.auth_user_id = auth.uid() and pa.status = 'active'));
create policy "patient appointment types read own appointments" on public.appointment_types for select
using (exists (select 1 from public.appointments a where a.appointment_type_id = appointment_types.id and public.is_current_patient_contact(a.organization_id, a.contact_id)));
create policy "patient appointments read own" on public.appointments for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient sales read own balances" on public.sales for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient sale items read own" on public.sale_items for select
using (exists (select 1 from public.sales s where s.id = sale_id and public.is_current_patient_contact(s.organization_id, s.contact_id)));
create policy "patient payments read own" on public.payments for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient refunds read own" on public.refunds for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient package entitlements read own" on public.package_entitlements for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient treatment sessions read own summaries" on public.treatment_sessions for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient consent records read own" on public.consent_records for select
using (public.is_current_patient_contact(organization_id, contact_id));
create policy "patient consent templates read assigned" on public.consent_templates for select
using (exists (select 1 from public.consent_records cr where cr.consent_template_id = consent_templates.id and public.is_current_patient_contact(cr.organization_id, cr.contact_id)));
create policy "patient clinical documents read visible own" on public.clinical_documents for select
using (patient_visible and status = 'active' and public.is_current_patient_contact(organization_id, contact_id));

revoke all on function public.is_current_patient_contact(uuid, uuid) from public;
revoke all on function public.activate_patient_account_for_current_user() from public;
revoke all on function public.update_patient_safe_profile(text, text, text, boolean, boolean, boolean) from public;
revoke all on function public.sign_patient_consent(uuid, text) from public;
revoke all on function public.record_patient_simulated_payment(uuid, integer) from public;
grant execute on function public.is_current_patient_contact(uuid, uuid) to authenticated;
grant execute on function public.activate_patient_account_for_current_user() to authenticated;
grant execute on function public.update_patient_safe_profile(text, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.sign_patient_consent(uuid, text) to authenticated;
grant execute on function public.record_patient_simulated_payment(uuid, integer) to authenticated;
