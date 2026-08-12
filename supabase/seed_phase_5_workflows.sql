with avora_org as (
  select id
  from public.organizations
  where slug = 'avora'
  limit 1
),
owner_user as (
  select up.id, up.organization_id, up.email, up.full_name, r.name as role_name
  from public.user_profiles up
  join avora_org org on org.id = up.organization_id
  left join public.roles r on r.id = up.role_id and r.organization_id = up.organization_id
  where lower(trim(up.email)) = 'owner@avora-demo.com'
     or lower(trim(r.name)) = 'owner'
  order by
    case when lower(trim(up.email)) = 'owner@avora-demo.com' then 0 else 1 end,
    case when lower(trim(r.name)) = 'owner' then 0 else 1 end,
    up.created_at asc
  limit 1
),
seeded_workflows as (
  select *
  from (
    values
      (
        'New Hair Lead Follow-Up',
        'lead_nurture',
        'Nurtures new fictional hair-restoration leads with simulated SMS and follow-up tasks.',
        '{
          "nodes": [
            {"id":"trigger_contact_created","type":"trigger","position":{"x":360,"y":40},"configuration":{"trigger_type":"contact.created","filters":[{"field":"contact.lead_source","operator":"is_not_empty","value":true}]}},
            {"id":"sms_welcome","type":"action","position":{"x":360,"y":170},"configuration":{"action_type":"send_sms","template_key":"hair_lead_follow_up","body":"Hi {{first_name}}, this is Avora. We received your consultation request and can help you choose a convenient appointment time.","simulated":true}},
            {"id":"wait_one_day","type":"wait","position":{"x":360,"y":300},"configuration":{"wait_type":"relative","amount":1,"unit":"day"}},
            {"id":"if_no_appointment","type":"condition","position":{"x":360,"y":430},"configuration":{"field":"appointment.status","operator":"not_in","value":["scheduled","confirmed","completed"]}},
            {"id":"task_call_lead","type":"action","position":{"x":230,"y":560},"configuration":{"action_type":"create_task","title":"Call {{first_name}} about hair consultation","due":{"amount":1,"unit":"day","time":"09:00"}}},
            {"id":"wait_two_days","type":"wait","position":{"x":230,"y":690},"configuration":{"wait_type":"relative","amount":2,"unit":"day"}},
            {"id":"sms_second_touch","type":"action","position":{"x":230,"y":820},"configuration":{"action_type":"send_sms","body":"Hi {{first_name}}, Avora checking in. Reply here if you would like help booking your consultation.","simulated":true}},
            {"id":"goal_appointment","type":"goal","position":{"x":520,"y":560},"configuration":{"goal_type":"appointment.booked"}}
          ],
          "edges": [
            {"source":"trigger_contact_created","target":"sms_welcome","label":"DEFAULT"},
            {"source":"sms_welcome","target":"wait_one_day","label":"SUCCESS"},
            {"source":"wait_one_day","target":"if_no_appointment","label":"RESUME"},
            {"source":"if_no_appointment","target":"task_call_lead","label":"YES"},
            {"source":"if_no_appointment","target":"goal_appointment","label":"NO"},
            {"source":"task_call_lead","target":"wait_two_days","label":"SUCCESS"},
            {"source":"wait_two_days","target":"sms_second_touch","label":"RESUME"}
          ]
        }'::jsonb
      ),
      (
        'Hair Consultation Reminder',
        'appointment',
        'Sends safe simulated appointment confirmation and reminder messages for hair consultations.',
        '{
          "nodes": [
            {"id":"trigger_appointment_created","type":"trigger","position":{"x":360,"y":40},"configuration":{"trigger_type":"appointment.created","filters":[{"field":"appointment.type","operator":"contains","value":"Hair Restoration Consultation"}]}},
            {"id":"sms_confirmation","type":"action","position":{"x":360,"y":170},"configuration":{"action_type":"send_sms","body":"Hi {{first_name}}, your Avora {{appointment_type}} is scheduled for {{appointment_date}} at {{appointment_time}}.","simulated":true}},
            {"id":"wait_24h_before","type":"wait","position":{"x":360,"y":300},"configuration":{"wait_type":"appointment_relative","offset_amount":24,"offset_unit":"hour","direction":"before"}},
            {"id":"sms_24h","type":"action","position":{"x":360,"y":430},"configuration":{"action_type":"send_sms","body":"Reminder: your Avora consultation is tomorrow at {{appointment_time}}.","simulated":true}},
            {"id":"wait_1h_before","type":"wait","position":{"x":360,"y":560},"configuration":{"wait_type":"appointment_relative","offset_amount":1,"offset_unit":"hour","direction":"before"}},
            {"id":"sms_1h","type":"action","position":{"x":360,"y":690},"configuration":{"action_type":"send_sms","body":"Your Avora appointment starts in about 1 hour. Reply if you need help.","simulated":true}}
          ],
          "edges": [
            {"source":"trigger_appointment_created","target":"sms_confirmation","label":"DEFAULT"},
            {"source":"sms_confirmation","target":"wait_24h_before","label":"SUCCESS"},
            {"source":"wait_24h_before","target":"sms_24h","label":"RESUME"},
            {"source":"sms_24h","target":"wait_1h_before","label":"SUCCESS"},
            {"source":"wait_1h_before","target":"sms_1h","label":"RESUME"}
          ]
        }'::jsonb
      ),
      (
        'Consultation No-Show',
        'appointment',
        'Follows up after a fictional no-show appointment and creates a staff task.',
        '{
          "nodes": [
            {"id":"trigger_no_show","type":"trigger","position":{"x":360,"y":40},"configuration":{"trigger_type":"appointment.no_show","filters":[]}},
            {"id":"wait_30m","type":"wait","position":{"x":360,"y":170},"configuration":{"wait_type":"relative","amount":30,"unit":"minute"}},
            {"id":"sms_no_show","type":"action","position":{"x":360,"y":300},"configuration":{"action_type":"send_sms","body":"Hi {{first_name}}, we missed you today. Reply here and Avora can help reschedule.","simulated":true}},
            {"id":"task_no_show","type":"action","position":{"x":360,"y":430},"configuration":{"action_type":"create_task","title":"Follow up with {{first_name}} after missed consultation","due":{"amount":1,"unit":"day","time":"09:00"}}}
          ],
          "edges": [
            {"source":"trigger_no_show","target":"wait_30m","label":"DEFAULT"},
            {"source":"wait_30m","target":"sms_no_show","label":"RESUME"},
            {"source":"sms_no_show","target":"task_no_show","label":"SUCCESS"}
          ]
        }'::jsonb
      ),
      (
        'Consultation Did Not Buy',
        'sales',
        'Nurtures fictional showed-but-unsold opportunities without changing financial records.',
        '{
          "nodes": [
            {"id":"trigger_showed","type":"trigger","position":{"x":360,"y":40},"configuration":{"trigger_type":"opportunity.stage_changed","filters":[{"field":"opportunity.stage","operator":"equals","value":"Showed"}]}},
            {"id":"wait_2h","type":"wait","position":{"x":360,"y":170},"configuration":{"wait_type":"relative","amount":2,"unit":"hour"}},
            {"id":"if_not_sold","type":"condition","position":{"x":360,"y":300},"configuration":{"field":"opportunity.status","operator":"not_equals","value":"won"}},
            {"id":"sms_follow_up","type":"action","position":{"x":230,"y":430},"configuration":{"action_type":"send_sms","body":"Hi {{first_name}}, Avora here. Let us know if questions came up after your consultation.","simulated":true}},
            {"id":"wait_2d","type":"wait","position":{"x":230,"y":560},"configuration":{"wait_type":"relative","amount":2,"unit":"day"}},
            {"id":"task_sales","type":"action","position":{"x":230,"y":690},"configuration":{"action_type":"create_task","title":"Check in with {{first_name}} after consultation","due":{"amount":1,"unit":"day","time":"09:00"}}}
          ],
          "edges": [
            {"source":"trigger_showed","target":"wait_2h","label":"DEFAULT"},
            {"source":"wait_2h","target":"if_not_sold","label":"RESUME"},
            {"source":"if_not_sold","target":"sms_follow_up","label":"YES"},
            {"source":"sms_follow_up","target":"wait_2d","label":"SUCCESS"},
            {"source":"wait_2d","target":"task_sales","label":"RESUME"}
          ]
        }'::jsonb
      ),
      (
        'Payment Completed',
        'payment',
        'Creates internal next-step work after a fictional sale is paid, without automatic refunds or external finance mutations.',
        '{
          "nodes": [
            {"id":"trigger_sale_paid","type":"trigger","position":{"x":360,"y":40},"configuration":{"trigger_type":"sale.paid","filters":[]}},
            {"id":"mark_sold","type":"action","position":{"x":360,"y":170},"configuration":{"action_type":"update_opportunity_stage","target_stage":"Sold","create_only_if_open":true}},
            {"id":"task_schedule_treatment","type":"action","position":{"x":360,"y":300},"configuration":{"action_type":"create_task","title":"Schedule treatment for {{first_name}}","due":{"amount":1,"unit":"day","time":"09:00"}}},
            {"id":"internal_note","type":"action","position":{"x":360,"y":430},"configuration":{"action_type":"add_internal_note","body":"Payment completed workflow reached treatment scheduling step."}}
          ],
          "edges": [
            {"source":"trigger_sale_paid","target":"mark_sold","label":"DEFAULT"},
            {"source":"mark_sold","target":"task_schedule_treatment","label":"SUCCESS"},
            {"source":"task_schedule_treatment","target":"internal_note","label":"SUCCESS"}
          ]
        }'::jsonb
      ),
      (
        'Reactivation',
        'reactivation',
        'Controlled draft workflow for fictional inactive contacts. It never bulk enrolls automatically.',
        '{
          "nodes": [
            {"id":"trigger_manual","type":"trigger","position":{"x":360,"y":40},"configuration":{"trigger_type":"manual.enrolled","filters":[]}},
            {"id":"if_inactive","type":"condition","position":{"x":360,"y":170},"configuration":{"field":"appointment.last_completed_days","operator":"greater_than_or_equal","value":180}},
            {"id":"sms_reactivation","type":"action","position":{"x":230,"y":300},"configuration":{"action_type":"send_sms","body":"Hi {{first_name}}, Avora checking in. Reply here if you would like to reconnect with our team.","simulated":true}},
            {"id":"wait_3d","type":"wait","position":{"x":230,"y":430},"configuration":{"wait_type":"relative","amount":3,"unit":"day"}},
            {"id":"if_no_reply","type":"condition","position":{"x":230,"y":560},"configuration":{"field":"conversation.last_inbound_date","operator":"is_empty","value":true}},
            {"id":"task_call","type":"action","position":{"x":160,"y":690},"configuration":{"action_type":"create_task","title":"Call {{first_name}} for reactivation","due":{"amount":1,"unit":"day","time":"09:00"}}}
          ],
          "edges": [
            {"source":"trigger_manual","target":"if_inactive","label":"DEFAULT"},
            {"source":"if_inactive","target":"sms_reactivation","label":"YES"},
            {"source":"sms_reactivation","target":"wait_3d","label":"SUCCESS"},
            {"source":"wait_3d","target":"if_no_reply","label":"RESUME"},
            {"source":"if_no_reply","target":"task_call","label":"YES"}
          ]
        }'::jsonb
      )
  ) as workflow_seed(name, category, description, definition_json)
),
upserted_workflows as (
  insert into public.workflows (
    organization_id,
    name,
    description,
    category,
    status,
    location_scope,
    enrollment_policy,
    re_enrollment_policy,
    failure_policy,
    test_mode,
    created_by,
    updated_by
  )
  select
    owner_user.organization_id,
    seeded_workflows.name,
    seeded_workflows.description,
    seeded_workflows.category,
    'draft',
    'all',
    'one_active_per_contact',
    'after_completion',
    'retry_then_stop',
    true,
    owner_user.id,
    owner_user.id
  from seeded_workflows
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
  select uw.id, uw.organization_id, uw.name, sw.definition_json, uw.owner_user_id
  from upserted_workflows uw
  join seeded_workflows sw on sw.name = uw.name
),
upserted_versions as (
  insert into public.workflow_versions (
    workflow_id,
    version_number,
    definition_json,
    status,
    validation_snapshot,
    created_by
  )
  select
    all_seeded_workflows.id,
    1,
    all_seeded_workflows.definition_json,
    'draft',
    '{"seeded":true,"starter_template":true}'::jsonb,
    all_seeded_workflows.owner_user_id
  from all_seeded_workflows
  on conflict (workflow_id, version_number) do update set
    definition_json = excluded.definition_json,
    status = 'draft',
    validation_snapshot = excluded.validation_snapshot,
    published_at = null
  returning id, workflow_id
)
select
  (select count(*) from upserted_workflows) as workflows_inserted_or_updated,
  (select count(*) from upserted_versions) as draft_versions_inserted_or_updated;

-- Verification queries after rerunning this seed:
-- select count(*) as starter_workflows
-- from public.workflows
-- where organization_id = (select id from public.organizations where lower(trim(slug)) = 'avora')
--   and name in ('New Hair Lead Follow-Up', 'Hair Consultation Reminder', 'Consultation No-Show', 'Consultation Did Not Buy', 'Payment Completed', 'Reactivation');
--
-- select count(*) as starter_workflow_versions
-- from public.workflow_versions wv
-- join public.workflows w on w.id = wv.workflow_id
-- join public.organizations o on o.id = w.organization_id
-- where lower(trim(o.slug)) = 'avora'
--   and w.name in ('New Hair Lead Follow-Up', 'Hair Consultation Reminder', 'Consultation No-Show', 'Consultation Did Not Buy', 'Payment Completed', 'Reactivation')
--   and wv.version_number = 1;
--
-- select w.id, w.name
-- from public.workflows w
-- join public.organizations o on o.id = w.organization_id
-- where lower(trim(o.slug)) = 'avora'
--   and w.name in ('New Hair Lead Follow-Up', 'Hair Consultation Reminder', 'Consultation No-Show', 'Consultation Did Not Buy', 'Payment Completed', 'Reactivation')
--   and not exists (
--     select 1
--     from public.workflow_versions wv
--     where wv.workflow_id = w.id
--       and wv.version_number = 1
--   );
--
-- select w.name, w.status, w.active_version_id, w.published_at, wv.status as version_status
-- from public.workflows w
-- left join public.workflow_versions wv on wv.workflow_id = w.id and wv.version_number = 1
-- join public.organizations o on o.id = w.organization_id
-- where lower(trim(o.slug)) = 'avora'
--   and w.name in ('New Hair Lead Follow-Up', 'Hair Consultation Reminder', 'Consultation No-Show', 'Consultation Did Not Buy', 'Payment Completed', 'Reactivation')
-- order by w.name;
