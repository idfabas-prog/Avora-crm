insert into public.permissions (key, description)
values
  ('workforce.read', 'Read workforce dashboard data'),
  ('workforce.schedule.read', 'Read staff schedules'),
  ('workforce.schedule.write', 'Create and update staff schedules'),
  ('workforce.timeclock.use', 'Use the employee time clock'),
  ('workforce.time_entries.read', 'Read time entries'),
  ('workforce.time_entries.manage', 'Manage and correct time entries'),
  ('workforce.timesheets.read', 'Read timesheets'),
  ('workforce.timesheets.approve', 'Approve timesheets'),
  ('workforce.pto.read', 'Read PTO balances and requests'),
  ('workforce.pto.request', 'Request PTO'),
  ('workforce.pto.manage', 'Manage PTO policies and requests'),
  ('workforce.compensation.read', 'Read compensation and labor cost estimates'),
  ('workforce.compensation.manage', 'Manage compensation settings'),
  ('workforce.payroll_export', 'Export payroll support CSV files'),
  ('workforce.reports.read', 'Read workforce reports'),
  ('workforce.settings.manage', 'Manage workforce settings')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'workforce.%'
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workforce.read',
  'workforce.schedule.read',
  'workforce.schedule.write',
  'workforce.time_entries.read',
  'workforce.time_entries.manage',
  'workforce.timesheets.read',
  'workforce.timesheets.approve',
  'workforce.pto.read',
  'workforce.pto.manage',
  'workforce.reports.read',
  'workforce.settings.manage'
)
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'workforce.read',
  'workforce.schedule.read',
  'workforce.timeclock.use',
  'workforce.time_entries.read',
  'workforce.pto.read',
  'workforce.pto.request',
  'workforce.timesheets.read'
)
where r.name in ('provider', 'salesperson')
on conflict do nothing;

create table public.workforce_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pay_frequency text not null default 'biweekly' check (pay_frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  overtime_weekly_threshold_minutes integer not null default 2400 check (overtime_weekly_threshold_minutes > 0),
  overtime_multiplier numeric(5,2) not null default 1.50 check (overtime_multiplier >= 1),
  annual_salary_work_minutes integer not null default 124800 check (annual_salary_work_minutes > 0),
  early_clock_in_grace_minutes integer not null default 15 check (early_clock_in_grace_minutes >= 0),
  late_clock_in_grace_minutes integer not null default 7 check (late_clock_in_grace_minutes >= 0),
  default_unpaid_break_minutes integer not null default 30 check (default_unpaid_break_minutes >= 0),
  require_scheduled_shift boolean not null default false,
  allow_unscheduled_clock_in boolean not null default true,
  missing_clock_out_threshold_minutes integer not null default 720 check (missing_clock_out_threshold_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table public.employment_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  employee_number text,
  employment_type text not null default 'hourly' check (employment_type in ('hourly', 'salary', 'contractor', 'per_diem', 'other')),
  primary_location_id uuid references public.locations(id) on delete set null,
  job_title text not null,
  department text,
  hire_date date,
  termination_date date,
  status text not null default 'active' check (status in ('active', 'leave', 'inactive', 'terminated')),
  hourly_rate_cents integer check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  annual_salary_cents integer check (annual_salary_cents is null or annual_salary_cents >= 0),
  overtime_eligible boolean not null default true,
  overtime_multiplier numeric(5,2) not null default 1.50 check (overtime_multiplier >= 1),
  default_weekly_hours numeric(6,2) check (default_weekly_hours is null or default_weekly_hours >= 0),
  payroll_external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, employee_number)
);

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  unpaid_break_minutes integer not null default 0 check (unpaid_break_minutes >= 0),
  role_filter text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, name)
);

create table public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  shift_date date not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'completed', 'missed', 'cancelled', 'time_off')),
  notes text,
  published boolean not null default false,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);

create table public.recurring_shift_patterns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  weekdays integer[] not null default '{}',
  effective_start date not null,
  effective_end date,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_end is null or effective_end >= effective_start)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  shift_id uuid references public.staff_shifts(id) on delete set null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  status text not null default 'open' check (status in ('open', 'completed', 'edited', 'approved', 'rejected')),
  source text not null default 'staff_clock' check (source in ('staff_clock', 'manager_entry', 'import', 'adjustment')),
  approved boolean not null default false,
  approved_by uuid references public.user_profiles(id) on delete set null,
  approved_at timestamptz,
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  unpaid_break_minutes integer not null default 0 check (unpaid_break_minutes >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_out_at is null or clock_out_at >= clock_in_at)
);

create unique index time_entries_one_open_per_user_idx
on public.time_entries (organization_id, user_id)
where status = 'open' and clock_out_at is null;

create table public.time_entry_breaks (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create unique index time_entry_breaks_one_open_idx
on public.time_entry_breaks (time_entry_id)
where end_at is null;

create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  pay_date date,
  status text not null default 'open' check (status in ('open', 'review', 'approved', 'exported', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (organization_id, start_date, end_date)
);

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pay_period_id uuid not null references public.pay_periods(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  scheduled_minutes integer not null default 0 check (scheduled_minutes >= 0),
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  regular_minutes integer not null default 0 check (regular_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  pto_minutes integer not null default 0 check (pto_minutes >= 0),
  total_payable_minutes integer not null default 0 check (total_payable_minutes >= 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'reopened')),
  approved_by uuid references public.user_profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pay_period_id, user_id)
);

create table public.pto_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  accrual_type text not null default 'manual' check (accrual_type in ('accrual', 'annual_grant', 'manual', 'unlimited')),
  accrual_rate numeric(10,4) not null default 0 check (accrual_rate >= 0),
  accrual_cap_minutes integer check (accrual_cap_minutes is null or accrual_cap_minutes >= 0),
  annual_grant_minutes integer check (annual_grant_minutes is null or annual_grant_minutes >= 0),
  carryover_limit_minutes integer check (carryover_limit_minutes is null or carryover_limit_minutes >= 0),
  employment_type_filter text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.pto_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  policy_id uuid not null references public.pto_policies(id) on delete cascade,
  available_minutes integer not null default 0,
  used_minutes integer not null default 0 check (used_minutes >= 0),
  pending_minutes integer not null default 0 check (pending_minutes >= 0),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, policy_id)
);

create table public.pto_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  policy_id uuid not null references public.pto_policies(id) on delete cascade,
  event_type text not null check (event_type in ('grant', 'accrual', 'use', 'restore', 'adjustment', 'expire')),
  minutes integer not null check (minutes <> 0),
  reason text,
  source text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pto_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  policy_id uuid references public.pto_policies(id) on delete set null,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  requested_minutes integer not null check (requested_minutes > 0),
  reason text,
  request_type text not null default 'pto' check (request_type in ('pto', 'sick', 'unpaid', 'other')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.organization_holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  paid boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, holiday_date, name)
);

create table public.time_entry_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  edited_by uuid references public.user_profiles(id) on delete set null,
  original_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  shift_id uuid references public.staff_shifts(id) on delete set null,
  time_entry_id uuid references public.time_entries(id) on delete set null,
  exception_type text not null check (exception_type in ('late', 'missed_shift', 'early_leave', 'overtime', 'unscheduled_shift', 'missing_clock_out', 'long_break', 'manual_edit')),
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  message text not null,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, shift_id, time_entry_id, exception_type, status)
);

create table public.labor_cost_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  pay_period_id uuid references public.pay_periods(id) on delete cascade,
  regular_minutes integer not null default 0 check (regular_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  pto_minutes integer not null default 0 check (pto_minutes >= 0),
  regular_cost_cents integer not null default 0 check (regular_cost_cents >= 0),
  overtime_cost_cents integer not null default 0 check (overtime_cost_cents >= 0),
  pto_cost_cents integer not null default 0 check (pto_cost_cents >= 0),
  total_cost_cents integer not null default 0 check (total_cost_cents >= 0),
  calculated_at timestamptz not null default now(),
  unique (organization_id, user_id, pay_period_id, location_id)
);

create table public.staff_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  skill_status text not null default 'qualified' check (skill_status in ('training', 'qualified', 'inactive')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, service_id)
);

create trigger workforce_settings_set_updated_at before update on public.workforce_settings for each row execute function public.set_updated_at();
create trigger employment_profiles_set_updated_at before update on public.employment_profiles for each row execute function public.set_updated_at();
create trigger shift_templates_set_updated_at before update on public.shift_templates for each row execute function public.set_updated_at();
create trigger staff_shifts_set_updated_at before update on public.staff_shifts for each row execute function public.set_updated_at();
create trigger recurring_shift_patterns_set_updated_at before update on public.recurring_shift_patterns for each row execute function public.set_updated_at();
create trigger time_entries_set_updated_at before update on public.time_entries for each row execute function public.set_updated_at();
create trigger pay_periods_set_updated_at before update on public.pay_periods for each row execute function public.set_updated_at();
create trigger timesheets_set_updated_at before update on public.timesheets for each row execute function public.set_updated_at();
create trigger pto_policies_set_updated_at before update on public.pto_policies for each row execute function public.set_updated_at();
create trigger pto_requests_set_updated_at before update on public.pto_requests for each row execute function public.set_updated_at();
create trigger organization_holidays_set_updated_at before update on public.organization_holidays for each row execute function public.set_updated_at();
create trigger attendance_exceptions_set_updated_at before update on public.attendance_exceptions for each row execute function public.set_updated_at();
create trigger staff_skills_set_updated_at before update on public.staff_skills for each row execute function public.set_updated_at();

create index employment_profiles_org_status_idx on public.employment_profiles (organization_id, status, department);
create index staff_shifts_org_date_idx on public.staff_shifts (organization_id, shift_date, status);
create index staff_shifts_user_date_idx on public.staff_shifts (user_id, shift_date);
create index time_entries_org_clock_idx on public.time_entries (organization_id, clock_in_at desc);
create index time_entries_user_clock_idx on public.time_entries (user_id, clock_in_at desc);
create index pto_requests_org_status_idx on public.pto_requests (organization_id, status, start_date);
create index attendance_exceptions_org_status_idx on public.attendance_exceptions (organization_id, status, exception_type);
create index labor_cost_records_org_period_idx on public.labor_cost_records (organization_id, pay_period_id, location_id);

create or replace function public.calculate_time_entry_minutes(target_time_entry_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row record;
  total_minutes integer := 0;
  break_minutes integer := 0;
begin
  select * into entry_row from public.time_entries where id = target_time_entry_id;
  if entry_row.id is null then raise exception 'Time entry was not found'; end if;
  if entry_row.clock_out_at is null then return 0; end if;

  total_minutes := greatest(floor(extract(epoch from (entry_row.clock_out_at - entry_row.clock_in_at)) / 60)::integer, 0);

  select coalesce(sum(greatest(floor(extract(epoch from (coalesce(end_at, entry_row.clock_out_at) - start_at)) / 60)::integer, 0)), 0)
  into break_minutes
  from public.time_entry_breaks
  where time_entry_id = target_time_entry_id
    and paid = false;

  update public.time_entries
  set worked_minutes = greatest(total_minutes - break_minutes, 0),
      unpaid_break_minutes = break_minutes
  where id = target_time_entry_id;

  return greatest(total_minutes - break_minutes, 0);
end;
$$;

create or replace function public.clock_in(
  target_location_id uuid,
  target_shift_id uuid default null,
  clock_time timestamptz default now(),
  clock_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row record;
  shift_row record;
  existing_id uuid;
  new_id uuid;
begin
  select * into profile_row from public.user_profiles where id = auth.uid();
  if profile_row.id is null then raise exception 'Authenticated user profile was not found'; end if;

  if not exists (
    select 1
    from public.user_locations ul
    where ul.user_id = profile_row.id
      and ul.location_id = target_location_id
  ) then
    raise exception 'Selected location is not available for this user';
  end if;

  select id into existing_id
  from public.time_entries
  where organization_id = profile_row.organization_id
    and user_id = profile_row.id
    and status = 'open'
    and clock_out_at is null
  limit 1;
  if existing_id is not null then return existing_id; end if;

  if target_shift_id is not null then
    select * into shift_row from public.staff_shifts where id = target_shift_id;
    if shift_row.id is null then raise exception 'Shift was not found'; end if;
    if shift_row.organization_id <> profile_row.organization_id then raise exception 'Shift is not available for this organization'; end if;
    if shift_row.user_id <> profile_row.id then raise exception 'Cannot clock in for another user shift'; end if;
    if shift_row.location_id <> target_location_id then raise exception 'Shift location does not match selected location'; end if;
  end if;

  insert into public.time_entries (organization_id, location_id, user_id, shift_id, clock_in_at, status, source, notes)
  values (profile_row.organization_id, target_location_id, profile_row.id, target_shift_id, coalesce(clock_time, now()), 'open', 'staff_clock', clock_notes)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.start_time_break(target_time_entry_id uuid, break_time timestamptz default now(), break_paid boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row record;
  existing_id uuid;
  new_id uuid;
begin
  select * into entry_row from public.time_entries where id = target_time_entry_id;
  if entry_row.id is null then raise exception 'Time entry was not found'; end if;
  if entry_row.user_id <> auth.uid() then raise exception 'Cannot start break for another user'; end if;
  if entry_row.clock_out_at is not null then raise exception 'Cannot start break after clock-out'; end if;

  select id into existing_id from public.time_entry_breaks where time_entry_id = target_time_entry_id and end_at is null limit 1;
  if existing_id is not null then return existing_id; end if;

  insert into public.time_entry_breaks (time_entry_id, start_at, paid)
  values (target_time_entry_id, coalesce(break_time, now()), break_paid)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.end_time_break(target_time_entry_id uuid, break_time timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  break_id uuid;
begin
  select teb.id into break_id
  from public.time_entry_breaks teb
  join public.time_entries te on te.id = teb.time_entry_id
  where teb.time_entry_id = target_time_entry_id
    and teb.end_at is null
    and te.user_id = auth.uid()
  limit 1;

  if break_id is null then return null; end if;
  update public.time_entry_breaks set end_at = coalesce(break_time, now()) where id = break_id;
  return break_id;
end;
$$;

create or replace function public.clock_out(target_time_entry_id uuid, clock_time timestamptz default now(), clock_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row record;
begin
  select * into entry_row from public.time_entries where id = target_time_entry_id;
  if entry_row.id is null then raise exception 'Time entry was not found'; end if;
  if entry_row.user_id <> auth.uid() then raise exception 'Cannot clock out another user'; end if;
  if entry_row.clock_out_at is not null then return entry_row.id; end if;

  update public.time_entry_breaks
  set end_at = coalesce(clock_time, now())
  where time_entry_id = target_time_entry_id
    and end_at is null;

  update public.time_entries
  set clock_out_at = coalesce(clock_time, now()),
      status = 'completed',
      notes = coalesce(clock_notes, notes)
  where id = target_time_entry_id;

  perform public.calculate_time_entry_minutes(target_time_entry_id);
  return target_time_entry_id;
end;
$$;

create or replace function public.recalculate_pto_balance(target_user_id uuid, target_policy_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  available integer := 0;
  used integer := 0;
  pending integer := 0;
begin
  select organization_id into org_id from public.user_profiles where id = target_user_id;
  select coalesce(sum(minutes), 0) into available from public.pto_events where user_id = target_user_id and policy_id = target_policy_id;
  select coalesce(sum(requested_minutes), 0) into used from public.pto_requests where user_id = target_user_id and policy_id = target_policy_id and status = 'approved';
  select coalesce(sum(requested_minutes), 0) into pending from public.pto_requests where user_id = target_user_id and policy_id = target_policy_id and status = 'pending';

  insert into public.pto_balances (organization_id, user_id, policy_id, available_minutes, used_minutes, pending_minutes)
  values (org_id, target_user_id, target_policy_id, available, used, pending)
  on conflict (organization_id, user_id, policy_id) do update
  set available_minutes = excluded.available_minutes,
      used_minutes = excluded.used_minutes,
      pending_minutes = excluded.pending_minutes,
      updated_at = now();
  return available;
end;
$$;

create or replace function public.generate_labor_cost_record(target_pay_period_id uuid, target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  period_row record;
  profile_row record;
  regular_minutes integer := 0;
  overtime_minutes integer := 0;
  pto_minutes integer := 0;
  hourly_cents integer := 0;
  record_id uuid;
begin
  select * into period_row from public.pay_periods where id = target_pay_period_id;
  select * into profile_row from public.employment_profiles where user_id = target_user_id and organization_id = period_row.organization_id;
  if period_row.id is null or profile_row.id is null then raise exception 'Pay period or employment profile was not found'; end if;

  select coalesce(sum(worked_minutes), 0)
  into regular_minutes
  from public.time_entries
  where organization_id = period_row.organization_id
    and user_id = target_user_id
    and clock_in_at::date between period_row.start_date and period_row.end_date
    and status in ('completed', 'edited', 'approved');

  if regular_minutes > 2400 and profile_row.overtime_eligible then
    overtime_minutes := regular_minutes - 2400;
    regular_minutes := 2400;
  end if;

  select coalesce(sum(requested_minutes), 0)
  into pto_minutes
  from public.pto_requests
  where organization_id = period_row.organization_id
    and user_id = target_user_id
    and status = 'approved'
    and start_date between period_row.start_date and period_row.end_date;

  hourly_cents := coalesce(profile_row.hourly_rate_cents, case when profile_row.annual_salary_cents is null then 0 else round(profile_row.annual_salary_cents / 2080.0)::integer end, 0);

  insert into public.labor_cost_records (
    organization_id, location_id, user_id, pay_period_id, regular_minutes, overtime_minutes, pto_minutes,
    regular_cost_cents, overtime_cost_cents, pto_cost_cents, total_cost_cents
  )
  values (
    period_row.organization_id, profile_row.primary_location_id, target_user_id, period_row.id, regular_minutes, overtime_minutes, pto_minutes,
    round(regular_minutes * hourly_cents / 60.0)::integer,
    round(overtime_minutes * hourly_cents * profile_row.overtime_multiplier / 60.0)::integer,
    round(pto_minutes * hourly_cents / 60.0)::integer,
    round(regular_minutes * hourly_cents / 60.0 + overtime_minutes * hourly_cents * profile_row.overtime_multiplier / 60.0 + pto_minutes * hourly_cents / 60.0)::integer
  )
  on conflict (organization_id, user_id, pay_period_id, location_id) do update
  set regular_minutes = excluded.regular_minutes,
      overtime_minutes = excluded.overtime_minutes,
      pto_minutes = excluded.pto_minutes,
      regular_cost_cents = excluded.regular_cost_cents,
      overtime_cost_cents = excluded.overtime_cost_cents,
      pto_cost_cents = excluded.pto_cost_cents,
      total_cost_cents = excluded.total_cost_cents,
      calculated_at = now()
  returning id into record_id;

  return record_id;
end;
$$;

alter table public.workforce_settings enable row level security;
alter table public.employment_profiles enable row level security;
alter table public.shift_templates enable row level security;
alter table public.staff_shifts enable row level security;
alter table public.recurring_shift_patterns enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_breaks enable row level security;
alter table public.pay_periods enable row level security;
alter table public.timesheets enable row level security;
alter table public.pto_policies enable row level security;
alter table public.pto_balances enable row level security;
alter table public.pto_events enable row level security;
alter table public.pto_requests enable row level security;
alter table public.organization_holidays enable row level security;
alter table public.time_entry_audits enable row level security;
alter table public.attendance_exceptions enable row level security;
alter table public.labor_cost_records enable row level security;
alter table public.staff_skills enable row level security;

create policy "tenant workforce settings read" on public.workforce_settings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.read'));
create policy "tenant workforce settings manage" on public.workforce_settings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.settings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.settings.manage'));
create policy "tenant employment profiles read" on public.employment_profiles for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.read') or user_id = auth.uid()));
create policy "tenant employment profiles manage" on public.employment_profiles for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.compensation.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.compensation.manage'));
create policy "tenant shift templates access" on public.shift_templates for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.write'));
create policy "tenant staff shifts read" on public.staff_shifts for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.schedule.read') or user_id = auth.uid()) and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = staff_shifts.location_id));
create policy "tenant staff shifts write" on public.staff_shifts for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.write') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = staff_shifts.location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.write'));
create policy "tenant recurring shift patterns access" on public.recurring_shift_patterns for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.write'));
create policy "tenant time entries read" on public.time_entries for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.time_entries.read') or user_id = auth.uid()));
create policy "tenant time entries manage" on public.time_entries for all using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.time_entries.manage') or user_id = auth.uid())) with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.time_entries.manage') or user_id = auth.uid()));
create policy "tenant time breaks access" on public.time_entry_breaks for all using (exists (select 1 from public.time_entries te where te.id = time_entry_id and te.organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.time_entries.read') or te.user_id = auth.uid()))) with check (exists (select 1 from public.time_entries te where te.id = time_entry_id and te.organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.time_entries.manage') or te.user_id = auth.uid())));
create policy "tenant pay periods access" on public.pay_periods for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.timesheets.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.settings.manage'));
create policy "tenant timesheets read" on public.timesheets for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.timesheets.read') or user_id = auth.uid()));
create policy "tenant timesheets approve" on public.timesheets for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.timesheets.approve')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.timesheets.approve'));
create policy "tenant pto policies access" on public.pto_policies for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.pto.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.pto.manage'));
create policy "tenant pto balances read" on public.pto_balances for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.pto.read') or user_id = auth.uid()));
create policy "tenant pto balances manage" on public.pto_balances for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.pto.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.pto.manage'));
create policy "tenant pto events read" on public.pto_events for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.pto.read') or user_id = auth.uid()));
create policy "tenant pto events manage" on public.pto_events for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.pto.manage'));
create policy "tenant pto requests read" on public.pto_requests for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.pto.read') or user_id = auth.uid()));
create policy "tenant pto requests write" on public.pto_requests for all using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.pto.manage') or user_id = auth.uid())) with check (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.pto.manage') or user_id = auth.uid()));
create policy "tenant holidays access" on public.organization_holidays for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.settings.manage'));
create policy "tenant time entry audits read" on public.time_entry_audits for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.time_entries.manage'));
create policy "tenant time entry audits insert" on public.time_entry_audits for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.time_entries.manage'));
create policy "tenant attendance exceptions access" on public.attendance_exceptions for all using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.time_entries.read') or user_id = auth.uid())) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.time_entries.manage'));
create policy "tenant labor costs read" on public.labor_cost_records for select using (organization_id in (select public.current_organization_ids()) and (public.has_permission('workforce.compensation.read') or public.has_permission('workforce.reports.read')));
create policy "tenant labor costs manage" on public.labor_cost_records for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.compensation.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.compensation.manage'));
create policy "tenant staff skills access" on public.staff_skills for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.schedule.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('workforce.settings.manage'));

revoke all on function public.calculate_time_entry_minutes(uuid) from public;
revoke all on function public.clock_in(uuid, uuid, timestamptz, text) from public;
revoke all on function public.start_time_break(uuid, timestamptz, boolean) from public;
revoke all on function public.end_time_break(uuid, timestamptz) from public;
revoke all on function public.clock_out(uuid, timestamptz, text) from public;
revoke all on function public.recalculate_pto_balance(uuid, uuid) from public;
revoke all on function public.generate_labor_cost_record(uuid, uuid) from public;
grant execute on function public.calculate_time_entry_minutes(uuid) to authenticated;
grant execute on function public.clock_in(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.start_time_break(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.end_time_break(uuid, timestamptz) to authenticated;
grant execute on function public.clock_out(uuid, timestamptz, text) to authenticated;
grant execute on function public.recalculate_pto_balance(uuid, uuid) to authenticated;
grant execute on function public.generate_labor_cost_record(uuid, uuid) to authenticated;
