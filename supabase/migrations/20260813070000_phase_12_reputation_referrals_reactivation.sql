insert into public.permissions (key, description)
values
  ('reputation.read', 'Read reputation dashboard data'),
  ('reputation.manage', 'Manage reputation settings and review requests'),
  ('reputation.reviews.read', 'Read review requests and external reviews'),
  ('reputation.reviews.respond', 'Draft review responses'),
  ('reputation.feedback.read', 'Read internal feedback and satisfaction data'),
  ('reputation.feedback.manage', 'Manage feedback escalations and surveys'),
  ('referrals.read', 'Read referral programs and referral performance'),
  ('referrals.manage', 'Manage referral programs, codes, and referrals'),
  ('referrals.rewards.manage', 'Manage referral reward ledger events'),
  ('reactivation.read', 'Read reactivation segments and campaign performance'),
  ('reactivation.manage', 'Manage reactivation segments and campaigns'),
  ('reputation.reports.read', 'Read reputation, referral, loyalty, and reactivation reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'reputation.read',
  'reputation.manage',
  'reputation.reviews.read',
  'reputation.reviews.respond',
  'reputation.feedback.read',
  'reputation.feedback.manage',
  'referrals.read',
  'referrals.manage',
  'referrals.rewards.manage',
  'reactivation.read',
  'reactivation.manage',
  'reputation.reports.read'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'reputation.read',
  'reputation.reviews.read',
  'reputation.reviews.respond',
  'reputation.feedback.read',
  'reputation.feedback.manage',
  'referrals.read',
  'referrals.manage',
  'reactivation.read',
  'reactivation.manage',
  'reputation.reports.read'
)
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('referrals.read', 'referrals.manage', 'reactivation.read')
where r.name = 'salesperson'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('reputation.feedback.read', 'reputation.reviews.read')
where r.name = 'provider'
on conflict do nothing;

create table public.reputation_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  review_requests_enabled boolean not null default true,
  review_request_cooldown_days integer not null default 90 check (review_request_cooldown_days >= 0),
  default_review_source_id uuid,
  default_survey_id uuid,
  negative_nps_threshold integer not null default 6 check (negative_nps_threshold between 0 and 10),
  negative_csat_threshold integer not null default 2 check (negative_csat_threshold >= 1),
  referral_program_id uuid,
  reactivation_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id)
);

create unique index reputation_settings_one_org_default_idx
on public.reputation_settings (organization_id)
where location_id is null;

create table public.review_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  provider text not null check (provider in ('Google', 'Facebook', 'Yelp', 'Internal', 'Other')),
  external_location_id text,
  review_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.reputation_settings
  add constraint reputation_settings_default_review_source_id_fkey
  foreign key (default_review_source_id) references public.review_sources(id) on delete set null;

create table public.location_review_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  review_source_id uuid not null references public.review_sources(id) on delete cascade,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, review_source_id)
);

create unique index location_review_sources_one_default_idx
on public.location_review_sources (organization_id, location_id)
where is_default and active;

create table public.review_request_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('sms', 'patient_portal', 'internal_link')),
  body text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_template_no_gating check (
    body !~* '5[ -]?star' and body !~* 'positive review' and body !~* 'if you had a good'
  ),
  unique (organization_id, name, channel)
);

create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  requested_by uuid references public.user_profiles(id) on delete set null,
  request_channel text not null check (request_channel in ('sms', 'patient_portal', 'internal_link')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'opened', 'clicked', 'completed', 'declined', 'failed', 'cancelled')),
  review_source_id uuid references public.review_sources(id) on delete set null,
  template_id uuid references public.review_request_templates(id) on delete set null,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  completed_at timestamptz,
  external_review_id text,
  workflow_enrollment_id uuid references public.workflow_enrollments(id) on delete set null,
  eligibility_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index review_requests_external_review_idx
on public.review_requests (organization_id, review_source_id, external_review_id)
where external_review_id is not null;

create index review_requests_contact_status_idx on public.review_requests (organization_id, contact_id, status, created_at desc);
create index review_requests_location_created_idx on public.review_requests (organization_id, location_id, created_at desc);

create table public.feedback_surveys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  survey_type text not null check (survey_type in ('NPS', 'CSAT', 'Treatment Experience', 'Consultation Experience', 'General Feedback')),
  csat_scale_min integer not null default 1,
  csat_scale_max integer not null default 5 check (csat_scale_max >= csat_scale_min),
  active boolean not null default true,
  questions_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.reputation_settings
  add constraint reputation_settings_default_survey_id_fkey
  foreign key (default_survey_id) references public.feedback_surveys(id) on delete set null;

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  survey_id uuid not null references public.feedback_surveys(id) on delete cascade,
  review_request_id uuid references public.review_requests(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  treatment_session_id uuid references public.treatment_sessions(id) on delete set null,
  provider_id uuid references public.user_profiles(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  score integer check (score is null or score between 0 and 10),
  rating integer check (rating is null or rating >= 1),
  nps_category text generated always as (
    case
      when score is null then null
      when score <= 6 then 'detractor'
      when score <= 8 then 'passive'
      else 'promoter'
    end
  ) stored,
  response_text text,
  submitted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index feedback_responses_location_submitted_idx on public.feedback_responses (organization_id, location_id, submitted_at desc);
create index feedback_responses_provider_idx on public.feedback_responses (organization_id, provider_id, submitted_at desc);

create table public.feedback_escalations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  feedback_response_id uuid not null references public.feedback_responses(id) on delete cascade,
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_user_id uuid references public.user_profiles(id) on delete set null,
  notes text,
  first_action_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_response_id)
);

create table public.review_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('Google', 'Facebook', 'Yelp', 'Internal', 'Other')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  records_processed integer not null default 0 check (records_processed >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.external_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  review_source_id uuid not null references public.review_sources(id) on delete cascade,
  external_review_id text not null,
  author_display_name text,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  review_date date not null,
  response_text text,
  responded_at timestamptz,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, review_source_id, external_review_id)
);

create table public.review_response_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_review_id uuid not null references public.external_reviews(id) on delete cascade,
  drafted_by uuid references public.user_profiles(id) on delete set null,
  tone text not null default 'professional' check (tone in ('professional', 'warm', 'apologetic', 'grateful')),
  draft_text text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  reward_type text not null check (reward_type in ('credit', 'fixed_reward', 'discount', 'non_cash', 'none')),
  reward_value integer not null default 0 check (reward_value >= 0),
  active boolean not null default true,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  unique (organization_id, name)
);

alter table public.reputation_settings
  add constraint reputation_settings_referral_program_id_fkey
  foreign key (referral_program_id) references public.referral_programs(id) on delete set null;

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  referral_program_id uuid references public.referral_programs(id) on delete set null,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, contact_id, referral_program_id)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  referring_contact_id uuid not null references public.contacts(id) on delete cascade,
  referred_contact_id uuid references public.contacts(id) on delete set null,
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  lead_created_at timestamptz not null default now(),
  status text not null default 'lead' check (status in ('lead', 'booked', 'showed', 'sold', 'reward_pending', 'reward_issued', 'lost')),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  converted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referred_contact_id is null or referred_contact_id <> referring_contact_id)
);

create unique index referrals_unique_referred_contact_idx
on public.referrals (organization_id, referred_contact_id)
where referred_contact_id is not null;

create table public.referral_reward_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  referring_contact_id uuid not null references public.contacts(id) on delete cascade,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  event_type text not null check (event_type in ('earned', 'issued', 'reversed', 'expired', 'adjustment')),
  reward_type text not null check (reward_type in ('credit', 'fixed_reward', 'discount', 'non_cash', 'none')),
  amount_cents integer not null default 0,
  reward_value integer not null default 0,
  reason text not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.patient_credit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  referral_reward_event_id uuid references public.referral_reward_events(id) on delete set null,
  event_type text not null check (event_type in ('grant', 'apply', 'reverse', 'expire', 'adjustment')),
  amount_cents integer not null check (amount_cents <> 0),
  reason text not null,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.patient_loyalty_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  total_visits integer not null default 0 check (total_visits >= 0),
  completed_treatments integer not null default 0 check (completed_treatments >= 0),
  lifetime_collected_revenue_cents integer not null default 0 check (lifetime_collected_revenue_cents >= 0),
  months_since_last_visit integer check (months_since_last_visit is null or months_since_last_visit >= 0),
  referral_count integer not null default 0 check (referral_count >= 0),
  membership_status text,
  package_utilization_percent integer check (package_utilization_percent is null or package_utilization_percent between 0 and 100),
  loyalty_status text not null default 'new' check (loyalty_status in ('new', 'active', 'loyal', 'vip', 'at_risk', 'inactive')),
  calculated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, contact_id)
);

create table public.reactivation_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  rules_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.reactivation_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  segment_id uuid references public.reactivation_segments(id) on delete set null,
  workflow_id uuid references public.workflows(id) on delete set null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  contacts_targeted integer not null default 0 check (contacts_targeted >= 0),
  contacts_reactivated integer not null default 0 check (contacts_reactivated >= 0),
  bookings_generated integer not null default 0 check (bookings_generated >= 0),
  sales_generated integer not null default 0 check (sales_generated >= 0),
  collected_revenue_cents integer not null default 0 check (collected_revenue_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.reactivation_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.reactivation_campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  event_type text not null check (event_type in ('enrolled', 'booked', 'showed', 'sold', 'paid')),
  collected_revenue_cents integer not null default 0 check (collected_revenue_cents >= 0),
  attributed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index reactivation_attributions_event_idx
on public.reactivation_attributions (organization_id, campaign_id, contact_id, event_type, coalesce(appointment_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(sale_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index referrals_status_idx on public.referrals (organization_id, status, created_at desc);
create index referral_reward_events_contact_idx on public.referral_reward_events (organization_id, referring_contact_id, created_at desc);
create index reactivation_campaigns_status_idx on public.reactivation_campaigns (organization_id, status);

create trigger reputation_settings_set_updated_at before update on public.reputation_settings for each row execute function public.set_updated_at();
create trigger review_sources_set_updated_at before update on public.review_sources for each row execute function public.set_updated_at();
create trigger location_review_sources_set_updated_at before update on public.location_review_sources for each row execute function public.set_updated_at();
create trigger review_request_templates_set_updated_at before update on public.review_request_templates for each row execute function public.set_updated_at();
create trigger review_requests_set_updated_at before update on public.review_requests for each row execute function public.set_updated_at();
create trigger feedback_surveys_set_updated_at before update on public.feedback_surveys for each row execute function public.set_updated_at();
create trigger feedback_escalations_set_updated_at before update on public.feedback_escalations for each row execute function public.set_updated_at();
create trigger external_reviews_set_updated_at before update on public.external_reviews for each row execute function public.set_updated_at();
create trigger review_response_drafts_set_updated_at before update on public.review_response_drafts for each row execute function public.set_updated_at();
create trigger referral_programs_set_updated_at before update on public.referral_programs for each row execute function public.set_updated_at();
create trigger referral_codes_set_updated_at before update on public.referral_codes for each row execute function public.set_updated_at();
create trigger referrals_set_updated_at before update on public.referrals for each row execute function public.set_updated_at();
create trigger reactivation_segments_set_updated_at before update on public.reactivation_segments for each row execute function public.set_updated_at();
create trigger reactivation_campaigns_set_updated_at before update on public.reactivation_campaigns for each row execute function public.set_updated_at();

create or replace function public.evaluate_review_request_eligibility(
  target_contact_id uuid,
  target_location_id uuid,
  target_appointment_id uuid default null,
  target_treatment_session_id uuid default null,
  target_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_row record;
  cooldown_days integer := 90;
  recent_count integer := 0;
  active_count integer := 0;
  qualifies boolean := false;
  reason text := 'No qualifying completed appointment, treatment, or successful sale was found';
begin
  select * into contact_row from public.contacts where id = target_contact_id;
  if contact_row.id is null then
    return jsonb_build_object('eligible', false, 'reason', 'Contact was not found');
  end if;

  if contact_row.organization_id not in (select public.current_organization_ids()) then
    return jsonb_build_object('eligible', false, 'reason', 'Contact is not available for this user');
  end if;

  if not (public.has_permission('reputation.reviews.read') or public.has_permission('reputation.manage')) then
    return jsonb_build_object('eligible', false, 'reason', 'Missing reputation review permission');
  end if;

  if not exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = target_location_id) then
    return jsonb_build_object('eligible', false, 'reason', 'Selected location is not available for this user');
  end if;

  if contact_row.phone is null and contact_row.email is null then
    return jsonb_build_object('eligible', false, 'reason', 'Contact has no reachable phone or email');
  end if;

  select coalesce(rs.review_request_cooldown_days, 90)
  into cooldown_days
  from public.reputation_settings rs
  where rs.organization_id = contact_row.organization_id
    and (rs.location_id = target_location_id or rs.location_id is null)
  order by rs.location_id nulls last
  limit 1;

  select count(*) into recent_count
  from public.review_requests rr
  where rr.organization_id = contact_row.organization_id
    and rr.contact_id = target_contact_id
    and rr.created_at >= now() - make_interval(days => cooldown_days)
    and rr.status not in ('cancelled', 'failed', 'declined');

  if recent_count > 0 then
    return jsonb_build_object('eligible', false, 'reason', 'Review request cooldown is active', 'cooldown_days', cooldown_days);
  end if;

  select count(*) into active_count
  from public.review_requests rr
  where rr.organization_id = contact_row.organization_id
    and rr.contact_id = target_contact_id
    and rr.status in ('pending', 'sent', 'opened', 'clicked');

  if active_count > 0 then
    return jsonb_build_object('eligible', false, 'reason', 'Contact already has an active review request');
  end if;

  if target_appointment_id is not null and exists (
    select 1 from public.appointments a
    where a.id = target_appointment_id
      and a.contact_id = target_contact_id
      and a.status = 'completed'
  ) then
    qualifies := true;
    reason := 'Completed appointment';
  end if;

  if not qualifies and target_treatment_session_id is not null and exists (
    select 1 from public.treatment_sessions ts
    where ts.id = target_treatment_session_id
      and ts.contact_id = target_contact_id
      and ts.status = 'completed'
  ) then
    qualifies := true;
    reason := 'Completed treatment';
  end if;

  if not qualifies and target_sale_id is not null and exists (
    select 1 from public.sales s
    where s.id = target_sale_id
      and s.contact_id = target_contact_id
      and s.paid_amount_cents > 0
      and s.status <> 'cancelled'
  ) then
    qualifies := true;
    reason := 'Successful payment';
  end if;

  return jsonb_build_object('eligible', qualifies, 'reason', reason, 'cooldown_days', cooldown_days);
end;
$$;

create or replace function public.create_review_request(
  target_contact_id uuid,
  target_location_id uuid,
  target_channel text default 'sms',
  target_review_source_id uuid default null,
  target_appointment_id uuid default null,
  target_treatment_session_id uuid default null,
  target_sale_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row record;
  eligibility jsonb;
  new_id uuid;
begin
  select * into profile_row from public.user_profiles where id = auth.uid();
  if profile_row.id is null then raise exception 'Authenticated user profile was not found'; end if;

  if not public.has_permission('reputation.manage') then
    raise exception 'Missing reputation.manage permission';
  end if;

  if not exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = target_location_id) then
    raise exception 'Selected location is not available for this user';
  end if;

  if target_channel = 'sms' and exists (
    select 1
    from public.contact_communication_preferences ccp
    where ccp.contact_id = target_contact_id
      and ccp.channel = 'sms'
      and (ccp.opted_out or ccp.allowed = false)
  ) then
    raise exception 'Contact is opted out of SMS review requests';
  end if;

  eligibility := public.evaluate_review_request_eligibility(target_contact_id, target_location_id, target_appointment_id, target_treatment_session_id, target_sale_id);
  if not coalesce((eligibility->>'eligible')::boolean, false) then
    raise exception 'Review request is not eligible: %', eligibility->>'reason';
  end if;

  insert into public.review_requests (
    organization_id, location_id, contact_id, appointment_id, treatment_session_id, sale_id,
    requested_by, request_channel, status, review_source_id, eligibility_reason
  )
  values (
    profile_row.organization_id, target_location_id, target_contact_id, target_appointment_id, target_treatment_session_id, target_sale_id,
    profile_row.id, target_channel, 'pending', target_review_source_id, eligibility->>'reason'
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.create_feedback_escalation(target_feedback_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  response_row record;
  survey_row record;
  settings_row record;
  severity_value text;
  existing_id uuid;
  new_id uuid;
begin
  select * into response_row from public.feedback_responses where id = target_feedback_response_id;
  if response_row.id is null then raise exception 'Feedback response was not found'; end if;

  if response_row.organization_id not in (select public.current_organization_ids()) then
    raise exception 'Feedback response is not available for this user';
  end if;
  if not public.has_permission('reputation.feedback.manage') then
    raise exception 'Missing reputation.feedback.manage permission';
  end if;
  if not exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = response_row.location_id) then
    raise exception 'Selected location is not available for this user';
  end if;

  select * into survey_row from public.feedback_surveys where id = response_row.survey_id;
  select * into settings_row
  from public.reputation_settings
  where organization_id = response_row.organization_id
    and (location_id = response_row.location_id or location_id is null)
  order by location_id nulls last
  limit 1;

  if not (
    (response_row.score is not null and response_row.score <= coalesce(settings_row.negative_nps_threshold, 6)) or
    (response_row.rating is not null and response_row.rating <= coalesce(settings_row.negative_csat_threshold, 2))
  ) then
    return null;
  end if;

  select id into existing_id from public.feedback_escalations where feedback_response_id = response_row.id limit 1;
  if existing_id is not null then return existing_id; end if;

  severity_value := case
    when coalesce(response_row.score, 10) <= 3 or coalesce(response_row.rating, 5) <= 1 then 'high'
    when coalesce(response_row.score, 10) <= 6 or coalesce(response_row.rating, 5) <= 2 then 'medium'
    else 'low'
  end;

  insert into public.feedback_escalations (organization_id, location_id, contact_id, feedback_response_id, severity, status, notes)
  values (response_row.organization_id, response_row.location_id, response_row.contact_id, response_row.id, severity_value, 'open', 'Automatically created from deterministic negative-feedback threshold.')
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.issue_referral_reward(target_referral_id uuid, idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  referral_row record;
  program_row record;
  code_row record;
  existing_id uuid;
  event_id uuid;
begin
  select * into referral_row from public.referrals where id = target_referral_id;
  if referral_row.id is null then raise exception 'Referral was not found'; end if;
  if referral_row.organization_id not in (select public.current_organization_ids()) then raise exception 'Referral is not available for this user'; end if;
  if not public.has_permission('referrals.rewards.manage') then raise exception 'Missing referrals.rewards.manage permission'; end if;
  if referral_row.location_id is not null and not exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = referral_row.location_id) then
    raise exception 'Selected location is not available for this user';
  end if;

  select * into code_row from public.referral_codes where id = referral_row.referral_code_id;
  select * into program_row from public.referral_programs where id = code_row.referral_program_id;

  select id into existing_id
  from public.referral_reward_events
  where referral_id = target_referral_id
    and event_type = 'issued'
  limit 1;
  if existing_id is not null then return existing_id; end if;

  insert into public.referral_reward_events (
    organization_id, referring_contact_id, referral_id, event_type, reward_type, amount_cents, reward_value, reason, created_by
  )
  values (
    referral_row.organization_id,
    referral_row.referring_contact_id,
    referral_row.id,
    'issued',
    coalesce(program_row.reward_type, 'none'),
    case when coalesce(program_row.reward_type, 'none') = 'credit' then coalesce(program_row.reward_value, 0) else 0 end,
    coalesce(program_row.reward_value, 0),
    coalesce(idempotency_key, 'Demo referral reward issued after staff approval.'),
    auth.uid()
  )
  returning id into event_id;

  if coalesce(program_row.reward_type, 'none') = 'credit' and coalesce(program_row.reward_value, 0) > 0 then
    insert into public.patient_credit_events (organization_id, contact_id, referral_reward_event_id, event_type, amount_cents, reason, created_by)
    values (referral_row.organization_id, referral_row.referring_contact_id, event_id, 'grant', program_row.reward_value, 'Referral credit grant from approved reward event.', auth.uid());
  end if;

  update public.referrals
  set status = 'reward_issued', updated_at = now()
  where id = referral_row.id;

  return event_id;
end;
$$;

create or replace function public.record_reactivation_attribution(
  target_campaign_id uuid,
  target_contact_id uuid,
  target_event_type text,
  target_appointment_id uuid default null,
  target_sale_id uuid default null,
  target_collected_revenue_cents integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_row record;
  new_id uuid;
begin
  select * into campaign_row from public.reactivation_campaigns where id = target_campaign_id;
  if campaign_row.id is null then raise exception 'Reactivation campaign was not found'; end if;
  if campaign_row.organization_id not in (select public.current_organization_ids()) then raise exception 'Reactivation campaign is not available for this user'; end if;
  if not public.has_permission('reactivation.manage') then raise exception 'Missing reactivation.manage permission'; end if;

  insert into public.reactivation_attributions (
    organization_id, campaign_id, contact_id, appointment_id, sale_id, event_type, collected_revenue_cents
  )
  values (
    campaign_row.organization_id, target_campaign_id, target_contact_id, target_appointment_id, target_sale_id, target_event_type, greatest(coalesce(target_collected_revenue_cents, 0), 0)
  )
  on conflict do nothing
  returning id into new_id;

  update public.reactivation_campaigns
  set contacts_reactivated = (select count(distinct contact_id) from public.reactivation_attributions where campaign_id = target_campaign_id and event_type in ('booked', 'sold', 'paid')),
      bookings_generated = (select count(*) from public.reactivation_attributions where campaign_id = target_campaign_id and event_type = 'booked'),
      sales_generated = (select count(*) from public.reactivation_attributions where campaign_id = target_campaign_id and event_type = 'sold'),
      collected_revenue_cents = (select coalesce(sum(collected_revenue_cents), 0) from public.reactivation_attributions where campaign_id = target_campaign_id),
      updated_at = now()
  where id = target_campaign_id;

  return new_id;
end;
$$;

alter table public.reputation_settings enable row level security;
alter table public.review_sources enable row level security;
alter table public.location_review_sources enable row level security;
alter table public.review_request_templates enable row level security;
alter table public.review_requests enable row level security;
alter table public.feedback_surveys enable row level security;
alter table public.feedback_responses enable row level security;
alter table public.feedback_escalations enable row level security;
alter table public.review_sync_runs enable row level security;
alter table public.external_reviews enable row level security;
alter table public.review_response_drafts enable row level security;
alter table public.referral_programs enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_reward_events enable row level security;
alter table public.patient_credit_events enable row level security;
alter table public.patient_loyalty_snapshots enable row level security;
alter table public.reactivation_segments enable row level security;
alter table public.reactivation_campaigns enable row level security;
alter table public.reactivation_attributions enable row level security;

create policy "tenant reputation settings read" on public.reputation_settings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.read'));
create policy "tenant reputation settings manage" on public.reputation_settings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage'));
create policy "tenant review sources access" on public.review_sources for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reviews.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage'));
create policy "tenant location review sources access" on public.location_review_sources for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reviews.read') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = location_review_sources.location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = location_review_sources.location_id));
create policy "tenant review templates access" on public.review_request_templates for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reviews.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage'));
create policy "tenant review requests read" on public.review_requests for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reviews.read') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = review_requests.location_id));
create policy "tenant review requests manage" on public.review_requests for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = review_requests.location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = review_requests.location_id));
create policy "tenant surveys access" on public.feedback_surveys for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.feedback.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.feedback.manage'));
create policy "tenant feedback responses read" on public.feedback_responses for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.feedback.read') and (exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = feedback_responses.location_id) or provider_id = auth.uid()));
create policy "tenant feedback responses write" on public.feedback_responses for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.feedback.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = feedback_responses.location_id));
create policy "tenant feedback escalations read" on public.feedback_escalations for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.feedback.read') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = feedback_escalations.location_id));
create policy "tenant feedback escalations manage" on public.feedback_escalations for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.feedback.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = feedback_escalations.location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.feedback.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = feedback_escalations.location_id));
create policy "tenant review sync runs access" on public.review_sync_runs for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage'));
create policy "tenant external reviews read" on public.external_reviews for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reviews.read') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = external_reviews.location_id));
create policy "tenant external reviews manage" on public.external_reviews for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = external_reviews.location_id)) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage') and exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = external_reviews.location_id));
create policy "tenant review drafts access" on public.review_response_drafts for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reviews.respond')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reviews.respond'));
create policy "tenant referral programs access" on public.referral_programs for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.manage'));
create policy "tenant referral codes read" on public.referral_codes for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.read'));
create policy "tenant referral codes manage" on public.referral_codes for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.manage'));
create policy "tenant referrals read" on public.referrals for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.read') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = referrals.location_id)));
create policy "tenant referrals manage" on public.referrals for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.manage') and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = referrals.location_id))) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.manage'));
create policy "tenant reward events read" on public.referral_reward_events for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.read'));
create policy "tenant reward events manage" on public.referral_reward_events for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.rewards.manage'));
create policy "tenant patient credit events read" on public.patient_credit_events for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.read'));
create policy "tenant patient credit events manage" on public.patient_credit_events for insert with check (organization_id in (select public.current_organization_ids()) and public.has_permission('referrals.rewards.manage'));
create policy "tenant loyalty snapshots read" on public.patient_loyalty_snapshots for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.reports.read'));
create policy "tenant loyalty snapshots manage" on public.patient_loyalty_snapshots for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reputation.manage'));
create policy "tenant reactivation segments access" on public.reactivation_segments for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reactivation.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reactivation.manage'));
create policy "tenant reactivation campaigns access" on public.reactivation_campaigns for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reactivation.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reactivation.manage'));
create policy "tenant reactivation attributions access" on public.reactivation_attributions for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('reactivation.read')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('reactivation.manage'));

create policy "portal own referral codes" on public.referral_codes for select using (exists (select 1 from public.patient_accounts pa where pa.contact_id = referral_codes.contact_id and pa.auth_user_id = auth.uid() and pa.organization_id = referral_codes.organization_id));
create policy "portal own reward events" on public.referral_reward_events for select using (exists (select 1 from public.patient_accounts pa where pa.contact_id = referral_reward_events.referring_contact_id and pa.auth_user_id = auth.uid() and pa.organization_id = referral_reward_events.organization_id));
create policy "portal own credit events" on public.patient_credit_events for select using (exists (select 1 from public.patient_accounts pa where pa.contact_id = patient_credit_events.contact_id and pa.auth_user_id = auth.uid() and pa.organization_id = patient_credit_events.organization_id));
create policy "portal own feedback responses" on public.feedback_responses for select using (exists (select 1 from public.patient_accounts pa where pa.contact_id = feedback_responses.contact_id and pa.auth_user_id = auth.uid() and pa.organization_id = feedback_responses.organization_id));
create policy "portal own review requests" on public.review_requests for select using (exists (select 1 from public.patient_accounts pa where pa.contact_id = review_requests.contact_id and pa.auth_user_id = auth.uid() and pa.organization_id = review_requests.organization_id));

revoke all on function public.evaluate_review_request_eligibility(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.create_review_request(uuid, uuid, text, uuid, uuid, uuid, uuid) from public;
revoke all on function public.create_feedback_escalation(uuid) from public;
revoke all on function public.issue_referral_reward(uuid, text) from public;
revoke all on function public.record_reactivation_attribution(uuid, uuid, text, uuid, uuid, integer) from public;
grant execute on function public.evaluate_review_request_eligibility(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.create_review_request(uuid, uuid, text, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.create_feedback_escalation(uuid) to authenticated;
grant execute on function public.issue_referral_reward(uuid, text) to authenticated;
grant execute on function public.record_reactivation_attribution(uuid, uuid, text, uuid, uuid, integer) to authenticated;
