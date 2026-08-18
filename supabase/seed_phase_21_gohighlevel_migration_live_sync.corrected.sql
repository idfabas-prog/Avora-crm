do $$
declare
  target_org_id uuid;
  resolved_location_count integer;
begin
  if current_setting('app.environment', true) = 'production' then
    raise exception 'Phase 21 GoHighLevel demo seed must not run in production';
  end if;

  select o.id
  into target_org_id
  from public.organizations o
  where lower(trim(o.slug)) = 'avora'
     or o.id = '10000000-0000-4000-8000-000000000001'::uuid
     or lower(trim(o.name)) in ('avora', 'dev dashboard')
     or exists (
       select 1
       from public.user_profiles up
       join public.roles r on r.id = up.role_id
       where up.organization_id = o.id
         and lower(trim(up.email)) = 'owner@avora-demo.com'
         and lower(trim(r.name)) = 'owner'
     )
  order by
    case
      when lower(trim(o.slug)) = 'avora' then 0
      when o.id = '10000000-0000-4000-8000-000000000001'::uuid then 1
      when lower(trim(o.name)) = 'avora' then 2
      when lower(trim(o.name)) = 'dev dashboard' then 3
      else 4
    end,
    o.created_at
  limit 1;

  if target_org_id is null then
    raise exception 'Phase 21 seed could not find the Avora/Dev Dashboard organization. Expected slug avora, fixed demo org id, name Avora/Dev Dashboard, or owner@avora-demo.com profile.';
  end if;

  with expected_locations(location_key) as (
    values ('miami'), ('tampa'), ('jacksonville')
  ),
  resolved_locations as (
    select distinct on (expected_locations.location_key)
      expected_locations.location_key,
      l.id
    from expected_locations
    join public.locations l
      on l.organization_id = target_org_id
     and (
       lower(trim(l.slug)) = expected_locations.location_key
       or lower(trim(l.name)) = expected_locations.location_key
       or lower(trim(l.city)) = expected_locations.location_key
     )
    order by
      expected_locations.location_key,
      case when lower(trim(l.slug)) = expected_locations.location_key then 0 else 1 end,
      l.created_at
  )
  select count(*)
  into resolved_location_count
  from resolved_locations;

  if resolved_location_count <> 3 then
    raise exception 'Phase 21 seed found % of 3 required demo locations for organization %. Expected Miami, Tampa, and Jacksonville by slug/name/city.', resolved_location_count, target_org_id;
  end if;
end $$;

with target_org as (
  select o.id
  from public.organizations o
  where lower(trim(o.slug)) = 'avora'
     or o.id = '10000000-0000-4000-8000-000000000001'::uuid
     or lower(trim(o.name)) in ('avora', 'dev dashboard')
     or exists (
       select 1
       from public.user_profiles up
       join public.roles r on r.id = up.role_id
       where up.organization_id = o.id
         and lower(trim(up.email)) = 'owner@avora-demo.com'
         and lower(trim(r.name)) = 'owner'
     )
  order by
    case
      when lower(trim(o.slug)) = 'avora' then 0
      when o.id = '10000000-0000-4000-8000-000000000001'::uuid then 1
      when lower(trim(o.name)) = 'avora' then 2
      when lower(trim(o.name)) = 'dev dashboard' then 3
      else 4
    end,
    o.created_at
  limit 1
),
expected_locations(location_key, mock_status) as (
  values
    ('miami', 'healthy'),
    ('tampa', 'warning'),
    ('jacksonville', 'disabled')
),
locations_by_key as (
  select distinct on (el.location_key)
    l.id,
    l.slug,
    l.name,
    el.location_key,
    el.mock_status,
    o.id as organization_id
  from expected_locations el
  join target_org o on true
  join public.locations l
    on l.organization_id = o.id
   and (
     lower(trim(l.slug)) = el.location_key
     or lower(trim(l.name)) = el.location_key
     or lower(trim(l.city)) = el.location_key
   )
  order by
    el.location_key,
    case when lower(trim(l.slug)) = el.location_key then 0 else 1 end,
    l.created_at
),
upserted_connections as (
  insert into public.ghl_connections (
    organization_id,
    location_id,
    display_name,
    ghl_location_id,
    credential_env_key,
    connection_type,
    status,
    sync_mode,
    objects_enabled,
    token_present,
    last_successful_sync_at,
    last_full_sync_at,
    metadata_safe
  )
  select
    organization_id,
    id,
    name || ' Mock GoHighLevel',
    'ghl_mock_' || location_key,
    'GHL_' || upper(location_key) || '_PRIVATE_TOKEN',
    'mock',
    mock_status,
    'development',
    '{"contacts":true,"custom_fields":true,"tags":true,"users":true,"pipelines":true,"opportunities":true,"calendars":true,"appointments":true,"conversations":true,"messages":true,"payments":true}'::jsonb,
    false,
    now() - interval '2 hours',
    now() - interval '1 day',
    jsonb_build_object('seeded', true, 'phase', 21, 'demo_only', true, 'write_gate', 'GHL_ALLOW_WRITES=false')
  from locations_by_key
  on conflict (organization_id, ghl_location_id) do update set
    display_name = excluded.display_name,
    location_id = excluded.location_id,
    credential_env_key = excluded.credential_env_key,
    connection_type = excluded.connection_type,
    status = excluded.status,
    sync_mode = excluded.sync_mode,
    objects_enabled = excluded.objects_enabled,
    token_present = excluded.token_present,
    last_successful_sync_at = excluded.last_successful_sync_at,
    last_full_sync_at = excluded.last_full_sync_at,
    metadata_safe = excluded.metadata_safe
  returning id, organization_id, location_id, display_name, ghl_location_id
),
all_connections as (
  select * from upserted_connections
  union
  select c.id, c.organization_id, c.location_id, c.display_name, c.ghl_location_id
  from public.ghl_connections c
  join target_org o on o.id = c.organization_id
  where c.ghl_location_id in ('ghl_mock_miami', 'ghl_mock_tampa', 'ghl_mock_jacksonville')
),
seeded_contact_targets(location_key, email, first_name, last_name) as (
  values
    ('miami', 'isabella.m@example.com', 'Isabella', 'Martin'),
    ('tampa', 'camila.s@example.com', 'Camila', 'Stone'),
    ('jacksonville', 'danielle.c@example.com', 'Danielle', 'Cross')
),
seeded_contacts as (
  select distinct on (sct.location_key)
    c.id,
    c.organization_id,
    c.location_id,
    c.email,
    c.phone,
    c.first_name,
    c.last_name,
    lbk.location_key,
    'ghl_contact_' || lbk.location_key || '_' || regexp_replace(lower(c.first_name || '_' || c.last_name), '[^a-z0-9_]+', '', 'g') as external_id
  from seeded_contact_targets sct
  join target_org o on true
  join locations_by_key lbk on lbk.location_key = sct.location_key
  join public.contacts c
    on c.organization_id = o.id
   and c.location_id = lbk.id
   and (
     lower(trim(coalesce(c.email, ''))) = sct.email
     or (
       lower(trim(c.first_name)) = lower(trim(sct.first_name))
       and lower(trim(c.last_name)) = lower(trim(sct.last_name))
     )
   )
  order by sct.location_key, case when lower(trim(coalesce(c.email, ''))) = sct.email then 0 else 1 end, c.created_at desc
),
contact_mappings as (
  insert into public.external_record_mappings (
    organization_id,
    location_id,
    provider,
    connection_id,
    external_object_type,
    external_id,
    internal_object_type,
    internal_id,
    external_updated_at,
    checksum,
    metadata_safe
  )
  select
    sc.organization_id,
    sc.location_id,
    'gohighlevel',
    ac.id,
    'contact',
    sc.external_id,
    'contact',
    sc.id,
    now() - interval '2 hours',
    md5(coalesce(sc.email, '') || coalesce(sc.phone, '')),
    jsonb_build_object('seeded', true, 'match_method', 'email_or_name', 'demo_only', true)
  from seeded_contacts sc
  join all_connections ac on ac.location_id = sc.location_id
  on conflict (connection_id, external_object_type, external_id) do update set
    internal_id = excluded.internal_id,
    last_synced_at = now(),
    checksum = excluded.checksum,
    metadata_safe = excluded.metadata_safe
  returning id
),
calendar_mappings as (
  insert into public.external_record_mappings (
    organization_id,
    location_id,
    provider,
    connection_id,
    external_object_type,
    external_id,
    internal_object_type,
    internal_id,
    metadata_safe
  )
  select
    ac.organization_id,
    ac.location_id,
    'gohighlevel',
    ac.id,
    'calendar',
    replace(ac.ghl_location_id, 'ghl_mock_', 'ghl_calendar_'),
    'location_calendar',
    ac.location_id,
    jsonb_build_object('seeded', true, 'calendar_name', split_part(ac.display_name, ' Mock', 1) || ' Consult Calendar', 'demo_only', true)
  from all_connections ac
  where ac.location_id is not null
  on conflict (connection_id, external_object_type, external_id) do update set
    internal_id = excluded.internal_id,
    metadata_safe = excluded.metadata_safe,
    last_synced_at = now()
  returning id
),
appointment_mappings as (
  insert into public.external_record_mappings (
    organization_id,
    location_id,
    provider,
    connection_id,
    external_object_type,
    external_id,
    internal_object_type,
    internal_id,
    external_updated_at,
    metadata_safe
  )
  select
    a.organization_id,
    a.location_id,
    'gohighlevel',
    ac.id,
    'appointment',
    'ghl_appt_' || left(a.id::text, 12),
    'appointment',
    a.id,
    a.updated_at,
    jsonb_build_object('seeded', true, 'status_map', 'scheduled->scheduled', 'read_only_sync', true, 'demo_only', true)
  from public.appointments a
  join all_connections ac on ac.location_id = a.location_id
  join target_org o on o.id = a.organization_id
  order by a.start_at
  limit 9
  on conflict (connection_id, external_object_type, external_id) do update set
    internal_id = excluded.internal_id,
    external_updated_at = excluded.external_updated_at,
    metadata_safe = excluded.metadata_safe,
    last_synced_at = now()
  returning id
),
sync_cursors as (
  insert into public.ghl_sync_cursors (connection_id, object_type, cursor_value, last_external_updated_at, last_sync_started_at, last_sync_completed_at)
  select ac.id, object_type, 'mock_cursor_' || object_type, now() - interval '2 hours', now() - interval '2 hours 10 minutes', now() - interval '2 hours'
  from all_connections ac
  cross join (values
    ('contacts'), ('custom_fields'), ('tags'), ('users'), ('pipelines'), ('opportunities'), ('calendars'), ('appointments'), ('conversations'), ('messages'), ('payments')
  ) as objects(object_type)
  on conflict (connection_id, object_type) do update set
    cursor_value = excluded.cursor_value,
    last_external_updated_at = excluded.last_external_updated_at,
    last_sync_started_at = excluded.last_sync_started_at,
    last_sync_completed_at = excluded.last_sync_completed_at
  returning connection_id
),
inserted_sync_runs as (
  insert into public.ghl_sync_runs (
    organization_id,
    connection_id,
    sync_type,
    object_type,
    status,
    started_at,
    completed_at,
    records_fetched,
    records_created,
    records_updated,
    records_unchanged,
    records_skipped,
    records_failed,
    pages_fetched,
    metadata_safe
  )
  select
    ac.organization_id,
    ac.id,
    run_type,
    object_type,
    'succeeded',
    now() - interval '2 hours',
    now() - interval '1 hour 58 minutes',
    fetched,
    created_count,
    updated_count,
    unchanged_count,
    0,
    0,
    pages,
    jsonb_build_object('seeded', true, 'demo_only', true)
  from all_connections ac
  cross join (values
    ('connection_test', null::text, 1, 0, 0, 1, 1),
    ('dry_run', 'contacts', 12, 0, 0, 12, 2),
    ('reconciliation', null::text, 42, 0, 1, 41, 3)
  ) as runs(run_type, object_type, fetched, created_count, updated_count, unchanged_count, pages)
  where not exists (
    select 1 from public.ghl_sync_runs existing
    where existing.connection_id = ac.id
      and existing.sync_type = runs.run_type
      and coalesce(existing.object_type, '') = coalesce(runs.object_type, '')
      and existing.metadata_safe->>'seeded' = 'true'
  )
  returning id, organization_id, connection_id, sync_type, object_type
),
all_seeded_sync_runs as (
  select * from inserted_sync_runs
  union
  select r.id, r.organization_id, r.connection_id, r.sync_type, r.object_type
  from public.ghl_sync_runs r
  join all_connections ac on ac.id = r.connection_id
  where r.metadata_safe->>'seeded' = 'true'
),
job_anchor_runs as (
  select distinct on (connection_id)
    id,
    organization_id,
    connection_id
  from all_seeded_sync_runs
  where sync_type = 'dry_run'
    and object_type = 'contacts'
  order by connection_id, id
),
sync_jobs as (
  insert into public.ghl_sync_jobs (organization_id, connection_id, sync_run_id, object_type, status, attempts, run_at, completed_at, metadata_safe)
  select
    jar.organization_id,
    jar.connection_id,
    jar.id,
    jobs.object_type,
    'completed',
    1,
    now() - interval '90 minutes',
    now() - interval '88 minutes',
    jsonb_build_object('seeded', true, 'demo_only', true)
  from job_anchor_runs jar
  cross join (values ('contacts'), ('appointments'), ('messages')) as jobs(object_type)
  where not exists (
    select 1
    from public.ghl_sync_jobs existing
    where existing.connection_id = jar.connection_id
      and existing.sync_run_id = jar.id
      and existing.object_type = jobs.object_type
      and existing.metadata_safe->>'seeded' = 'true'
  )
  returning id
),
webhook_events as (
  insert into public.ghl_webhook_events (organization_id, connection_id, provider_event_id, event_type, external_object_id, payload_hash, status, processed_at, metadata_safe)
  select ac.organization_id, ac.id, 'evt_mock_' || replace(ac.ghl_location_id, 'ghl_mock_', ''), 'ContactUpdated', 'ghl_contact_mock', md5(ac.id::text || ':contact-updated'), 'processed', now() - interval '30 minutes', jsonb_build_object('seeded', true, 'demo_only', true)
  from all_connections ac
  on conflict (connection_id, payload_hash) do update set
    provider_event_id = excluded.provider_event_id,
    status = excluded.status,
    processed_at = excluded.processed_at,
    metadata_safe = excluded.metadata_safe
  returning id
),
custom_fields as (
  insert into public.ghl_custom_field_mappings (organization_id, connection_id, external_field_id, external_field_name, internal_field_key, data_type, enabled)
  select ac.organization_id, ac.id, field_id, field_name, internal_key, data_type, enabled
  from all_connections ac
  cross join (values
    ('cf_hair_goal', 'Hair Goal', 'hair_goal', 'text', false),
    ('cf_budget_range', 'Budget Range', 'budget_range', 'select', false),
    ('cf_preferred_contact', 'Preferred Contact Method', 'preferred_contact_method', 'select', true)
  ) as fields(field_id, field_name, internal_key, data_type, enabled)
  on conflict (connection_id, external_field_id) do update set
    external_field_name = excluded.external_field_name,
    internal_field_key = excluded.internal_field_key,
    data_type = excluded.data_type,
    enabled = excluded.enabled
  returning id
),
user_mappings as (
  insert into public.ghl_user_mappings (organization_id, connection_id, external_user_id, internal_user_id, external_name, external_email, linked)
  select ac.organization_id, ac.id, 'ghl_user_' || right(up.id::text, 8), up.id, up.full_name, up.email, true
  from all_connections ac
  join public.user_profiles up on up.organization_id = ac.organization_id
  join public.roles r on r.id = up.role_id
  where r.name in ('owner', 'manager', 'salesperson', 'provider')
  on conflict (connection_id, external_user_id) do update set
    internal_user_id = excluded.internal_user_id,
    external_name = excluded.external_name,
    external_email = excluded.external_email,
    linked = excluded.linked
  returning id
),
exceptions as (
  insert into public.ghl_sync_exceptions (organization_id, location_id, connection_id, exception_type, object_type, external_id, status, severity, summary, metadata_safe)
  select ac.organization_id, ac.location_id, ac.id, exception_type, object_type, external_id, status, severity, summary, jsonb_build_object('seeded', true, 'demo_only', true)
  from all_connections ac
  cross join (values
    ('unmapped_user', 'appointment', 'ghl_user_unknown_provider', 'open', 'warning', 'Provider exists in GoHighLevel but is not linked to a Dev Dashboard user.'),
    ('api_unsupported', 'payment', 'ghl_payment_history_scope', 'review', 'info', 'Payment history availability depends on current GHL payment API scope support.')
  ) as items(exception_type, object_type, external_id, status, severity, summary)
  where not exists (
    select 1 from public.ghl_sync_exceptions existing
    where existing.connection_id = ac.id
      and existing.exception_type = items.exception_type
      and existing.object_type = items.object_type
      and existing.external_id = items.external_id
  )
  returning id
)
select 'phase_21_seed_verification' as section, metric, count_value
from (
  select 'target_organization_found' as metric, count(*)::integer as count_value from target_org
  union all select 'target_locations_found', count(*)::integer from locations_by_key
  union all select 'seeded_contacts_found', count(*)::integer from seeded_contacts
  union all select 'seedable_appointments_found', count(*)::integer from public.appointments a join all_connections c on c.location_id = a.location_id
  union all select 'ghl_connections', count(*)::integer from public.ghl_connections c join target_org o on o.id = c.organization_id where c.metadata_safe->>'seeded' = 'true'
  union all select 'external_record_mappings', count(*)::integer from public.external_record_mappings m join target_org o on o.id = m.organization_id where m.provider = 'gohighlevel'
  union all select 'ghl_sync_cursors', count(*)::integer from public.ghl_sync_cursors cur join all_connections c on c.id = cur.connection_id
  union all select 'ghl_sync_runs', count(*)::integer from public.ghl_sync_runs r join all_connections c on c.id = r.connection_id where r.metadata_safe->>'seeded' = 'true'
  union all select 'ghl_sync_jobs', count(*)::integer from public.ghl_sync_jobs j join all_connections c on c.id = j.connection_id where j.metadata_safe->>'seeded' = 'true'
  union all select 'ghl_sync_events', count(*)::integer from public.ghl_sync_events e join all_connections c on c.id = e.connection_id
  union all select 'ghl_webhook_events', count(*)::integer from public.ghl_webhook_events w join all_connections c on c.id = w.connection_id where w.metadata_safe->>'seeded' = 'true'
  union all select 'ghl_custom_field_mappings', count(*)::integer from public.ghl_custom_field_mappings f join all_connections c on c.id = f.connection_id
  union all select 'ghl_user_mappings', count(*)::integer from public.ghl_user_mappings u join all_connections c on c.id = u.connection_id
  union all select 'ghl_sync_exceptions', count(*)::integer from public.ghl_sync_exceptions e join all_connections c on c.id = e.connection_id where e.metadata_safe->>'seeded' = 'true'
) counts
order by metric;
