insert into public.permissions (key, description)
values
  ('mobile.use', 'Use mobile Avora experience'),
  ('mobile.staff', 'Use staff mobile workspace'),
  ('mobile.patient', 'Use patient mobile workspace'),
  ('mobile.push.manage', 'Manage mobile push registrations'),
  ('mobile.devices.manage', 'Manage mobile devices'),
  ('mobile.settings.manage', 'Manage mobile settings')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'mobile.use',
  'mobile.staff',
  'mobile.push.manage',
  'mobile.devices.manage',
  'mobile.settings.manage'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('mobile.use', 'mobile.staff')
where r.name in ('manager', 'salesperson', 'provider')
on conflict do nothing;

create table public.mobile_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pwa_enabled boolean not null default true,
  patient_mobile_enabled boolean not null default true,
  staff_mobile_enabled boolean not null default true,
  push_enabled boolean not null default false,
  install_prompt_enabled boolean not null default true,
  role_navigation_json jsonb not null default '{}'::jsonb,
  native_readiness_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  patient_account_id uuid references public.patient_accounts(id) on delete cascade,
  device_name text not null,
  device_type text not null check (device_type in ('phone', 'tablet', 'desktop', 'unknown')),
  platform text not null check (platform in ('ios', 'android', 'ipad', 'web', 'desktop', 'unknown')),
  push_provider text not null default 'development' check (push_provider in ('development', 'web_push', 'firebase', 'apns', 'expo', 'none')),
  push_token_encrypted_or_server_only text,
  active boolean not null default true,
  push_enabled boolean not null default false,
  last_seen_at timestamptz,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_registration_actor_check check (
    (user_id is not null and patient_account_id is null) or
    (user_id is null and patient_account_id is not null)
  )
);

create unique index device_registrations_user_device_uidx
on public.device_registrations (organization_id, user_id, lower(device_name))
where user_id is not null;

create unique index device_registrations_patient_device_uidx
on public.device_registrations (organization_id, patient_account_id, lower(device_name))
where patient_account_id is not null;

create table public.mobile_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  patient_account_id uuid references public.patient_accounts(id) on delete cascade,
  appointments boolean not null default true,
  tasks boolean not null default true,
  calls boolean not null default true,
  messages boolean not null default true,
  payments boolean not null default true,
  campaigns boolean not null default false,
  workforce boolean not null default true,
  inventory boolean not null default true,
  executive boolean not null default false,
  quiet_hours_json jsonb not null default '{"enabled":true,"start":"21:00","end":"08:00"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_notification_preferences_actor_check check (
    (user_id is not null and patient_account_id is null) or
    (user_id is null and patient_account_id is not null)
  )
);

create unique index mobile_notification_preferences_user_uidx
on public.mobile_notification_preferences (organization_id, user_id)
where user_id is not null;

create unique index mobile_notification_preferences_patient_uidx
on public.mobile_notification_preferences (organization_id, patient_account_id)
where patient_account_id is not null;

create table public.mobile_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  patient_account_id uuid references public.patient_accounts(id) on delete cascade,
  notification_type text not null check (notification_type in ('appointment_reminder', 'new_message', 'missed_call', 'task_assigned', 'pto_decision', 'schedule_changed', 'payment_due', 'consent_required', 'package_remaining', 'inventory_alert', 'executive_alert', 'mobile_test')),
  title text not null,
  body_safe text not null,
  status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  deep_link text,
  metadata_safe jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_notifications_actor_check check (
    (user_id is not null and patient_account_id is null) or
    (user_id is null and patient_account_id is not null)
  )
);

create index mobile_notifications_user_status_idx on public.mobile_notifications (organization_id, user_id, status, created_at desc) where user_id is not null;
create index mobile_notifications_patient_status_idx on public.mobile_notifications (organization_id, patient_account_id, status, created_at desc) where patient_account_id is not null;

create table public.mobile_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  patient_account_id uuid references public.patient_accounts(id) on delete cascade,
  draft_type text not null check (draft_type in ('clinical_note', 'task', 'contact_note', 'campaign_future', 'form_input')),
  route text not null,
  entity_table text,
  entity_id uuid,
  draft_payload jsonb not null default '{}'::jsonb,
  sensitivity text not null default 'standard' check (sensitivity in ('standard', 'clinical', 'financial')),
  expires_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_drafts_actor_check check (
    (user_id is not null and patient_account_id is null) or
    (user_id is null and patient_account_id is not null)
  )
);

create unique index mobile_drafts_user_route_uidx
on public.mobile_drafts (organization_id, user_id, draft_type, route, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
where user_id is not null and discarded_at is null;

create unique index mobile_drafts_patient_route_uidx
on public.mobile_drafts (organization_id, patient_account_id, draft_type, route, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
where patient_account_id is not null and discarded_at is null;

create table public.mobile_app_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  patient_account_id uuid references public.patient_accounts(id) on delete set null,
  event_type text not null check (event_type in ('pwa_installed', 'mobile_session', 'quick_action_used', 'push_opened_future', 'offline_seen', 'draft_saved', 'deep_link_opened', 'device_registered')),
  platform text not null default 'web',
  route text,
  metadata_safe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mobile_settings_org_idx on public.mobile_settings (organization_id);
create index device_registrations_actor_idx on public.device_registrations (organization_id, user_id, patient_account_id, active);
create index mobile_drafts_actor_idx on public.mobile_drafts (organization_id, user_id, patient_account_id, draft_type, updated_at desc);
create index mobile_app_events_org_type_idx on public.mobile_app_events (organization_id, event_type, created_at desc);

drop trigger if exists mobile_settings_set_updated_at on public.mobile_settings;
create trigger mobile_settings_set_updated_at before update on public.mobile_settings for each row execute function public.set_updated_at();
drop trigger if exists device_registrations_set_updated_at on public.device_registrations;
create trigger device_registrations_set_updated_at before update on public.device_registrations for each row execute function public.set_updated_at();
drop trigger if exists mobile_notification_preferences_set_updated_at on public.mobile_notification_preferences;
create trigger mobile_notification_preferences_set_updated_at before update on public.mobile_notification_preferences for each row execute function public.set_updated_at();
drop trigger if exists mobile_notifications_set_updated_at on public.mobile_notifications;
create trigger mobile_notifications_set_updated_at before update on public.mobile_notifications for each row execute function public.set_updated_at();
drop trigger if exists mobile_drafts_set_updated_at on public.mobile_drafts;
create trigger mobile_drafts_set_updated_at before update on public.mobile_drafts for each row execute function public.set_updated_at();

create or replace function public.mobile_mark_notification_read(target_notification_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  update public.mobile_notifications mn
  set status = 'read',
      read_at = coalesce(read_at, now()),
      updated_at = now()
  where mn.id = target_notification_id
    and (
      (mn.user_id = auth.uid()) or
      exists (select 1 from public.patient_accounts pa where pa.id = mn.patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active')
    )
  returning mn.id into updated_id;

  return updated_id;
end;
$$;

create or replace function public.mobile_deactivate_device(target_device_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id uuid;
begin
  update public.device_registrations dr
  set active = false,
      push_enabled = false,
      updated_at = now()
  where dr.id = target_device_id
    and (
      dr.user_id = auth.uid() or
      exists (select 1 from public.patient_accounts pa where pa.id = dr.patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active') or
      (dr.organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.devices.manage'))
    )
  returning dr.id into updated_id;

  return updated_id;
end;
$$;

alter table public.mobile_settings enable row level security;
alter table public.device_registrations enable row level security;
alter table public.mobile_notification_preferences enable row level security;
alter table public.mobile_notifications enable row level security;
alter table public.mobile_drafts enable row level security;
alter table public.mobile_app_events enable row level security;

create policy "tenant mobile settings read" on public.mobile_settings for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.use'));
create policy "tenant mobile settings manage" on public.mobile_settings for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.settings.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.settings.manage'));
create policy "patient mobile settings read" on public.mobile_settings for select using (exists (select 1 from public.patient_accounts pa where pa.organization_id = mobile_settings.organization_id and pa.auth_user_id = auth.uid() and pa.status = 'active'));

create policy "tenant device registrations read" on public.device_registrations for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.devices.manage'));
create policy "tenant device registrations manage" on public.device_registrations for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.devices.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.devices.manage'));
create policy "own user device registrations access" on public.device_registrations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own patient device registrations access" on public.device_registrations for all using (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active')) with check (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active'));

create policy "tenant mobile notification preferences read" on public.mobile_notification_preferences for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.push.manage'));
create policy "tenant mobile notification preferences manage" on public.mobile_notification_preferences for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.push.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.push.manage'));
create policy "own user mobile preferences access" on public.mobile_notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own patient mobile preferences access" on public.mobile_notification_preferences for all using (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active')) with check (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active'));

create policy "tenant mobile notifications read" on public.mobile_notifications for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.push.manage'));
create policy "tenant mobile notifications manage" on public.mobile_notifications for all using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.push.manage')) with check (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.push.manage'));
create policy "own user mobile notifications read" on public.mobile_notifications for select using (user_id = auth.uid());
create policy "own user mobile notifications update status" on public.mobile_notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid() and status in ('read', 'dismissed'));
create policy "own patient mobile notifications read" on public.mobile_notifications for select using (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active'));
create policy "own patient mobile notifications update status" on public.mobile_notifications for update using (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active')) with check (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active') and status in ('read', 'dismissed'));

create policy "own user mobile drafts access" on public.mobile_drafts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own patient mobile drafts access" on public.mobile_drafts for all using (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active')) with check (exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active'));
create policy "tenant clinical draft visibility" on public.mobile_drafts for select using (organization_id in (select public.current_organization_ids()) and sensitivity = 'clinical' and public.has_permission('clinical.read'));

create policy "own mobile events insert" on public.mobile_app_events for insert with check (
  (user_id = auth.uid()) or
  exists (select 1 from public.patient_accounts pa where pa.id = patient_account_id and pa.auth_user_id = auth.uid() and pa.status = 'active')
);
create policy "tenant mobile events read" on public.mobile_app_events for select using (organization_id in (select public.current_organization_ids()) and public.has_permission('mobile.settings.manage'));

revoke all on function public.mobile_mark_notification_read(uuid) from public;
revoke all on function public.mobile_deactivate_device(uuid) from public;
grant execute on function public.mobile_mark_notification_read(uuid) to authenticated;
grant execute on function public.mobile_deactivate_device(uuid) to authenticated;
