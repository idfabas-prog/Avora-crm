do $$
begin
  if current_setting('app.environment', true) = 'production' then
    raise exception 'Phase 21 GoHighLevel demo seed must not run in production';
  end if;
end $$;

with avora_org as (
  select id from public.organizations where lower(trim(slug)) = 'avora' limit 1
),
locations_by_slug as (
  select l.id, l.slug, l.name, o.id as organization_id
  from public.locations l
  join avora_org o on o.id = l.organization_id
  where lower(trim(l.slug)) in ('miami', 'tampa', 'jacksonville')
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
    'ghl_mock_' || lower(trim(slug)),
    'GHL_' || upper(trim(slug)) || '_PRIVATE_TOKEN',
    'mock',
    case when slug = 'miami' then 'healthy' when slug = 'tampa' then 'warning' else 'disabled' end,
    'development',
    '{"contacts":true,"custom_fields":true,"tags":true,"users":true,"pipelines":true,"opportunities":true,"calendars":true,"appointments":true,"conversations":true,"messages":true,"payments":true}'::jsonb,
    false,
    now() - interval '2 hours',
    now() - interval '1 day',
    jsonb_build_object('seeded', true, 'phase', 21, 'demo_only', true)
  from locations_by_slug
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
  join avora_org o on o.id = c.organization_id
  where c.ghl_location_id in ('ghl_mock_miami', 'ghl_mock_tampa', 'ghl_mock_jacksonville')
),
seeded_contacts as (
  select c.id, c.organization_id, c.location_id, c.email, c.phone, c.first_name, c.last_name,
    'ghl_contact_' || lower(coalesce(l.slug, 'global')) || '_' || regexp_replace(lower(c.first_name || '_' || c.last_name), '[^a-z0-9_]+', '', 'g') as external_id
  from public.contacts c
  join public.locations l on l.id = c.location_id
  join avora_org o on o.id = c.organization_id
  where lower(c.email) in ('ava.martinez@example.com', 'jordan.lee@example.com', 'taylor.reed@example.com')
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
    jsonb_build_object('seeded', true, 'match_method', 'email', 'demo_only', true)
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
    jsonb_build_object('seeded', true, 'status_map', 'scheduled->scheduled', 'read_only_sync', true)
  from public.appointments a
  join all_connections ac on ac.location_id = a.location_id
  join avora_org o on o.id = a.organization_id
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
sync_runs as (
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
  returning id, organization_id, connection_id
),
sync_jobs as (
  insert into public.ghl_sync_jobs (organization_id, connection_id, sync_run_id, object_type, status, attempts, run_at, metadata_safe)
  select sr.organization_id, sr.connection_id, sr.id, object_type, 'completed', 1, now() - interval '90 minutes', jsonb_build_object('seeded', true, 'demo_only', true)
  from sync_runs sr
  cross join (values ('contacts'), ('appointments'), ('messages')) as jobs(object_type)
  on conflict do nothing
  returning id
),
webhook_events as (
  insert into public.ghl_webhook_events (organization_id, connection_id, provider_event_id, event_type, external_object_id, payload_hash, status, processed_at, metadata_safe)
  select ac.organization_id, ac.id, 'evt_mock_' || right(ac.ghl_location_id, 5), 'ContactUpdated', 'ghl_contact_mock', md5(ac.id::text || ':contact-updated'), 'processed', now() - interval '30 minutes', jsonb_build_object('seeded', true, 'demo_only', true)
  from all_connections ac
  on conflict (connection_id, payload_hash) do update set
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
  select 'ghl_connections' as metric, count(*)::integer as count_value from public.ghl_connections c join avora_org o on o.id = c.organization_id where c.metadata_safe->>'seeded' = 'true'
  union all select 'external_record_mappings', count(*)::integer from public.external_record_mappings m join avora_org o on o.id = m.organization_id where m.provider = 'gohighlevel'
  union all select 'ghl_sync_cursors', count(*)::integer from public.ghl_sync_cursors cur join all_connections c on c.id = cur.connection_id
  union all select 'ghl_sync_runs', count(*)::integer from public.ghl_sync_runs r join all_connections c on c.id = r.connection_id where r.metadata_safe->>'seeded' = 'true'
  union all select 'ghl_sync_jobs', count(*)::integer from public.ghl_sync_jobs j join all_connections c on c.id = j.connection_id where j.metadata_safe->>'seeded' = 'true'
  union all select 'ghl_webhook_events', count(*)::integer from public.ghl_webhook_events w join all_connections c on c.id = w.connection_id where w.metadata_safe->>'seeded' = 'true'
  union all select 'ghl_custom_field_mappings', count(*)::integer from public.ghl_custom_field_mappings f join all_connections c on c.id = f.connection_id
  union all select 'ghl_user_mappings', count(*)::integer from public.ghl_user_mappings u join all_connections c on c.id = u.connection_id
  union all select 'ghl_sync_exceptions', count(*)::integer from public.ghl_sync_exceptions e join all_connections c on c.id = e.connection_id where e.metadata_safe->>'seeded' = 'true'
) counts
order by metric;
