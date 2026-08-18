do $$
begin
  if coalesce(current_setting('app.environment', true), 'development') = 'production'
     and coalesce(current_setting('app.allow_demo_seed', true), 'false') <> 'true' then
    raise exception 'Refusing to run Phase 20 demo/staging seed in production without app.allow_demo_seed=true';
  end if;
end $$;

with org as (
  select id from public.organizations where slug = 'avora' limit 1
), owner_user as (
  select up.id
  from public.user_profiles up
  join public.roles r on r.id = up.role_id
  where up.organization_id = (select id from org)
    and (up.email = 'owner@avora-demo.com' or r.name = 'owner')
  order by case when up.email = 'owner@avora-demo.com' then 0 else 1 end, up.created_at
  limit 1
)
insert into public.system_settings (organization_id, environment, maintenance_mode, read_only_mode, support_message, deployment_version, updated_by, metadata_safe)
select (select id from org), 'staging', false, false, 'Avora staging hardening checks are active.', 'phase-20', (select id from owner_user), '{"demo":true,"phase":20}'::jsonb
from org
on conflict (organization_id) do update set
  environment = excluded.environment,
  maintenance_mode = false,
  read_only_mode = false,
  support_message = excluded.support_message,
  deployment_version = excluded.deployment_version,
  updated_by = excluded.updated_by,
  metadata_safe = excluded.metadata_safe;

with org as (
  select id from public.organizations where slug = 'avora' limit 1
)
insert into public.system_feature_flags (organization_id, feature_key, mode, live_enabled, configured, status, description, metadata_safe)
select (select id from org), seed.feature_key, 'staging', false, seed.configured, seed.status, seed.description, '{"demo":true,"live_gate_default_off":true}'::jsonb
from (
  values
    ('live_payments', false, 'disabled', 'Master gate for live Stripe charges and refunds'),
    ('live_telephony', false, 'disabled', 'Master gate for live outbound calls and call recording providers'),
    ('live_campaigns', false, 'disabled', 'Master gate for live bulk SMS/email campaign sends'),
    ('live_accounting', false, 'disabled', 'Master gate for live accounting export/posting'),
    ('live_push', false, 'disabled', 'Master gate for live APNs/Firebase push delivery'),
    ('live_ai_provider', false, 'disabled', 'Master gate for non-mock AI provider usage'),
    ('maintenance_mode', true, 'configured', 'Controlled maintenance mode foundation'),
    ('read_only_mode', true, 'configured', 'Emergency read-only mode foundation')
) as seed(feature_key, configured, status, description)
on conflict (organization_id, feature_key) do update set
  mode = excluded.mode,
  live_enabled = false,
  configured = excluded.configured,
  status = excluded.status,
  description = excluded.description,
  metadata_safe = excluded.metadata_safe;

with org as (
  select id from public.organizations where slug = 'avora' limit 1
)
insert into public.launch_readiness_checks (organization_id, check_key, category, status, blocker, summary, remediation, evidence_safe)
select (select id from org), seed.check_key, seed.category, seed.status, seed.blocker, seed.summary, seed.remediation, seed.evidence
from (
  values
    ('env.production.supabase', 'Environment', 'fail', true, 'Production Supabase variables must be configured before launch.', 'Set production Supabase URL and publishable key in the production environment.', '{"demo":true}'::jsonb),
    ('secrets.service_role.server_only', 'Secrets', 'warning', false, 'Service-role key must remain server-only and absent from client bundles.', 'Verify deployment provider secret scopes and public env exposure.', '{"demo":true}'::jsonb),
    ('rls.audit.required', 'RLS', 'warning', false, 'RLS inventory requires final staging verification.', 'Run the Phase 20 RLS audit checklist in staging.', '{"demo":true}'::jsonb),
    ('backups.restore_drill', 'Backups', 'fail', true, 'Backup and restore drill must be confirmed before production.', 'Confirm Supabase backup plan and complete a staging restore drill.', '{"demo":true}'::jsonb),
    ('live.gates.off', 'Integrations', 'pass', false, 'All high-risk live integration gates are seeded off.', 'Enable live integrations individually only after provider runbooks are complete.', '{"demo":true}'::jsonb),
    ('health.endpoint', 'Observability', 'pass', false, 'Health and readiness endpoints are available.', 'Monitor /api/health and protected /api/ready after deployment.', '{"demo":true}'::jsonb),
    ('ci.pipeline', 'Deployment', 'warning', false, 'CI foundation must run before production promotion.', 'Require typecheck, lint, tests, build, and migration static checks in GitHub Actions.', '{"demo":true}'::jsonb),
    ('service_worker.private_cache', 'PWA', 'pass', false, 'Service worker excludes authenticated and sensitive data from caching.', 'Re-test PWA install and cache behavior after each deploy.', '{"demo":true}'::jsonb)
) as seed(check_key, category, status, blocker, summary, remediation, evidence)
on conflict (organization_id, check_key) do update set
  category = excluded.category,
  status = excluded.status,
  blocker = excluded.blocker,
  summary = excluded.summary,
  remediation = excluded.remediation,
  evidence_safe = excluded.evidence_safe;

with org as (
  select id from public.organizations where slug = 'avora' limit 1
)
insert into public.system_health_checks (organization_id, check_key, category, status, summary, severity, metadata_safe)
select (select id from org), seed.check_key, seed.category, seed.status, seed.summary, seed.severity, '{"demo":true}'::jsonb
from (
  values
    ('database.connectivity', 'Database', 'pass', 'Lightweight database connectivity check configured.', 'info'),
    ('jobs.dead_letter_foundation', 'Jobs', 'pass', 'Dead-letter/job-failure foundation exists.', 'info'),
    ('storage.private_sensitive', 'Storage', 'warning', 'Sensitive storage buckets must be verified private in Supabase.', 'warning'),
    ('webhooks.signature_required', 'Webhooks', 'warning', 'Provider webhook signature checks are required before live mode.', 'warning'),
    ('demo_seed.production_guard', 'Seeds', 'pass', 'Phase 20 seed refuses explicit production mode without an override.', 'info')
) as seed(check_key, category, status, summary, severity)
on conflict (organization_id, check_key) do update set
  category = excluded.category,
  status = excluded.status,
  summary = excluded.summary,
  severity = excluded.severity,
  metadata_safe = excluded.metadata_safe,
  last_checked_at = now();

with org as (
  select id from public.organizations where slug = 'avora' limit 1
), owner_user as (
  select up.id from public.user_profiles up where up.organization_id = (select id from org) and up.email = 'owner@avora-demo.com' limit 1
)
insert into public.security_events (id, organization_id, user_id, event_type, severity, source, status, request_id, ip_hash, metadata_safe)
values
  ('10000000-0000-4000-8000-000000020001'::uuid, (select id from org), (select id from owner_user), 'demo_rate_limit_triggered', 'warning', 'phase_20_seed', 'reviewed', 'demo-request-rate-limit', null, '{"demo":true,"fictional":true}'::jsonb),
  ('10000000-0000-4000-8000-000000020002'::uuid, (select id from org), null, 'demo_webhook_signature_failure', 'warning', 'phase_20_seed', 'reviewed', 'demo-request-webhook', null, '{"demo":true,"fictional":true}'::jsonb),
  ('10000000-0000-4000-8000-000000020003'::uuid, (select id from org), null, 'demo_suspicious_export_volume', 'warning', 'phase_20_seed', 'reviewed', 'demo-request-export', null, '{"demo":true,"fictional":true}'::jsonb)
on conflict (id) do update set
  status = excluded.status,
  metadata_safe = excluded.metadata_safe;

with org as (
  select id from public.organizations where slug = 'avora' limit 1
), owner_user as (
  select up.id from public.user_profiles up where up.organization_id = (select id from org) and up.email = 'owner@avora-demo.com' limit 1
)
insert into public.system_incidents (id, organization_id, incident_type, severity, status, started_at, resolved_at, summary, owner_user_id, metadata_safe)
values
  ('10000000-0000-4000-8000-000000020101'::uuid, (select id from org), 'demo_staging_drill', 'SEV-4', 'closed', '2026-08-14 12:00:00+00'::timestamptz, '2026-08-14 12:30:00+00'::timestamptz, 'Fictional staging incident drill for Phase 20 operational readiness.', (select id from owner_user), '{"demo":true,"fictional":true}'::jsonb)
on conflict (id) do update set
  status = excluded.status,
  resolved_at = excluded.resolved_at,
  summary = excluded.summary,
  metadata_safe = excluded.metadata_safe;

with org as (
  select id from public.organizations where slug = 'avora' limit 1
)
insert into public.system_job_failures (id, organization_id, job_type, job_table, job_id, status, attempts, next_retry_at, last_error_safe, request_id, metadata_safe)
select '10000000-0000-4000-8000-000000020202'::uuid, (select id from org), 'demo_workflow_processor', 'workflow_jobs', '10000000-0000-4000-8000-000000020201'::uuid, 'recovered', 1, null, 'Fictional recovered job failure for dashboard verification.', 'demo-job-failure', '{"demo":true,"fictional":true}'::jsonb
on conflict (id) do update set
  status = excluded.status,
  attempts = excluded.attempts,
  last_error_safe = excluded.last_error_safe,
  metadata_safe = excluded.metadata_safe;

-- Verification queries for Supabase SQL Editor:
-- select count(*) as phase20_system_settings from public.system_settings ss join public.organizations o on o.id = ss.organization_id where o.slug = 'avora';
-- select count(*) as phase20_system_feature_flags from public.system_feature_flags sff join public.organizations o on o.id = sff.organization_id where o.slug = 'avora';
-- select count(*) as phase20_launch_readiness_checks from public.launch_readiness_checks lrc join public.organizations o on o.id = lrc.organization_id where o.slug = 'avora';
-- select count(*) as phase20_system_health_checks from public.system_health_checks shc join public.organizations o on o.id = shc.organization_id where o.slug = 'avora';
-- select count(*) as phase20_security_events from public.security_events se join public.organizations o on o.id = se.organization_id where o.slug = 'avora';
-- select count(*) as phase20_system_incidents from public.system_incidents si join public.organizations o on o.id = si.organization_id where o.slug = 'avora';
-- select count(*) as phase20_system_job_failures from public.system_job_failures sjf join public.organizations o on o.id = sjf.organization_id where o.slug = 'avora';
