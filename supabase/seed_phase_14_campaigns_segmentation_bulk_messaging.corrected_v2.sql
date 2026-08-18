with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
    and r.name = 'owner'
  limit 1
),
upserted_settings as (
  insert into public.campaign_settings (
    organization_id,
    max_sms_per_minute,
    max_sms_per_hour,
    daily_contact_frequency_cap,
    weekly_contact_frequency_cap,
    quiet_hours_enabled,
    quiet_hours_start,
    quiet_hours_end,
    weekends_enabled,
    booking_attribution_window_days,
    sale_attribution_window_days,
    approval_required,
    max_recipients_per_campaign,
    simulation_mode
  )
  select org.id, 25, 250, 2, 5, true, '20:00', '09:00', true, 7, 30, true, 500, true
  from avora_org org
  where true
  on conflict (organization_id)
  do update set
    max_sms_per_minute = excluded.max_sms_per_minute,
    max_sms_per_hour = excluded.max_sms_per_hour,
    daily_contact_frequency_cap = excluded.daily_contact_frequency_cap,
    weekly_contact_frequency_cap = excluded.weekly_contact_frequency_cap,
    quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end,
    weekends_enabled = excluded.weekends_enabled,
    booking_attribution_window_days = excluded.booking_attribution_window_days,
    sale_attribution_window_days = excluded.sale_attribution_window_days,
    approval_required = excluded.approval_required,
    max_recipients_per_campaign = excluded.max_recipients_per_campaign,
    simulation_mode = excluded.simulation_mode
  returning id
)
select 'phase_14_campaign_settings' as section, count(*) as upserted_rows from upserted_settings;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
  limit 1
),
segment_rows as (
  select
    org.id as organization_id,
    row.name,
    row.description,
    row.segment_type,
    row.rules_json::jsonb as rules_json,
    row.location_scope::jsonb as location_scope,
    true as active,
    owner_user.id as created_by
  from avora_org org
  cross join owner_user
  join (
    values
      ('Miami Hair Consult No-Sale - 30 Days', 'Demo dynamic segment for Miami hair consultation leads who showed but did not buy recently.', 'dynamic', '{"logic":"and","conditions":[{"field":"location_slug","operator":"equals","value":"miami"},{"field":"appointment_status","operator":"equals","value":"completed"},{"field":"purchased_services","operator":"does_not_contain","value":"Hair"},{"field":"last_appointment_days","operator":"less_than_or_equal","value":30}]}', '{"mode":"locations","location_slugs":["miami"]}'),
      ('Inactive 180 Days', 'Demo lifecycle reactivation segment.', 'dynamic', '{"logic":"and","conditions":[{"field":"days_since_contact","operator":"greater_than_or_equal","value":180},{"field":"sms_opted_out","operator":"equals","value":false}]}', '{"mode":"all_allowed","location_ids":[]}'),
      ('Unused Hair Package', 'Demo package-utilization segment.', 'dynamic', '{"logic":"and","conditions":[{"field":"package_remaining","operator":"greater_than","value":0},{"field":"purchased_services","operator":"contains","value":"Hair"}]}', '{"mode":"all_allowed","location_ids":[]}'),
      ('Active Membership', 'Demo active membership lifecycle segment.', 'dynamic', '{"logic":"and","conditions":[{"field":"membership_status","operator":"in","value":["trial","active"]}]}', '{"mode":"all_allowed","location_ids":[]}'),
      ('High-Value Patients', 'Demo high-value patients segment.', 'dynamic', '{"logic":"and","conditions":[{"field":"lifetime_collected_cents","operator":"greater_than_or_equal","value":500000}]}', '{"mode":"all_allowed","location_ids":[]}'),
      ('Jacksonville No-Show Follow-Up', 'Demo Jacksonville no-show recovery segment.', 'dynamic', '{"logic":"and","conditions":[{"field":"location_slug","operator":"equals","value":"jacksonville"},{"field":"no_show_count","operator":"greater_than","value":0}]}', '{"mode":"locations","location_slugs":["jacksonville"]}'),
      ('Internal Test Contacts', 'Demo static internal test list for simulated sends.', 'static', '{"logic":"and","conditions":[]}', '{"mode":"all_allowed","location_ids":[]}')
  ) as row(name, description, segment_type, rules_json, location_scope) on true
),
upserted_segments as (
  insert into public.segments (
    organization_id,
    name,
    description,
    segment_type,
    rules_json,
    location_scope,
    active,
    created_by
  )
  select organization_id, name, description, segment_type, rules_json, location_scope, active, created_by
  from segment_rows
  where true
  on conflict (organization_id, name)
  do update set
    description = excluded.description,
    segment_type = excluded.segment_type,
    rules_json = excluded.rules_json,
    location_scope = excluded.location_scope,
    active = excluded.active
  returning id
)
select 'phase_14_segments' as section, count(*) as upserted_rows from upserted_segments;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
  limit 1
),
ranked_contacts as (
  select c.id, row_number() over (order by c.created_at, c.id) as rn
  from public.contacts c
  join avora_org org on org.id = c.organization_id
  limit 3
),
test_segment as (
  select s.id
  from public.segments s
  join avora_org org on org.id = s.organization_id
  where s.name = 'Internal Test Contacts'
  limit 1
),
inserted_members as (
  insert into public.segment_members (segment_id, contact_id, added_by)
  select test_segment.id, ranked_contacts.id, owner_user.id
  from test_segment
  cross join ranked_contacts
  cross join owner_user
  where true
  on conflict (segment_id, contact_id) do nothing
  returning contact_id
)
select 'phase_14_segment_members' as section, count(*) as inserted_rows from inserted_members;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
  limit 1
),
list_rows as (
  select org.id as organization_id, row.name, row.description, row.suppression_type, true as active, owner_user.id as created_by
  from avora_org org
  cross join owner_user
  join (
    values
      ('Global SMS Suppression', 'Demo global SMS suppression list.', 'global_sms'),
      ('Do Not Contact', 'Demo do-not-contact suppression list.', 'do_not_contact'),
      ('Legal Hold', 'Demo legal hold suppression list.', 'legal_hold'),
      ('Internal Test Contacts', 'Demo contacts used for simulated test sends.', 'internal_test'),
      ('Campaign Exclusion', 'Demo campaign-specific exclusion list.', 'campaign_exclusion')
  ) as row(name, description, suppression_type) on true
),
upserted_lists as (
  insert into public.suppression_lists (organization_id, name, description, suppression_type, active, created_by)
  select organization_id, name, description, suppression_type, active, created_by
  from list_rows
  where true
  on conflict (organization_id, name)
  do update set description = excluded.description, suppression_type = excluded.suppression_type, active = excluded.active
  returning id
)
select 'phase_14_suppression_lists' as section, count(*) as upserted_rows from upserted_lists;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
  limit 1
),
ranked_contacts as (
  select c.id, row_number() over (order by c.created_at, c.id) as rn
  from public.contacts c
  join avora_org org on org.id = c.organization_id
  limit 2
),
member_rows as (
  select sl.id as suppression_list_id, rc.id as contact_id, 'Demo suppression safety check' as reason, owner_user.id as added_by
  from public.suppression_lists sl
  join avora_org org on org.id = sl.organization_id
  join ranked_contacts rc on rc.rn = case when sl.name = 'Campaign Exclusion' then 1 when sl.name = 'Internal Test Contacts' then 2 else null end
  cross join owner_user
),
inserted_members as (
  insert into public.suppression_list_members (suppression_list_id, contact_id, reason, added_by)
  select suppression_list_id, contact_id, reason, added_by
  from member_rows
  where true
  on conflict (suppression_list_id, contact_id) do nothing
  returning contact_id
)
select 'phase_14_suppression_members' as section, count(*) as inserted_rows from inserted_members;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
owner_user as (
  select up.id, up.organization_id
  from public.user_profiles up
  join avora_org org on org.id = up.organization_id
  where lower(up.email) = 'owner@avora-demo.com'
  limit 1
),
segments_by_name as (
  select s.id, s.name
  from public.segments s
  join avora_org org on org.id = s.organization_id
),
workflow_choice as (
  select w.id
  from public.workflows w
  join avora_org org on org.id = w.organization_id
  where w.status in ('active', 'draft')
  order by case when w.status = 'active' then 0 else 1 end, w.name
  limit 1
),
campaign_rows as (
  select
    org.id as organization_id,
    row.name,
    row.description,
    row.campaign_type,
    row.status,
    s.id as segment_id,
    case when row.campaign_type = 'workflow_enrollment' then workflow_choice.id else null end as workflow_id,
    row.channel,
    row.message_classification,
    row.scheduled_at,
    row.recurrence_rule,
    row.location_scope::jsonb as location_scope,
    owner_user.id as created_by,
    row.metadata::jsonb as metadata
  from avora_org org
  cross join owner_user
  left join workflow_choice on true
  join (
    values
      ('Hair Consult Follow-Up', 'Completed simulated A/B campaign for hair consult no-sale follow-up.', 'bulk_message', 'completed', 'Miami Hair Consult No-Sale - 30 Days', 'sms', 'campaign', null::timestamptz, null::text, '{"mode":"locations","location_slugs":["miami"]}', '{"demo":true,"simulation":true}'),
      ('180-Day Reactivation', 'Draft recurring lifecycle reactivation campaign.', 'reactivation', 'draft', 'Inactive 180 Days', 'sms', 'reactivation', null::timestamptz, 'FREQ=MONTHLY', '{"mode":"all_allowed","location_ids":[]}', '{"demo":true,"simulation":true}'),
      ('Unused Package Reminder', 'Draft reminder for unused package value.', 'reminder', 'draft', 'Unused Hair Package', 'sms', 'operational', null::timestamptz, null::text, '{"mode":"all_allowed","location_ids":[]}', '{"demo":true,"simulation":true}'),
      ('Membership Win-Back', 'Draft membership recovery campaign.', 'promotion', 'draft', 'Active Membership', 'sms', 'marketing', null::timestamptz, null::text, '{"mode":"all_allowed","location_ids":[]}', '{"demo":true,"simulation":true}'),
      ('Referral Reminder', 'Draft referral lifecycle campaign.', 'promotion', 'draft', 'High-Value Patients', 'sms', 'campaign', null::timestamptz, null::text, '{"mode":"all_allowed","location_ids":[]}', '{"demo":true,"simulation":true}'),
      ('Holiday Hours Announcement', 'Draft announcement for internal review.', 'announcement', 'draft', 'Internal Test Contacts', 'sms', 'operational', null::timestamptz, null::text, '{"mode":"all_allowed","location_ids":[]}', '{"demo":true,"simulation":true}'),
      ('Draft Workflow Enrollment Demo', 'Draft campaign for eligible contact workflow enrollment without duplicating the workflow engine.', 'workflow_enrollment', 'draft', 'Jacksonville No-Show Follow-Up', 'workflow', 'campaign', null::timestamptz, null::text, '{"mode":"locations","location_slugs":["jacksonville"]}', '{"demo":true,"simulation":true}')
  ) as row(name, description, campaign_type, status, segment_name, channel, message_classification, scheduled_at, recurrence_rule, location_scope, metadata) on true
  left join segments_by_name s on s.name = row.segment_name
),
upserted_campaigns as (
  insert into public.campaigns (
    organization_id,
    name,
    description,
    campaign_type,
    status,
    segment_id,
    workflow_id,
    channel,
    message_classification,
    scheduled_at,
    recurrence_rule,
    location_scope,
    created_by,
    launched_at,
    completed_at,
    metadata
  )
  select
    organization_id,
    name,
    description,
    campaign_type,
    status,
    segment_id,
    workflow_id,
    channel,
    message_classification,
    scheduled_at,
    recurrence_rule,
    location_scope,
    created_by,
    case when status = 'completed' then now() - interval '10 days' else null end,
    case when status = 'completed' then now() - interval '9 days' else null end,
    metadata
  from campaign_rows
  where true
  on conflict (organization_id, name)
  do update set
    description = excluded.description,
    campaign_type = excluded.campaign_type,
    status = excluded.status,
    segment_id = excluded.segment_id,
    workflow_id = excluded.workflow_id,
    channel = excluded.channel,
    message_classification = excluded.message_classification,
    scheduled_at = excluded.scheduled_at,
    recurrence_rule = excluded.recurrence_rule,
    location_scope = excluded.location_scope,
    metadata = excluded.metadata
  returning id
)
select 'phase_14_campaigns' as section, count(*) as upserted_rows from upserted_campaigns;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
campaigns_by_name as (
  select c.id, c.name
  from public.campaigns c
  join avora_org org on org.id = c.organization_id
),
variant_rows as (
  select c.id as campaign_id, row.variant_name, row.message_body, row.weight_percent
  from campaigns_by_name c
  join (
    values
      ('Hair Consult Follow-Up', 'Variant A', 'Hi {{first_name}}, checking in after your Avora consultation. Want help choosing the next step?', 50),
      ('Hair Consult Follow-Up', 'Variant B', 'Hi {{first_name}}, Avora can answer questions from your consultation and help you book when ready.', 50),
      ('180-Day Reactivation', 'Variant A', 'Hi {{first_name}}, we would love to see you again at Avora. Reply BOOK for scheduling help.', 50),
      ('180-Day Reactivation', 'Variant B', 'Hi {{first_name}}, Avora has appointment options this month if you are ready to reconnect.', 50),
      ('Unused Package Reminder', 'Package Reminder', 'Hi {{first_name}}, you still have package value available at Avora. Reply HELP for options.', 100),
      ('Membership Win-Back', 'Membership Reminder', 'Hi {{first_name}}, your Avora membership benefits are available for review.', 100),
      ('Referral Reminder', 'Referral Reminder', 'Hi {{first_name}}, Avora referral reminders are available in your account.', 100),
      ('Holiday Hours Announcement', 'Holiday Hours', 'Hi {{first_name}}, Avora holiday hours are available. Reply with questions.', 100),
      ('Draft Workflow Enrollment Demo', 'Workflow Enrollment', 'Workflow enrollment demo - no SMS is sent by this draft campaign.', 100)
  ) as row(campaign_name, variant_name, message_body, weight_percent) on row.campaign_name = c.name
),
upserted_variants as (
  insert into public.campaign_variants (campaign_id, name, message_body, weight_percent, active)
  select campaign_id, variant_name, message_body, weight_percent, true
  from variant_rows
  where true
  on conflict (campaign_id, name)
  do update set message_body = excluded.message_body, weight_percent = excluded.weight_percent, active = true
  returning id
)
select 'phase_14_campaign_variants' as section, count(*) as upserted_rows from upserted_variants;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
campaigns_by_name as (
  select c.id, c.organization_id, c.name
  from public.campaigns c
  join avora_org org on org.id = c.organization_id
  where c.name in ('Hair Consult Follow-Up', '180-Day Reactivation')
),
run_rows as (
  select id as campaign_id, organization_id, 1 as run_number,
    case when name = 'Hair Consult Follow-Up' then 'completed' else 'queued' end as status,
    case when name = 'Hair Consult Follow-Up' then now() - interval '10 days' else now() + interval '1 day' end as started_at,
    case when name = 'Hair Consult Follow-Up' then now() - interval '9 days' else null end as completed_at,
    case when name = 'Hair Consult Follow-Up' then 3 else 3 end as recipients_total,
    case when name = 'Hair Consult Follow-Up' then 2 else 2 end as recipients_eligible,
    case when name = 'Hair Consult Follow-Up' then 1 else 1 end as recipients_skipped,
    case when name = 'Hair Consult Follow-Up' then 2 else 0 end as sent,
    case when name = 'Hair Consult Follow-Up' then 0 else 0 end as failed,
    case when name = 'Hair Consult Follow-Up' then 1 else 0 end as replied,
    case when name = 'Hair Consult Follow-Up' then 1 else 0 end as booked,
    case when name = 'Hair Consult Follow-Up' then 1 else 0 end as sold,
    case when name = 'Hair Consult Follow-Up' then 185000 else 0 end as collected_revenue_cents,
    jsonb_build_object('demo', true, 'simulation', true) as metadata
  from campaigns_by_name
),
upserted_runs as (
  insert into public.campaign_runs (
    organization_id,
    campaign_id,
    run_number,
    status,
    started_at,
    completed_at,
    recipients_total,
    recipients_eligible,
    recipients_skipped,
    sent,
    failed,
    replied,
    booked,
    sold,
    collected_revenue_cents,
    metadata
  )
  select organization_id, campaign_id, run_number, status, started_at, completed_at, recipients_total, recipients_eligible, recipients_skipped, sent, failed, replied, booked, sold, collected_revenue_cents, metadata
  from run_rows
  where true
  on conflict (campaign_id, run_number)
  do update set
    status = excluded.status,
    completed_at = excluded.completed_at,
    recipients_total = excluded.recipients_total,
    recipients_eligible = excluded.recipients_eligible,
    recipients_skipped = excluded.recipients_skipped,
    sent = excluded.sent,
    failed = excluded.failed,
    replied = excluded.replied,
    booked = excluded.booked,
    sold = excluded.sold,
    collected_revenue_cents = excluded.collected_revenue_cents,
    metadata = excluded.metadata
  returning id
)
select 'phase_14_campaign_runs' as section, count(*) as upserted_rows from upserted_runs;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
ranked_contacts as (
  select c.id, c.location_id, row_number() over (order by c.created_at, c.id) as rn
  from public.contacts c
  join avora_org org on org.id = c.organization_id
  limit 3
),
runs_by_campaign as (
  select cr.id as run_id, cr.organization_id, c.id as campaign_id, c.name as campaign_name
  from public.campaign_runs cr
  join public.campaigns c on c.id = cr.campaign_id
  join avora_org org on org.id = cr.organization_id
  where c.name in ('Hair Consult Follow-Up', '180-Day Reactivation')
),
variants as (
  select cv.id, cv.name, c.name as campaign_name
  from public.campaign_variants cv
  join public.campaigns c on c.id = cv.campaign_id
  join avora_org org on org.id = c.organization_id
),
recipient_rows as (
  select
    r.organization_id,
    r.campaign_id,
    r.run_id as campaign_run_id,
    rc.id as contact_id,
    rc.location_id,
    case
      when rc.rn = 1 then (select id from variants where campaign_name = r.campaign_name and name = 'Variant A' limit 1)
      when rc.rn = 2 then (select id from variants where campaign_name = r.campaign_name and name = 'Variant B' limit 1)
      else (select id from variants where campaign_name = r.campaign_name order by name limit 1)
    end as variant_id,
    case when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn = 1 then 'converted'
         when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn = 2 then 'delivered'
         when rc.rn = 3 then 'skipped'
         else 'scheduled'
    end as status,
    case when rc.rn = 3 then 'suppressed' else 'eligible' end as eligibility_status,
    case when rc.rn = 3 then 'Demo suppression exclusion' else null end as exclusion_reason,
    case when r.campaign_name = '180-Day Reactivation' and rc.rn <> 3 then now() + interval '1 day' else null end as scheduled_send_at,
    case when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn in (1,2) then now() - interval '10 days' else null end as sent_at,
    case when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn in (1,2) then now() - interval '10 days' + interval '2 minutes' else null end as delivered_at,
    case when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn = 1 then now() - interval '9 days' else null end as replied_at,
    case when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn = 1 then now() - interval '8 days' else null end as booked_at,
    case when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn = 1 then now() - interval '7 days' else null end as sold_at,
    case when r.campaign_name = 'Hair Consult Follow-Up' and rc.rn = 1 then 185000 else 0 end as revenue_cents,
    null::text as provider_message_id,
    null::uuid as workflow_enrollment_id,
    concat('phase14-demo:', r.campaign_name, ':run1:', rc.rn) as idempotency_key
  from runs_by_campaign r
  cross join ranked_contacts rc
),
upserted_recipients as (
  insert into public.campaign_recipients (
    organization_id,
    campaign_id,
    campaign_run_id,
    contact_id,
    location_id,
    variant_id,
    status,
    eligibility_status,
    exclusion_reason,
    scheduled_send_at,
    sent_at,
    delivered_at,
    replied_at,
    booked_at,
    sold_at,
    revenue_cents,
    provider_message_id,
    workflow_enrollment_id,
    idempotency_key
  )
  select organization_id, campaign_id, campaign_run_id, contact_id, location_id, variant_id, status, eligibility_status, exclusion_reason, scheduled_send_at, sent_at, delivered_at, replied_at, booked_at, sold_at, revenue_cents, provider_message_id, workflow_enrollment_id, idempotency_key
  from recipient_rows
  where true
  on conflict (organization_id, idempotency_key)
  do update set
    status = excluded.status,
    eligibility_status = excluded.eligibility_status,
    exclusion_reason = excluded.exclusion_reason,
    scheduled_send_at = excluded.scheduled_send_at,
    sent_at = excluded.sent_at,
    delivered_at = excluded.delivered_at,
    replied_at = excluded.replied_at,
    booked_at = excluded.booked_at,
    sold_at = excluded.sold_at,
    revenue_cents = excluded.revenue_cents,
    variant_id = excluded.variant_id
  returning id
)
select 'phase_14_campaign_recipients' as section, count(*) as upserted_rows from upserted_recipients;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
scheduled_recipients as (
  select cr.id, cr.organization_id, cr.campaign_run_id, cr.scheduled_send_at, cr.idempotency_key
  from public.campaign_recipients cr
  join public.campaigns c on c.id = cr.campaign_id
  join avora_org org on org.id = cr.organization_id
  where c.name = '180-Day Reactivation'
    and cr.status = 'scheduled'
),
upserted_jobs as (
  insert into public.campaign_jobs (
    organization_id,
    campaign_run_id,
    campaign_recipient_id,
    run_at,
    status,
    idempotency_key
  )
  select organization_id, campaign_run_id, id, coalesce(scheduled_send_at, now() + interval '1 day'), 'scheduled', concat('job:', idempotency_key)
  from scheduled_recipients
  where true
  on conflict (organization_id, idempotency_key)
  do update set run_at = excluded.run_at, status = excluded.status, last_error = null
  returning id
)
select 'phase_14_campaign_jobs' as section, count(*) as upserted_rows from upserted_jobs;

with avora_org as (
  select id from public.organizations where slug = 'avora' limit 1
),
recipient_events as (
  select
    cr.organization_id,
    cr.campaign_id,
    cr.campaign_run_id,
    cr.id as campaign_recipient_id,
    cr.contact_id,
    event.event_type,
    event.event_at,
    jsonb_build_object('demo', true, 'simulation', true) as metadata,
    concat('event:', cr.idempotency_key, ':', event.event_type) as idempotency_key
  from public.campaign_recipients cr
  join public.campaigns c on c.id = cr.campaign_id
  join avora_org org on org.id = cr.organization_id
  join lateral (
    values
      ('snapshot_created', cr.created_at),
      ('sent', cr.sent_at),
      ('delivered', cr.delivered_at),
      ('replied', cr.replied_at),
      ('booked', cr.booked_at),
      ('sold', cr.sold_at),
      ('skipped', case when cr.status = 'skipped' then cr.created_at else null end)
  ) as event(event_type, event_at) on event.event_at is not null
),
upserted_events as (
  insert into public.campaign_events (
    organization_id,
    campaign_id,
    campaign_run_id,
    campaign_recipient_id,
    contact_id,
    event_type,
    event_at,
    metadata,
    idempotency_key
  )
  select organization_id, campaign_id, campaign_run_id, campaign_recipient_id, contact_id, event_type, event_at, metadata, idempotency_key
  from recipient_events
  where true
  on conflict (organization_id, idempotency_key)
  where idempotency_key is not null
  do update set event_at = excluded.event_at, metadata = excluded.metadata
  returning id
)
select 'phase_14_campaign_events' as section, count(*) as upserted_rows from upserted_events;

select
  'phase_14_verification' as section,
  (select count(*) from public.campaign_settings cs join public.organizations o on o.id = cs.organization_id where o.slug = 'avora') as campaign_settings,
  (select count(*) from public.segments s join public.organizations o on o.id = s.organization_id where o.slug = 'avora') as segments,
  (select count(*) from public.segment_members sm join public.segments s on s.id = sm.segment_id join public.organizations o on o.id = s.organization_id where o.slug = 'avora') as segment_members,
  (select count(*) from public.suppression_lists sl join public.organizations o on o.id = sl.organization_id where o.slug = 'avora') as suppression_lists,
  (select count(*) from public.suppression_list_members slm join public.suppression_lists sl on sl.id = slm.suppression_list_id join public.organizations o on o.id = sl.organization_id where o.slug = 'avora') as suppression_members,
  (select count(*) from public.campaigns c join public.organizations o on o.id = c.organization_id where o.slug = 'avora') as campaigns,
  (select count(*) from public.campaign_variants cv join public.campaigns c on c.id = cv.campaign_id join public.organizations o on o.id = c.organization_id where o.slug = 'avora') as variants,
  (select count(*) from public.campaign_runs cr join public.organizations o on o.id = cr.organization_id where o.slug = 'avora') as runs,
  (select count(*) from public.campaign_recipients cr join public.organizations o on o.id = cr.organization_id where o.slug = 'avora') as recipients,
  (select count(*) from public.campaign_jobs cj join public.organizations o on o.id = cj.organization_id where o.slug = 'avora') as jobs,
  (select count(*) from public.campaign_events ce join public.organizations o on o.id = ce.organization_id where o.slug = 'avora') as events;
