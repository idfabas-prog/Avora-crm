with avora_org as (
  select id
  from public.organizations
  where lower(trim(slug)) = 'avora'
  limit 1
),
owner_user as (
  select up.id, up.organization_id
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
features as (
  select *
  from (
    values
      ('ask_avora', true),
      ('suggested_replies', true),
      ('conversation_summary', true),
      ('lead_scoring', true),
      ('owner_brief', true),
      ('sales_coaching', true),
      ('insights', true)
  ) as seed(feature_key, enabled)
),
upserted_features as (
  insert into public.ai_feature_settings (organization_id, feature_key, enabled, configuration)
  select owner_user.organization_id, features.feature_key, features.enabled, '{"demo":true}'::jsonb
  from features
  cross join owner_user
  on conflict (organization_id, feature_key) do update set
    enabled = excluded.enabled,
    configuration = public.ai_feature_settings.configuration || '{"demo":true}'::jsonb,
    updated_at = now()
  returning id
),
questions as (
  select *
  from (
    values
      ('Daily Revenue', 'How much did we collect today?', 'revenue'),
      ('Location Performance', 'Which location is performing best this month?', 'locations'),
      ('No-Show Review', 'Which location has the highest no-show rate?', 'appointments'),
      ('Hot Leads', 'Which leads should we follow up with today?', 'sales'),
      ('Outstanding Balances', 'What are our outstanding balances?', 'financial'),
      ('Workflow Review', 'Which workflow is underperforming?', 'workflows')
  ) as seed(title, question, category)
),
upserted_questions as (
  insert into public.ai_saved_questions (organization_id, user_id, title, question, category, shared)
  select owner_user.organization_id, owner_user.id, questions.title, questions.question, questions.category, true
  from questions
  cross join owner_user
  on conflict (organization_id, user_id, title) do update set
    question = excluded.question,
    category = excluded.category,
    shared = true,
    updated_at = now()
  returning id
),
insights as (
  select *
  from (
    values
      ('demo_follow_up', 'watch', 'Demo follow-up queue ready', 'AI follow-up prioritization is enabled for fictional development leads.', '{"demo":true,"source":"seed"}'::jsonb),
      ('demo_owner_brief', 'info', 'Daily owner brief available', 'Ask Avora can summarize revenue, leads, appointments, and workflow activity from structured CRM metrics.', '{"demo":true,"source":"seed"}'::jsonb)
  ) as seed(insight_type, severity, title, summary, evidence_json)
),
upserted_insights as (
  insert into public.ai_insights (organization_id, insight_type, severity, title, summary, evidence_json, status, expires_at)
  select owner_user.organization_id, insights.insight_type, insights.severity, insights.title, insights.summary, insights.evidence_json, 'active', now() + interval '30 days'
  from insights
  cross join owner_user
  where not exists (
    select 1
    from public.ai_insights existing
    where existing.organization_id = owner_user.organization_id
      and existing.insight_type = insights.insight_type
      and existing.title = insights.title
      and existing.status = 'active'
  )
  returning id
)
select
  (select count(*) from upserted_features) as ai_features_inserted_or_updated,
  (select count(*) from upserted_questions) as saved_questions_inserted_or_updated,
  (select count(*) from upserted_insights) as demo_insights_inserted;
