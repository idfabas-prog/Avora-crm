# Supabase Backup / Restore Runbook

## Backup Strategy

- Use a paid Supabase plan with automated point-in-time recovery for production.
- Confirm scheduled backups are enabled before production launch.
- Keep Phase 22 smoke-test and deployment records in Supabase so restore validation can compare application and database state.
- Never use demo seed files in production. Keep `ALLOW_DEMO_SEED=false`.

## Restore Process

1. Open a production incident with source `supabase`.
2. Stop production workers or let their leases expire so no new GHL sync work is claimed during restore.
3. Restore into staging first when time allows.
4. Verify migrations are present through the System Health dashboard.
5. Run read-only smoke checks:
   - `/api/health`
   - `/api/ready` with internal auth
   - login
   - dashboard
   - Miami calendar query
   - GHL connection health
6. Promote the restored database only after owner approval.

## Staging Restore Test

- Restore the latest production backup into a separate staging Supabase project.
- Use staging environment variables and mock/read-only GHL credentials.
- Run `npm run smoke:production` against staging.
- Confirm no live GHL writes, Stripe charges, SMS, calls, or campaign sends can occur.

## RPO / RTO Assumptions

- RPO depends on the Supabase backup tier and must be verified in the Supabase dashboard.
- Target RTO for controlled launch is same-day manual restore.
- Critical historical GHL sync state is idempotent and can resume from checkpoints after restore.

## Post-Restore Verification

- Confirm organizations, locations, users, roles, and permissions exist.
- Confirm external GHL mappings still exist for Miami.
- Confirm 13 Miami calendars remain mapped.
- Confirm appointments render on the normal calendar.
- Confirm `system_worker_heartbeats`, `system_scheduler_locks`, and `ghl_sync_jobs` do not contain permanently stuck locks.
