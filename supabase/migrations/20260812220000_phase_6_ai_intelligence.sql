insert into public.permissions (key, description)
values
  ('ai.use', 'Use Ask Avora AI features'),
  ('ai.owner_analytics', 'Use organization-wide AI analytics'),
  ('ai.sales_insights', 'Use AI sales insights and coaching'),
  ('ai.conversation_summary', 'Generate AI conversation and contact summaries'),
  ('ai.suggest_reply', 'Generate suggested conversation replies'),
  ('ai.lead_scoring', 'Calculate and view AI-assisted lead scores'),
  ('ai.admin', 'Manage AI feature settings and limits'),
  ('ai.usage.read', 'Read AI usage and cost reporting')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'ai.use',
  'ai.owner_analytics',
  'ai.sales_insights',
  'ai.conversation_summary',
  'ai.suggest_reply',
  'ai.lead_scoring',
  'ai.admin',
  'ai.usage.read'
)
where r.name in ('owner', 'administrator')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'ai.use',
  'ai.owner_analytics',
  'ai.sales_insights',
  'ai.conversation_summary',
  'ai.suggest_reply',
  'ai.lead_scoring',
  'ai.usage.read'
)
where r.name = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'ai.use',
  'ai.sales_insights',
  'ai.conversation_summary',
  'ai.suggest_reply',
  'ai.lead_scoring'
)
where r.name = 'salesperson'
on conflict do nothing;

create table public.ai_feature_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, feature_key)
);

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  feature text not null,
  prompt_summary text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(12, 6) not null default 0,
  status text not null default 'completed' check (status in ('completed', 'failed', 'limited', 'disabled')),
  error_code text,
  duration_ms integer not null default 0,
  trace_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  insight_type text not null,
  severity text not null default 'info' check (severity in ('info', 'watch', 'important')),
  title text not null,
  summary text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'dismissed', 'expired')),
  generated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  score integer not null check (score between 0 and 100),
  label text not null check (label in ('hot', 'warm', 'nurture', 'low_priority')),
  factors_json jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  model_version text not null default 'deterministic-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id, opportunity_id)
);

create unique index lead_scores_contact_null_opportunity_idx
on public.lead_scores (organization_id, contact_id)
where opportunity_id is null;

create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ai_request_id uuid references public.ai_requests(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete set null,
  rating text not null check (rating in ('helpful', 'not_helpful')),
  reason text,
  created_at timestamptz not null default now()
);

create table public.ai_saved_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.user_profiles(id) on delete cascade,
  title text not null,
  question text not null,
  category text not null default 'general',
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, title)
);

create table public.ai_cached_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  summary_type text not null,
  content_json jsonb not null default '{}'::jsonb,
  source_fingerprint text not null,
  generated_by uuid references public.user_profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, summary_type)
);

create trigger ai_feature_settings_set_updated_at before update on public.ai_feature_settings for each row execute function public.set_updated_at();
create trigger ai_insights_set_updated_at before update on public.ai_insights for each row execute function public.set_updated_at();
create trigger lead_scores_set_updated_at before update on public.lead_scores for each row execute function public.set_updated_at();
create trigger ai_saved_questions_set_updated_at before update on public.ai_saved_questions for each row execute function public.set_updated_at();
create trigger ai_cached_summaries_set_updated_at before update on public.ai_cached_summaries for each row execute function public.set_updated_at();

create index ai_feature_settings_org_idx on public.ai_feature_settings (organization_id);
create index ai_requests_org_created_idx on public.ai_requests (organization_id, created_at desc);
create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);
create index ai_requests_feature_idx on public.ai_requests (organization_id, feature);
create index ai_insights_org_status_idx on public.ai_insights (organization_id, status, generated_at desc);
create index ai_insights_location_idx on public.ai_insights (location_id);
create index lead_scores_org_score_idx on public.lead_scores (organization_id, score desc);
create index lead_scores_contact_idx on public.lead_scores (contact_id);
create index lead_scores_location_idx on public.lead_scores (location_id);
create index ai_feedback_request_idx on public.ai_feedback (ai_request_id);
create index ai_saved_questions_org_user_idx on public.ai_saved_questions (organization_id, user_id);
create index ai_cached_summaries_entity_idx on public.ai_cached_summaries (entity_type, entity_id);
create index ai_cached_summaries_org_type_idx on public.ai_cached_summaries (organization_id, summary_type);

alter table public.ai_feature_settings enable row level security;
alter table public.ai_requests enable row level security;
alter table public.ai_insights enable row level security;
alter table public.lead_scores enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_saved_questions enable row level security;
alter table public.ai_cached_summaries enable row level security;

create policy "tenant ai feature settings read" on public.ai_feature_settings for select
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.use'));
create policy "tenant ai feature settings manage" on public.ai_feature_settings for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.admin'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.admin'));

create policy "tenant ai requests read own or usage" on public.ai_requests for select
using (organization_id in (select public.current_organization_ids()) and (user_id = auth.uid() or public.has_permission('ai.usage.read')));
create policy "tenant ai requests insert" on public.ai_requests for insert
with check (organization_id in (select public.current_organization_ids()) and user_id = auth.uid() and public.has_permission('ai.use'));

create policy "tenant ai insights read" on public.ai_insights for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.sales_insights')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = ai_insights.location_id))
);
create policy "tenant ai insights insert" on public.ai_insights for insert
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.sales_insights')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = ai_insights.location_id))
);
create policy "tenant ai insights update admin" on public.ai_insights for update
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.admin'))
with check (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.admin'));
create policy "tenant ai insights delete admin" on public.ai_insights for delete
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.admin'));

create policy "tenant lead scores read" on public.lead_scores for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.lead_scoring')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = lead_scores.location_id))
);
create policy "tenant lead scores manage" on public.lead_scores for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.lead_scoring'))
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.lead_scoring')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = lead_scores.location_id))
);

create policy "tenant ai feedback access" on public.ai_feedback for all
using (organization_id in (select public.current_organization_ids()) and (user_id = auth.uid() or public.has_permission('ai.usage.read')))
with check (organization_id in (select public.current_organization_ids()) and user_id = auth.uid());

create policy "tenant ai saved questions access" on public.ai_saved_questions for all
using (organization_id in (select public.current_organization_ids()) and (shared = true or user_id = auth.uid() or public.has_permission('ai.admin')))
with check (organization_id in (select public.current_organization_ids()) and (user_id = auth.uid() or public.has_permission('ai.admin')));

create policy "tenant ai cached summaries read" on public.ai_cached_summaries for select
using (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.use')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = ai_cached_summaries.location_id))
);
create policy "tenant ai cached summaries manage" on public.ai_cached_summaries for all
using (organization_id in (select public.current_organization_ids()) and public.has_permission('ai.use'))
with check (
  organization_id in (select public.current_organization_ids())
  and public.has_permission('ai.use')
  and (location_id is null or exists (select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = ai_cached_summaries.location_id))
);
