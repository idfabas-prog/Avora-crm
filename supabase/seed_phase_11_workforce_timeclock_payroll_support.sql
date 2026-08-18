-- Phase 11 development seed. Workforce, timekeeping, PTO, and labor-cost rows are fictional/demo data only.

with org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' or lower(trim(name)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1
)
insert into public.workforce_settings (id, organization_id, pay_frequency, overtime_weekly_threshold_minutes, overtime_multiplier, annual_salary_work_minutes, early_clock_in_grace_minutes, late_clock_in_grace_minutes, default_unpaid_break_minutes, require_scheduled_shift, allow_unscheduled_clock_in)
select '10000000-0000-4000-8000-000000011001'::uuid, org.id, 'biweekly', 2400, 1.50, 124800, 15, 7, 30, false, true
from org
on conflict (organization_id) do update
set pay_frequency = excluded.pay_frequency,
    overtime_weekly_threshold_minutes = excluded.overtime_weekly_threshold_minutes,
    overtime_multiplier = excluded.overtime_multiplier,
    annual_salary_work_minutes = excluded.annual_salary_work_minutes,
    early_clock_in_grace_minutes = excluded.early_clock_in_grace_minutes,
    late_clock_in_grace_minutes = excluded.late_clock_in_grace_minutes,
    default_unpaid_break_minutes = excluded.default_unpaid_break_minutes,
    require_scheduled_shift = excluded.require_scheduled_shift,
    allow_unscheduled_clock_in = excluded.allow_unscheduled_clock_in,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
locations as (
  select
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1) as miami_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1) as tampa_id,
    (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'jacksonville' limit 1) as jacksonville_id
),
employees as (
  select up.id, lower(trim(up.email)) as email from public.user_profiles up where up.organization_id = (select id from org)
),
seeded_profiles (id, email, employee_number, employment_type, primary_location_id, job_title, department, hire_date, status, hourly_rate_cents, annual_salary_cents, overtime_eligible, overtime_multiplier, default_weekly_hours, payroll_external_id) as (
  values
    ('10000000-0000-4000-8000-000000011101'::uuid, 'owner@avora-demo.com', 'AV-001', 'salary', (select miami_id from locations), 'Owner', 'Management', current_date - 720, 'active', null, 13200000, false, 1.50, 40, 'DEMO-PAY-001'),
    ('10000000-0000-4000-8000-000000011102'::uuid, 'manager@avora-demo.com', 'AV-002', 'salary', (select miami_id from locations), 'Clinic Manager', 'Operations', current_date - 420, 'active', null, 7800000, false, 1.50, 40, 'DEMO-PAY-002'),
    ('10000000-0000-4000-8000-000000011103'::uuid, 'sales@avora-demo.com', 'AV-003', 'hourly', (select tampa_id from locations), 'Sales Consultant', 'Sales', current_date - 260, 'active', 3200, null, true, 1.50, 40, 'DEMO-PAY-003'),
    ('10000000-0000-4000-8000-000000011104'::uuid, 'provider@avora-demo.com', 'AV-004', 'hourly', (select jacksonville_id from locations), 'Provider', 'Clinical', current_date - 330, 'active', 6400, null, true, 1.50, 32, 'DEMO-PAY-004')
)
insert into public.employment_profiles (id, organization_id, user_id, employee_number, employment_type, primary_location_id, job_title, department, hire_date, status, hourly_rate_cents, annual_salary_cents, overtime_eligible, overtime_multiplier, default_weekly_hours, payroll_external_id)
select seeded_profiles.id, org.id, employees.id, seeded_profiles.employee_number, seeded_profiles.employment_type, seeded_profiles.primary_location_id, seeded_profiles.job_title, seeded_profiles.department, seeded_profiles.hire_date, seeded_profiles.status, seeded_profiles.hourly_rate_cents, seeded_profiles.annual_salary_cents, seeded_profiles.overtime_eligible, seeded_profiles.overtime_multiplier, seeded_profiles.default_weekly_hours, seeded_profiles.payroll_external_id
from org
join seeded_profiles on true
join employees on employees.email = seeded_profiles.email
on conflict (organization_id, user_id) do update
set employee_number = excluded.employee_number,
    employment_type = excluded.employment_type,
    primary_location_id = excluded.primary_location_id,
    job_title = excluded.job_title,
    department = excluded.department,
    hire_date = excluded.hire_date,
    status = excluded.status,
    hourly_rate_cents = excluded.hourly_rate_cents,
    annual_salary_cents = excluded.annual_salary_cents,
    overtime_eligible = excluded.overtime_eligible,
    overtime_multiplier = excluded.overtime_multiplier,
    default_weekly_hours = excluded.default_weekly_hours,
    payroll_external_id = excluded.payroll_external_id,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
template_seed (id, location_slug, name, start_time, end_time, unpaid_break_minutes, role_filter) as (
  values
    ('10000000-0000-4000-8000-000000011201'::uuid, 'miami', 'Miami Front Desk 9-5', '09:00'::time, '17:00'::time, 30, 'front_desk'),
    ('10000000-0000-4000-8000-000000011202'::uuid, 'tampa', 'Tampa Provider 10-6', '10:00'::time, '18:00'::time, 30, 'provider'),
    ('10000000-0000-4000-8000-000000011203'::uuid, 'jacksonville', 'Jacksonville Sales 9-6', '09:00'::time, '18:00'::time, 60, 'sales')
)
insert into public.shift_templates (id, organization_id, location_id, name, start_time, end_time, unpaid_break_minutes, role_filter, active)
select template_seed.id, org.id, locations.id, template_seed.name, template_seed.start_time, template_seed.end_time, template_seed.unpaid_break_minutes, template_seed.role_filter, true
from org
join template_seed on true
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = template_seed.location_slug
on conflict (organization_id, location_id, name) do update
set start_time = excluded.start_time,
    end_time = excluded.end_time,
    unpaid_break_minutes = excluded.unpaid_break_minutes,
    role_filter = excluded.role_filter,
    active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1),
users as (select id, lower(trim(email)) as email from public.user_profiles where organization_id = (select id from org)),
shift_seed (id, email, template_id, location_slug, shift_date, start_time, end_time, break_minutes, status, published, notes) as (
  values
    ('10000000-0000-4000-8000-000000011301'::uuid, 'manager@avora-demo.com', '10000000-0000-4000-8000-000000011201'::uuid, 'miami', current_date, '09:00'::time, '17:00'::time, 30, 'scheduled', true, 'Fictional published manager coverage.'),
    ('10000000-0000-4000-8000-000000011302'::uuid, 'provider@avora-demo.com', '10000000-0000-4000-8000-000000011203'::uuid, 'jacksonville', current_date, '09:00'::time, '18:00'::time, 60, 'scheduled', true, 'Fictional clinical/provider coverage.'),
    ('10000000-0000-4000-8000-000000011303'::uuid, 'sales@avora-demo.com', '10000000-0000-4000-8000-000000011202'::uuid, 'tampa', current_date, '10:00'::time, '18:00'::time, 30, 'scheduled', true, 'Fictional sales coverage.'),
    ('10000000-0000-4000-8000-000000011304'::uuid, 'sales@avora-demo.com', '10000000-0000-4000-8000-000000011202'::uuid, 'tampa', current_date - 1, '10:00'::time, '18:00'::time, 30, 'completed', true, 'Completed demo shift.'),
    ('10000000-0000-4000-8000-000000011305'::uuid, 'provider@avora-demo.com', '10000000-0000-4000-8000-000000011203'::uuid, 'jacksonville', current_date - 1, '09:00'::time, '17:00'::time, 30, 'missed', true, 'Demo missed shift for exception reporting.'),
    ('10000000-0000-4000-8000-000000011306'::uuid, 'manager@avora-demo.com', '10000000-0000-4000-8000-000000011201'::uuid, 'miami', current_date + 1, '09:00'::time, '17:00'::time, 30, 'draft', false, 'Draft tomorrow schedule.')
)
insert into public.staff_shifts (id, organization_id, location_id, user_id, shift_template_id, shift_date, scheduled_start, scheduled_end, break_minutes, status, notes, published, created_by)
select shift_seed.id, org.id, locations.id, users.id, shift_seed.template_id, shift_seed.shift_date, (shift_seed.shift_date::timestamp + shift_seed.start_time) at time zone 'America/New_York', (shift_seed.shift_date::timestamp + shift_seed.end_time) at time zone 'America/New_York', shift_seed.break_minutes, shift_seed.status, shift_seed.notes, shift_seed.published, owner_user.id
from org
join shift_seed on true
join users on users.email = shift_seed.email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = shift_seed.location_slug
left join owner_user on true
on conflict (id) do update
set scheduled_start = excluded.scheduled_start,
    scheduled_end = excluded.scheduled_end,
    break_minutes = excluded.break_minutes,
    status = excluded.status,
    notes = excluded.notes,
    published = excluded.published,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1),
sales_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'sales@avora-demo.com' limit 1),
tampa as (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1)
insert into public.recurring_shift_patterns (id, organization_id, location_id, user_id, shift_template_id, weekdays, effective_start, effective_end, active, created_by)
select '10000000-0000-4000-8000-000000011351'::uuid, org.id, tampa.id, sales_user.id, '10000000-0000-4000-8000-000000011202'::uuid, array[1,2,3,4,5], current_date, current_date + 60, true, owner_user.id
from org cross join tampa cross join sales_user left join owner_user on true
on conflict (id) do update
set weekdays = excluded.weekdays,
    effective_start = excluded.effective_start,
    effective_end = excluded.effective_end,
    active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1)
insert into public.pay_periods (id, organization_id, start_date, end_date, pay_date, status)
select '10000000-0000-4000-8000-000000011401'::uuid, org.id, date_trunc('week', current_date)::date, (date_trunc('week', current_date)::date + 13), (date_trunc('week', current_date)::date + 18), 'open'
from org
on conflict (organization_id, start_date, end_date) do update
set pay_date = excluded.pay_date,
    status = excluded.status,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
users as (select id, lower(trim(email)) as email from public.user_profiles where organization_id = (select id from org)),
entry_seed (id, email, shift_id, location_slug, clock_in_at, clock_out_at, status, source, worked_minutes, unpaid_break_minutes, notes) as (
  values
    ('10000000-0000-4000-8000-000000011501'::uuid, 'sales@avora-demo.com', '10000000-0000-4000-8000-000000011304'::uuid, 'tampa', (current_date - 1)::timestamp + time '10:03', (current_date - 1)::timestamp + time '18:10', 'completed', 'staff_clock', 457, 30, 'Fictional completed shift with unpaid break.'),
    ('10000000-0000-4000-8000-000000011502'::uuid, 'manager@avora-demo.com', '10000000-0000-4000-8000-000000011301'::uuid, 'miami', current_date::timestamp + time '08:55', null, 'open', 'staff_clock', 0, 0, 'Fictional currently clocked in manager.'),
    ('10000000-0000-4000-8000-000000011503'::uuid, 'provider@avora-demo.com', null, 'jacksonville', (current_date - 2)::timestamp + time '09:12', (current_date - 2)::timestamp + time '18:30', 'edited', 'manager_entry', 498, 60, 'Fictional manager-corrected provider shift.')
)
insert into public.time_entries (id, organization_id, location_id, user_id, shift_id, clock_in_at, clock_out_at, status, source, worked_minutes, unpaid_break_minutes, notes)
select entry_seed.id, org.id, locations.id, users.id, entry_seed.shift_id, entry_seed.clock_in_at at time zone 'America/New_York', entry_seed.clock_out_at at time zone 'America/New_York', entry_seed.status, entry_seed.source, entry_seed.worked_minutes, entry_seed.unpaid_break_minutes, entry_seed.notes
from org
join entry_seed on true
join users on users.email = entry_seed.email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = entry_seed.location_slug
on conflict (id) do update
set clock_in_at = excluded.clock_in_at,
    clock_out_at = excluded.clock_out_at,
    status = excluded.status,
    source = excluded.source,
    worked_minutes = excluded.worked_minutes,
    unpaid_break_minutes = excluded.unpaid_break_minutes,
    notes = excluded.notes,
    updated_at = now();

insert into public.time_entry_breaks (id, time_entry_id, start_at, end_at, paid)
values
  ('10000000-0000-4000-8000-000000011511'::uuid, '10000000-0000-4000-8000-000000011501'::uuid, ((current_date - 1)::timestamp + time '13:00') at time zone 'America/New_York', ((current_date - 1)::timestamp + time '13:30') at time zone 'America/New_York', false),
  ('10000000-0000-4000-8000-000000011512'::uuid, '10000000-0000-4000-8000-000000011503'::uuid, ((current_date - 2)::timestamp + time '13:15') at time zone 'America/New_York', ((current_date - 2)::timestamp + time '14:15') at time zone 'America/New_York', false)
on conflict (id) do update
set start_at = excluded.start_at,
    end_at = excluded.end_at,
    paid = excluded.paid;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1)
insert into public.pto_policies (id, organization_id, name, accrual_type, accrual_rate, accrual_cap_minutes, annual_grant_minutes, carryover_limit_minutes, employment_type_filter, active)
select '10000000-0000-4000-8000-000000011601'::uuid, org.id, 'Demo PTO Policy', 'annual_grant', 0, 9600, 4800, 2400, null, true
from org
on conflict (organization_id, name) do update
set accrual_type = excluded.accrual_type,
    accrual_rate = excluded.accrual_rate,
    accrual_cap_minutes = excluded.accrual_cap_minutes,
    annual_grant_minutes = excluded.annual_grant_minutes,
    carryover_limit_minutes = excluded.carryover_limit_minutes,
    active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1),
users as (select id, lower(trim(email)) as email from public.user_profiles where organization_id = (select id from org)),
events (id, email, minutes, reason) as (
  values
    ('10000000-0000-4000-8000-000000011611'::uuid, 'manager@avora-demo.com', 4800, 'Fictional annual PTO grant.'),
    ('10000000-0000-4000-8000-000000011612'::uuid, 'sales@avora-demo.com', 3600, 'Fictional annual PTO grant.'),
    ('10000000-0000-4000-8000-000000011613'::uuid, 'provider@avora-demo.com', 3600, 'Fictional annual PTO grant.')
)
insert into public.pto_events (id, organization_id, user_id, policy_id, event_type, minutes, reason, source, created_by)
select events.id, org.id, users.id, '10000000-0000-4000-8000-000000011601'::uuid, 'grant', events.minutes, events.reason, 'phase_11_seed', owner_user.id
from org
join events on true
join users on users.email = events.email
left join owner_user on true
on conflict (id) do update
set minutes = excluded.minutes,
    reason = excluded.reason;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
users as (select id, lower(trim(email)) as email from public.user_profiles where organization_id = (select id from org)),
balances (email, available_minutes, used_minutes, pending_minutes) as (
  values
    ('manager@avora-demo.com', 4800, 0, 0),
    ('sales@avora-demo.com', 3120, 480, 480),
    ('provider@avora-demo.com', 3600, 0, 0)
)
insert into public.pto_balances (organization_id, user_id, policy_id, available_minutes, used_minutes, pending_minutes)
select org.id, users.id, '10000000-0000-4000-8000-000000011601'::uuid, balances.available_minutes, balances.used_minutes, balances.pending_minutes
from org
join balances on true
join users on users.email = balances.email
on conflict (organization_id, user_id, policy_id) do update
set available_minutes = excluded.available_minutes,
    used_minutes = excluded.used_minutes,
    pending_minutes = excluded.pending_minutes,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
manager_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'manager@avora-demo.com' limit 1),
sales_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'sales@avora-demo.com' limit 1),
tampa as (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'tampa' limit 1)
insert into public.pto_requests (id, organization_id, user_id, location_id, policy_id, start_date, end_date, start_time, end_time, requested_minutes, reason, request_type, status, reviewed_by, reviewed_at, review_notes)
select '10000000-0000-4000-8000-000000011621'::uuid, org.id, sales_user.id, tampa.id, '10000000-0000-4000-8000-000000011601'::uuid, current_date + 7, current_date + 7, '09:00'::time, '17:00'::time, 480, 'Fictional pending PTO request.', 'pto', 'pending', null, null, null
from org cross join sales_user cross join tampa
on conflict (id) do update
set start_date = excluded.start_date,
    end_date = excluded.end_date,
    requested_minutes = excluded.requested_minutes,
    status = excluded.status,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
miami as (select id from public.locations where organization_id = (select id from org) and lower(trim(slug)) = 'miami' limit 1)
insert into public.organization_holidays (id, organization_id, location_id, holiday_date, name, paid, active)
select '10000000-0000-4000-8000-000000011631'::uuid, org.id, miami.id, current_date + 30, 'Demo Clinic Holiday', true, true
from org cross join miami
on conflict (id) do update
set holiday_date = excluded.holiday_date,
    paid = excluded.paid,
    active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'owner@avora-demo.com' limit 1)
insert into public.time_entry_audits (id, organization_id, time_entry_id, edited_by, original_values, new_values, reason)
select '10000000-0000-4000-8000-000000011701'::uuid, org.id, '10000000-0000-4000-8000-000000011503'::uuid, owner_user.id, '{"clock_out_at":"18:00"}'::jsonb, '{"clock_out_at":"18:30"}'::jsonb, 'Fictional manager correction for missed clock-out.'
from org left join owner_user on true
on conflict (id) do update
set original_values = excluded.original_values,
    new_values = excluded.new_values,
    reason = excluded.reason;

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
users as (select id, lower(trim(email)) as email from public.user_profiles where organization_id = (select id from org)),
exceptions (id, email, shift_id, entry_id, location_slug, exception_type, message) as (
  values
    ('10000000-0000-4000-8000-000000011801'::uuid, 'provider@avora-demo.com', '10000000-0000-4000-8000-000000011305'::uuid, null::uuid, 'jacksonville', 'missed_shift', 'Fictional missed provider shift requires manager review.'),
    ('10000000-0000-4000-8000-000000011802'::uuid, 'sales@avora-demo.com', '10000000-0000-4000-8000-000000011304'::uuid, '10000000-0000-4000-8000-000000011501'::uuid, 'tampa', 'late', 'Fictional late clock-in by 3 minutes beyond grace threshold.'),
    ('10000000-0000-4000-8000-000000011803'::uuid, 'provider@avora-demo.com', null::uuid, '10000000-0000-4000-8000-000000011503'::uuid, 'jacksonville', 'manual_edit', 'Fictional manager edit recorded for audit.')
)
insert into public.attendance_exceptions (id, organization_id, location_id, user_id, shift_id, time_entry_id, exception_type, status, message)
select exceptions.id, org.id, locations.id, users.id, exceptions.shift_id, exceptions.entry_id, exceptions.exception_type, 'open', exceptions.message
from org
join exceptions on true
join users on users.email = exceptions.email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = exceptions.location_slug
on conflict (id) do update
set status = excluded.status,
    message = excluded.message,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
period as (select id from public.pay_periods where organization_id = (select id from org) and id = '10000000-0000-4000-8000-000000011401' limit 1),
users as (select id, lower(trim(email)) as email from public.user_profiles where organization_id = (select id from org)),
costs (id, email, location_slug, regular_minutes, overtime_minutes, pto_minutes, regular_cost_cents, overtime_cost_cents, pto_cost_cents) as (
  values
    ('10000000-0000-4000-8000-000000011901'::uuid, 'sales@avora-demo.com', 'tampa', 2280, 120, 480, 121600, 9600, 25600),
    ('10000000-0000-4000-8000-000000011902'::uuid, 'provider@avora-demo.com', 'jacksonville', 1920, 0, 0, 204800, 0, 0),
    ('10000000-0000-4000-8000-000000011903'::uuid, 'manager@avora-demo.com', 'miami', 2400, 0, 0, 150000, 0, 0)
)
insert into public.labor_cost_records (id, organization_id, location_id, user_id, pay_period_id, regular_minutes, overtime_minutes, pto_minutes, regular_cost_cents, overtime_cost_cents, pto_cost_cents, total_cost_cents)
select costs.id, org.id, locations.id, users.id, period.id, costs.regular_minutes, costs.overtime_minutes, costs.pto_minutes, costs.regular_cost_cents, costs.overtime_cost_cents, costs.pto_cost_cents, costs.regular_cost_cents + costs.overtime_cost_cents + costs.pto_cost_cents
from org
join period on true
join costs on true
join users on users.email = costs.email
join public.locations locations on locations.organization_id = org.id and lower(trim(locations.slug)) = costs.location_slug
on conflict (id) do update
set regular_minutes = excluded.regular_minutes,
    overtime_minutes = excluded.overtime_minutes,
    pto_minutes = excluded.pto_minutes,
    regular_cost_cents = excluded.regular_cost_cents,
    overtime_cost_cents = excluded.overtime_cost_cents,
    pto_cost_cents = excluded.pto_cost_cents,
    total_cost_cents = excluded.total_cost_cents,
    calculated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
period as (select id from public.pay_periods where organization_id = (select id from org) and id = '10000000-0000-4000-8000-000000011401' limit 1),
users as (select id, lower(trim(email)) as email from public.user_profiles where organization_id = (select id from org)),
sheet_seed (id, email, scheduled_minutes, worked_minutes, regular_minutes, overtime_minutes, pto_minutes, total_payable_minutes, status) as (
  values
    ('10000000-0000-4000-8000-000000011911'::uuid, 'sales@avora-demo.com', 2400, 2280, 2280, 120, 480, 2880, 'review'),
    ('10000000-0000-4000-8000-000000011912'::uuid, 'provider@avora-demo.com', 1920, 1920, 1920, 0, 0, 1920, 'draft'),
    ('10000000-0000-4000-8000-000000011913'::uuid, 'manager@avora-demo.com', 2400, 2400, 2400, 0, 0, 2400, 'approved')
)
insert into public.timesheets (id, organization_id, pay_period_id, user_id, scheduled_minutes, worked_minutes, regular_minutes, overtime_minutes, pto_minutes, total_payable_minutes, status)
select sheet_seed.id, org.id, period.id, users.id, sheet_seed.scheduled_minutes, sheet_seed.worked_minutes, sheet_seed.regular_minutes, sheet_seed.overtime_minutes, sheet_seed.pto_minutes, sheet_seed.total_payable_minutes, sheet_seed.status
from org
join period on true
join sheet_seed on true
join users on users.email = sheet_seed.email
on conflict (pay_period_id, user_id) do update
set scheduled_minutes = excluded.scheduled_minutes,
    worked_minutes = excluded.worked_minutes,
    regular_minutes = excluded.regular_minutes,
    overtime_minutes = excluded.overtime_minutes,
    pto_minutes = excluded.pto_minutes,
    total_payable_minutes = excluded.total_payable_minutes,
    status = excluded.status,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
provider_user as (select id from public.user_profiles where organization_id = (select id from org) and lower(trim(email)) = 'provider@avora-demo.com' limit 1)
insert into public.staff_skills (id, organization_id, user_id, service_id, skill_status, active)
select '10000000-0000-4000-8000-000000011951'::uuid, org.id, provider_user.id, services.id, 'qualified', true
from org
join provider_user on true
join public.services services on services.organization_id = org.id and services.name = 'Hair Restoration Treatment'
on conflict (organization_id, user_id, service_id) do update
set skill_status = excluded.skill_status,
    active = true,
    updated_at = now();

with org as (select id from public.organizations where lower(trim(slug)) = 'avora' or id = '10000000-0000-4000-8000-000000000001' limit 1),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  left join public.roles r on r.id = up.role_id
  where up.organization_id = (select id from org)
    and (lower(trim(up.email)) = 'owner@avora-demo.com' or r.name = 'owner')
  order by case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end, up.created_at
  limit 1
),
seeded_workflows as (
  select *
  from (
    values
      ('Shift Created Review', 'internal_operations', 'Create manager review work when a staff shift is created.', 'staff.shift_created', 'Review new staff shift'),
      ('Missed Shift Review', 'internal_operations', 'Create a manager task when a shift is missed.', 'staff.shift_missed', 'Review missed shift'),
      ('Late Employee Review', 'internal_operations', 'Notify manager when an employee is late.', 'staff.late', 'Review late employee'),
      ('Overtime Threshold Review', 'internal_operations', 'Create overtime review work when an employee approaches threshold.', 'staff.overtime_threshold', 'Review overtime risk'),
      ('PTO Requested Review', 'internal_operations', 'Create manager review work when PTO is requested.', 'staff.pto_requested', 'Review PTO request'),
      ('Timesheet Approved Notice', 'internal_operations', 'Notify operations when a timesheet is approved.', 'staff.timesheet_approved', 'Archive approved timesheet')
  ) as workflow_seed(name, category, description, trigger_type, task_title)
),
workflow_definitions as (
  select seeded_workflows.name, seeded_workflows.category, seeded_workflows.description,
    jsonb_build_object(
      'nodes', jsonb_build_array(
        jsonb_build_object('id', 'trigger_staff_event', 'type', 'trigger', 'position', jsonb_build_object('x', 360, 'y', 40), 'configuration', jsonb_build_object('trigger_type', seeded_workflows.trigger_type, 'filters', jsonb_build_array())),
        jsonb_build_object('id', 'task_manager_review', 'type', 'action', 'position', jsonb_build_object('x', 360, 'y', 220), 'configuration', jsonb_build_object('action_type', 'create_task', 'title', seeded_workflows.task_title, 'due', jsonb_build_object('amount', 1, 'unit', 'day', 'time', '09:00'))),
        jsonb_build_object('id', 'notify_manager', 'type', 'action', 'position', jsonb_build_object('x', 360, 'y', 400), 'configuration', jsonb_build_object('action_type', 'send_internal_notification', 'audience', 'manager', 'message', seeded_workflows.description))
      ),
      'edges', jsonb_build_array(
        jsonb_build_object('source', 'trigger_staff_event', 'target', 'task_manager_review', 'label', 'DEFAULT'),
        jsonb_build_object('source', 'task_manager_review', 'target', 'notify_manager', 'label', 'SUCCESS')
      )
    ) as definition_json
  from seeded_workflows
),
upserted_workflows as (
  insert into public.workflows (organization_id, name, description, category, status, location_scope, enrollment_policy, re_enrollment_policy, failure_policy, test_mode, created_by, updated_by)
  select owner_user.organization_id, workflow_definitions.name, workflow_definitions.description, workflow_definitions.category, 'draft', 'all', 'one_active_per_contact', 'after_completion', 'retry_then_stop', true, owner_user.id, owner_user.id
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
  select upserted_workflows.id, upserted_workflows.name, workflow_definitions.definition_json, upserted_workflows.owner_user_id
  from upserted_workflows
  join workflow_definitions on workflow_definitions.name = upserted_workflows.name
),
upserted_versions as (
  insert into public.workflow_versions (workflow_id, version_number, definition_json, status, validation_snapshot, created_by)
  select id, 1, definition_json, 'draft', '{"seeded":true,"phase":11,"starter_template":true}'::jsonb, owner_user_id
  from all_seeded_workflows
  on conflict (workflow_id, version_number) do update set
    definition_json = excluded.definition_json,
    status = 'draft',
    validation_snapshot = excluded.validation_snapshot,
    published_at = null
  returning id
)
select
  (select count(*) from upserted_workflows) as workforce_workflows_inserted_or_updated,
  (select count(*) from upserted_versions) as workforce_workflow_versions_inserted_or_updated;

select
  (select count(*) from public.employment_profiles ep join public.organizations o on o.id = ep.organization_id where lower(trim(o.slug)) = 'avora') as employment_profiles,
  (select count(*) from public.shift_templates st join public.organizations o on o.id = st.organization_id where lower(trim(o.slug)) = 'avora') as shift_templates,
  (select count(*) from public.staff_shifts ss join public.organizations o on o.id = ss.organization_id where lower(trim(o.slug)) = 'avora') as staff_shifts,
  (select count(*) from public.time_entries te join public.organizations o on o.id = te.organization_id where lower(trim(o.slug)) = 'avora') as time_entries,
  (select count(*) from public.timesheets ts join public.organizations o on o.id = ts.organization_id where lower(trim(o.slug)) = 'avora') as timesheets,
  (select count(*) from public.pto_requests pr join public.organizations o on o.id = pr.organization_id where lower(trim(o.slug)) = 'avora') as pto_requests,
  (select count(*) from public.attendance_exceptions ae join public.organizations o on o.id = ae.organization_id where lower(trim(o.slug)) = 'avora') as attendance_exceptions,
  (select count(*) from public.labor_cost_records lcr join public.organizations o on o.id = lcr.organization_id where lower(trim(o.slug)) = 'avora') as labor_cost_records,
  (select count(*) from public.workflows w join public.organizations o on o.id = w.organization_id where lower(trim(o.slug)) = 'avora' and w.name in ('Shift Created Review', 'Missed Shift Review', 'Late Employee Review', 'Overtime Threshold Review', 'PTO Requested Review', 'Timesheet Approved Notice')) as workforce_workflows;
