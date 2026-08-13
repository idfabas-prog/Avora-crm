insert into public.permissions (key, description)
values
  ('clinical.read', 'Read clinical overview records'),
  ('clinical.write', 'Create and update clinical operational records'),
  ('clinical.notes.read', 'Read clinical notes'),
  ('clinical.notes.write', 'Create clinical notes and addenda'),
  ('clinical.notes.sign', 'Sign clinical notes and session documentation'),
  ('clinical.photos.read', 'Read clinical photo metadata'),
  ('clinical.photos.write', 'Upload clinical photo metadata'),
  ('clinical.documents.read', 'Read clinical document metadata'),
  ('clinical.documents.write', 'Upload clinical document metadata'),
  ('clinical.consents.read', 'Read clinical consent records'),
  ('clinical.consents.manage', 'Manage and sign consent records'),
  ('clinical.treatment_plans.read', 'Read treatment plans'),
  ('clinical.treatment_plans.write', 'Create and update treatment plans'),
  ('clinical.sessions.read', 'Read treatment sessions'),
  ('clinical.sessions.write', 'Create and update treatment sessions'),
  ('clinical.entitlements.read', 'Read package entitlements and remaining sessions'),
  ('clinical.entitlements.adjust', 'Adjust clinical entitlements'),
  ('clinical.templates.manage', 'Manage clinical templates and service settings'),
  ('clinical.audit.read', 'Read clinical audit trail')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'clinical.%'
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'clinical.read',
  'clinical.write',
  'clinical.notes.read',
  'clinical.notes.write',
  'clinical.photos.read',
  'clinical.photos.write',
  'clinical.documents.read',
  'clinical.documents.write',
  'clinical.consents.read',
  'clinical.consents.manage',
  'clinical.treatment_plans.read',
  'clinical.treatment_plans.write',
  'clinical.sessions.read',
  'clinical.sessions.write',
  'clinical.entitlements.read',
  'clinical.audit.read'
)
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'clinical.read',
  'clinical.write',
  'clinical.notes.read',
  'clinical.notes.write',
  'clinical.notes.sign',
  'clinical.photos.read',
  'clinical.photos.write',
  'clinical.documents.read',
  'clinical.documents.write',
  'clinical.consents.read',
  'clinical.consents.manage',
  'clinical.treatment_plans.read',
  'clinical.treatment_plans.write',
  'clinical.sessions.read',
  'clinical.sessions.write',
  'clinical.entitlements.read',
  'clinical.audit.read'
)
where r.name = 'provider'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'clinical.entitlements.read'
where r.name = 'salesperson'
on conflict do nothing;

create table public.clinical_service_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  requires_clinical_session boolean not null default true,
  requires_consent boolean not null default false,
  requires_photo_tracking boolean not null default false,
  requires_provider boolean not null default true,
  allow_package_entitlement boolean not null default true,
  default_followup_days integer check (default_followup_days is null or default_followup_days >= 0),
  entitlement_policy text not null default 'after_successful_payment' check (entitlement_policy in ('sale_created', 'after_deposit', 'after_successful_payment', 'sale_paid', 'manual_activation')),
  warning_only_missing_consent boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_id)
);

create table public.clinical_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  primary_location_id uuid references public.locations(id) on delete set null,
  clinical_status text not null default 'active' check (clinical_status in ('active', 'inactive', 'completed', 'on_hold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id)
);

create table public.package_entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  entitlement_type text not null default 'treatment_session' check (entitlement_type in ('treatment_session', 'complimentary', 'manual')),
  total_quantity integer not null check (total_quantity >= 0),
  used_quantity integer not null default 0 check (used_quantity >= 0),
  remaining_quantity integer not null default 0 check (remaining_quantity >= 0),
  status text not null default 'active' check (status in ('active', 'fully_used', 'expired', 'cancelled', 'refunded')),
  purchased_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (package_id is not null or service_id is not null or entitlement_type in ('complimentary', 'manual')),
  unique (organization_id, sale_item_id, service_id)
);

create table public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  provider_id uuid references public.user_profiles(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled', 'on_hold')),
  start_date date not null default current_date,
  target_completion_date date,
  completed_at timestamptz,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_id uuid not null references public.treatment_plans(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  package_entitlement_id uuid references public.package_entitlements(id) on delete set null,
  planned_sessions integer not null default 1 check (planned_sessions > 0),
  completed_sessions integer not null default 0 check (completed_sessions >= 0),
  interval_days integer check (interval_days is null or interval_days >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  treatment_plan_id uuid references public.treatment_plans(id) on delete set null,
  treatment_plan_item_id uuid references public.treatment_plan_items(id) on delete set null,
  package_entitlement_id uuid references public.package_entitlements(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  provider_id uuid references public.user_profiles(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')),
  documentation_status text not null default 'draft' check (documentation_status in ('draft', 'completed', 'signed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  signed_at timestamptz,
  signed_by uuid references public.user_profiles(id) on delete set null,
  session_number integer check (session_number is null or session_number > 0),
  treatment_area text,
  documentation_json jsonb not null default '{}'::jsonb,
  clinical_summary text,
  aftercare_plan text,
  followup_plan text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, appointment_id, service_id)
);

create table public.treatment_entitlement_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entitlement_id uuid not null references public.package_entitlements(id) on delete cascade,
  treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  event_type text not null check (event_type in ('grant', 'use', 'restore', 'expire', 'cancel', 'adjustment')),
  quantity integer not null check (quantity <> 0),
  reason text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index treatment_entitlement_events_session_once_idx
on public.treatment_entitlement_events (entitlement_id, treatment_session_id, event_type)
where treatment_session_id is not null and event_type in ('use', 'restore');

create table public.clinical_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  template_type text not null default 'treatment_documentation' check (template_type in ('treatment_documentation', 'followup', 'photo_protocol')),
  schema_json jsonb not null default '{"fields":[]}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_id, name, template_type)
);

create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  treatment_plan_id uuid references public.treatment_plans(id) on delete set null,
  author_user_id uuid references public.user_profiles(id) on delete set null,
  note_type text not null default 'general_clinical' check (note_type in ('general_clinical', 'follow_up', 'treatment', 'provider', 'clinical_communication')),
  body text not null,
  locked_at timestamptz,
  signed_at timestamptz,
  signed_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinical_note_addenda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinical_note_id uuid not null references public.clinical_notes(id) on delete cascade,
  author_user_id uuid references public.user_profiles(id) on delete set null,
  addendum_text text not null,
  created_at timestamptz not null default now()
);

create table public.consent_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  version integer not null default 1 check (version > 0),
  content_reference text,
  content_text text,
  consent_type text not null default 'treatment' check (consent_type in ('treatment', 'clinical_photo', 'marketing_photo', 'other')),
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service_id, name, version)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  consent_template_id uuid references public.consent_templates(id) on delete set null,
  consent_template_version integer not null default 1,
  treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  signed_by_name text,
  signed_at timestamptz,
  signature_reference text,
  status text not null default 'pending' check (status in ('required', 'pending', 'signed', 'declined', 'expired', 'replaced')),
  simulated_signature boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id, consent_template_id, treatment_session_id)
);

create table public.clinical_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  treatment_plan_id uuid references public.treatment_plans(id) on delete set null,
  document_type text not null default 'other' check (document_type in ('consent', 'external_record', 'lab', 'treatment_document', 'referral', 'other')),
  filename text not null,
  storage_bucket text not null default 'clinical-files',
  storage_path text not null,
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  description text,
  sensitive boolean not null default true,
  status text not null default 'active' check (status in ('active', 'archived', 'voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, storage_bucket, storage_path)
);

create table public.clinical_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  photo_type text not null default 'progress' check (photo_type in ('before', 'after', 'progress', 'treatment', 'other')),
  body_area text,
  capture_date date not null default current_date,
  storage_bucket text not null default 'clinical-files',
  storage_path text not null,
  uploaded_by uuid references public.user_profiles(id) on delete set null,
  notes text,
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_bucket, storage_path)
);

create table public.treatment_followups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  treatment_session_id uuid references public.treatment_sessions(id) on delete cascade,
  provider_id uuid references public.user_profiles(id) on delete set null,
  due_at timestamptz not null,
  completed_at timestamptz,
  status text not null default 'due' check (status in ('due', 'scheduled', 'completed', 'overdue', 'cancelled')),
  followup_type text not null default 'custom',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, treatment_session_id, followup_type, due_at)
);

create trigger clinical_service_settings_set_updated_at before update on public.clinical_service_settings for each row execute function public.set_updated_at();
create trigger clinical_profiles_set_updated_at before update on public.clinical_profiles for each row execute function public.set_updated_at();
create trigger package_entitlements_set_updated_at before update on public.package_entitlements for each row execute function public.set_updated_at();
create trigger treatment_plans_set_updated_at before update on public.treatment_plans for each row execute function public.set_updated_at();
create trigger treatment_plan_items_set_updated_at before update on public.treatment_plan_items for each row execute function public.set_updated_at();
create trigger treatment_sessions_set_updated_at before update on public.treatment_sessions for each row execute function public.set_updated_at();
create trigger clinical_templates_set_updated_at before update on public.clinical_templates for each row execute function public.set_updated_at();
create trigger clinical_notes_set_updated_at before update on public.clinical_notes for each row execute function public.set_updated_at();
create trigger consent_templates_set_updated_at before update on public.consent_templates for each row execute function public.set_updated_at();
create trigger consent_records_set_updated_at before update on public.consent_records for each row execute function public.set_updated_at();
create trigger clinical_documents_set_updated_at before update on public.clinical_documents for each row execute function public.set_updated_at();
create trigger treatment_followups_set_updated_at before update on public.treatment_followups for each row execute function public.set_updated_at();

create index clinical_service_settings_org_idx on public.clinical_service_settings (organization_id, active);
create index clinical_profiles_contact_idx on public.clinical_profiles (contact_id);
create index package_entitlements_contact_idx on public.package_entitlements (contact_id, status);
create index package_entitlements_remaining_idx on public.package_entitlements (organization_id, remaining_quantity, status);
create index treatment_plans_contact_idx on public.treatment_plans (contact_id, status);
create index treatment_plan_items_entitlement_idx on public.treatment_plan_items (package_entitlement_id);
create index treatment_sessions_contact_idx on public.treatment_sessions (contact_id, scheduled_at desc);
create index treatment_sessions_provider_due_idx on public.treatment_sessions (provider_id, scheduled_at);
create index treatment_sessions_entitlement_idx on public.treatment_sessions (package_entitlement_id);
create index treatment_entitlement_events_entitlement_idx on public.treatment_entitlement_events (entitlement_id, created_at desc);
create index clinical_templates_service_idx on public.clinical_templates (organization_id, service_id, active);
create index clinical_notes_contact_idx on public.clinical_notes (contact_id, created_at desc);
create index clinical_note_addenda_note_idx on public.clinical_note_addenda (clinical_note_id, created_at desc);
create index consent_templates_service_idx on public.consent_templates (organization_id, service_id, active);
create index consent_records_contact_idx on public.consent_records (contact_id, status);
create index clinical_documents_contact_idx on public.clinical_documents (contact_id, document_type);
create index clinical_photos_contact_idx on public.clinical_photos (contact_id, capture_date desc);
create index treatment_followups_due_idx on public.treatment_followups (organization_id, status, due_at);
create index treatment_followups_provider_idx on public.treatment_followups (provider_id, status, due_at);

create or replace function public.refresh_package_entitlement_usage(target_entitlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  used_total integer;
  adjustment_total integer;
  target_status text;
begin
  select coalesce(sum(case
    when event_type = 'use' then quantity
    when event_type = 'restore' then -quantity
    else 0
  end), 0)
  into used_total
  from public.treatment_entitlement_events
  where entitlement_id = target_entitlement_id;

  select coalesce(sum(case
    when event_type = 'adjustment' then quantity
    else 0
  end), 0)
  into adjustment_total
  from public.treatment_entitlement_events
  where entitlement_id = target_entitlement_id;

  update public.package_entitlements
  set
    used_quantity = greatest(used_total, 0),
    remaining_quantity = greatest(total_quantity + adjustment_total - greatest(used_total, 0), 0),
    status = case
      when status in ('cancelled', 'refunded', 'expired') then status
      when greatest(total_quantity + adjustment_total - greatest(used_total, 0), 0) = 0 then 'fully_used'
      else 'active'
    end,
    updated_at = now()
  where id = target_entitlement_id
  returning status into target_status;
end;
$$;

create or replace function public.refresh_package_entitlement_usage_from_event()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_package_entitlement_usage(coalesce(new.entitlement_id, old.entitlement_id));
  return coalesce(new, old);
end;
$$;

create trigger treatment_entitlement_events_refresh_entitlement
after insert or update or delete on public.treatment_entitlement_events
for each row execute function public.refresh_package_entitlement_usage_from_event();

create or replace function public.create_clinical_entitlements_for_sale(target_sale_id uuid, actor_user_id uuid default auth.uid())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  with sale_context as (
    select s.id, s.organization_id, s.location_id, s.contact_id, s.sale_date
    from public.sales s
    where s.id = target_sale_id
      and exists (
        select 1
        from public.payments p
        where p.sale_id = s.id
          and p.status = 'succeeded'
      )
  ),
  entitlement_rows as (
    select
      sc.organization_id,
      sc.location_id,
      sc.contact_id,
      sc.id as sale_id,
      si.id as sale_item_id,
      si.package_id,
      pi.service_id,
      'treatment_session'::text as entitlement_type,
      greatest(si.quantity * pi.quantity, 1)::integer as total_quantity,
      sc.sale_date as purchased_at
    from sale_context sc
    join public.sale_items si on si.sale_id = sc.id and si.package_id is not null
    join public.package_items pi on pi.package_id = si.package_id
    left join public.clinical_service_settings css on css.organization_id = sc.organization_id and css.service_id = pi.service_id
    where coalesce(css.allow_package_entitlement, true)
      and coalesce(css.entitlement_policy, 'after_successful_payment') in ('after_successful_payment', 'after_deposit', 'sale_created', 'sale_paid')
    union all
    select
      sc.organization_id,
      sc.location_id,
      sc.contact_id,
      sc.id as sale_id,
      si.id as sale_item_id,
      null::uuid as package_id,
      si.service_id,
      'treatment_session'::text as entitlement_type,
      greatest(si.quantity, 1)::integer as total_quantity,
      sc.sale_date as purchased_at
    from sale_context sc
    join public.sale_items si on si.sale_id = sc.id and si.service_id is not null
    join public.clinical_service_settings css on css.organization_id = sc.organization_id and css.service_id = si.service_id and css.allow_package_entitlement
    where css.entitlement_policy in ('after_successful_payment', 'after_deposit', 'sale_created', 'sale_paid')
  ),
  inserted as (
    insert into public.package_entitlements (
      organization_id,
      location_id,
      contact_id,
      sale_id,
      sale_item_id,
      package_id,
      service_id,
      entitlement_type,
      total_quantity,
      remaining_quantity,
      status,
      purchased_at
    )
    select organization_id, location_id, contact_id, sale_id, sale_item_id, package_id, service_id, entitlement_type, total_quantity, total_quantity, 'active', purchased_at
    from entitlement_rows
    on conflict (organization_id, sale_item_id, service_id) do nothing
    returning id, organization_id, total_quantity
  ),
  grants as (
    insert into public.treatment_entitlement_events (organization_id, entitlement_id, event_type, quantity, reason, created_by)
    select i.organization_id, i.id, 'grant', i.total_quantity, 'Granted from eligible paid sale item.', actor_user_id
    from inserted i
    on conflict do nothing
    returning id
  )
  select count(*) into inserted_count from inserted;

  return inserted_count;
end;
$$;

alter table public.clinical_service_settings enable row level security;
alter table public.clinical_profiles enable row level security;
alter table public.package_entitlements enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_items enable row level security;
alter table public.treatment_sessions enable row level security;
alter table public.treatment_entitlement_events enable row level security;
alter table public.clinical_templates enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.clinical_note_addenda enable row level security;
alter table public.consent_templates enable row level security;
alter table public.consent_records enable row level security;
alter table public.clinical_documents enable row level security;
alter table public.clinical_photos enable row level security;
alter table public.treatment_followups enable row level security;

create policy "tenant clinical service settings read" on public.clinical_service_settings for select
using (organization_id in (select public.current_organization_ids()) and (public.has_permission('clinical.read') or public.has_permission('clinical.templates.manage')));
create policy "tenant clinical service settings manage" on public.clinical_service_settings for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.templates.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.templates.manage'));

create policy "tenant clinical profiles read" on public.clinical_profiles for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.read'));
create policy "tenant clinical profiles write" on public.clinical_profiles for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.write'));

create policy "tenant package entitlements read" on public.package_entitlements for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('clinical.entitlements.read')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = package_entitlements.location_id))
);
create policy "tenant package entitlements write" on public.package_entitlements for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.entitlements.adjust'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.entitlements.adjust'));

create policy "tenant treatment plans read" on public.treatment_plans for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.treatment_plans.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_plans.location_id)));
create policy "tenant treatment plans write" on public.treatment_plans for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.treatment_plans.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.treatment_plans.write') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_plans.location_id)));

create policy "tenant treatment plan items access" on public.treatment_plan_items for all
using (exists (select 1 from public.treatment_plans tp where tp.id = treatment_plan_id and tp.organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.treatment_plans.read')))
with check (exists (select 1 from public.treatment_plans tp where tp.id = treatment_plan_id and tp.organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.treatment_plans.write')));

create policy "tenant treatment sessions read" on public.treatment_sessions for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.sessions.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_sessions.location_id)));
create policy "tenant treatment sessions write" on public.treatment_sessions for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.sessions.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.sessions.write') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_sessions.location_id)));

create policy "tenant treatment entitlement events read" on public.treatment_entitlement_events for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.entitlements.read'));
create policy "tenant treatment entitlement events insert" on public.treatment_entitlement_events for insert
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('clinical.sessions.write') or public.has_permission('clinical.entitlements.adjust')));

create policy "tenant clinical templates read" on public.clinical_templates for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.read'));
create policy "tenant clinical templates manage" on public.clinical_templates for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.templates.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.templates.manage'));

create policy "tenant clinical notes read" on public.clinical_notes for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.notes.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = clinical_notes.location_id)));
create policy "tenant clinical notes insert" on public.clinical_notes for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.notes.write') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = clinical_notes.location_id)));
create policy "tenant clinical notes update unsigned" on public.clinical_notes for update
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.notes.write') and locked_at is null)
with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('clinical.notes.write') or public.has_permission('clinical.notes.sign')));

create policy "tenant clinical note addenda access" on public.clinical_note_addenda for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.notes.read'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.notes.write'));

create policy "tenant consent templates read" on public.consent_templates for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.consents.read'));
create policy "tenant consent templates manage" on public.consent_templates for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.consents.manage'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.consents.manage'));

create policy "tenant consent records access" on public.consent_records for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.consents.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = consent_records.location_id)))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.consents.manage') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = consent_records.location_id)));

create policy "tenant clinical documents read" on public.clinical_documents for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.documents.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = clinical_documents.location_id)));
create policy "tenant clinical documents write" on public.clinical_documents for insert
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.documents.write') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = clinical_documents.location_id)));
create policy "tenant clinical documents archive" on public.clinical_documents for update
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.documents.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.documents.write'));

create policy "tenant clinical photos read" on public.clinical_photos for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.photos.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = clinical_photos.location_id)));
create policy "tenant clinical photos write" on public.clinical_photos for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.photos.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.photos.write') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = clinical_photos.location_id)));

create policy "tenant treatment followups read" on public.treatment_followups for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.sessions.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_followups.location_id)));
create policy "tenant treatment followups write" on public.treatment_followups for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.sessions.write'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('clinical.sessions.write') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = treatment_followups.location_id)));

insert into storage.buckets (id, name, public)
values ('clinical-files', 'clinical-files', false)
on conflict (id) do update set public = false;

create policy "clinical files read" on storage.objects for select
using (bucket_id = 'clinical-files' and public.has_permission('clinical.documents.read'));
create policy "clinical files upload" on storage.objects for insert
with check (bucket_id = 'clinical-files' and (public.has_permission('clinical.documents.write') or public.has_permission('clinical.photos.write')));
create policy "clinical files update" on storage.objects for update
using (bucket_id = 'clinical-files' and (public.has_permission('clinical.documents.write') or public.has_permission('clinical.photos.write')))
with check (bucket_id = 'clinical-files' and (public.has_permission('clinical.documents.write') or public.has_permission('clinical.photos.write')));

revoke all on function public.refresh_package_entitlement_usage(uuid) from public;
revoke all on function public.create_clinical_entitlements_for_sale(uuid, uuid) from public;
grant execute on function public.create_clinical_entitlements_for_sale(uuid, uuid) to authenticated;
