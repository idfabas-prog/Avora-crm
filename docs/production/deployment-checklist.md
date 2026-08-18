# Production Deployment Checklist

## Recommended Architecture

- Next.js web service running with `next build` and `next start`.
- Supabase production project with backups enabled.
- Separate persistent worker process for `npm run ghl:continuous-worker`.
- On-demand/manual worker process for `npm run ghl:worker` historical repair jobs.
- Scheduler/cron support for future bounded worker kicks and smoke checks.
- Avoid serverless-only hosting for the continuous worker unless a separate worker platform is used.

## Environment

- `APP_ENV`: production
- `APP_URL`: production app URL
- `APP_VERSION`: release version or commit SHA
- `NEXT_PUBLIC_SUPABASE_URL`: production Supabase URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key
- `SUPABASE_SERVICE_ROLE_KEY`: server-only secret
- `CRON_SECRET`: server-only secret
- `GHL_MIAMI_PRIVATE_TOKEN`: server-only secret
- `GHL_ALLOW_WRITES`: false
- `ALLOW_DEMO_SEED`: false

## Staging First

1. Deploy the app to staging.
2. Use a separate Supabase project/database.
3. Keep staging GHL safe/mock unless an explicit read-only staging token is configured.
4. Run `npm run smoke:production` against staging.
5. Confirm `/settings/system/health` shows no blockers.

## Production Steps

1. Confirm tests and migration lint pass.
2. Review the Phase 22 migration manually.
3. Confirm Supabase backup/PITR is enabled.
4. Run production migrations explicitly.
5. Do not run seed files in production.
6. Deploy the Next.js app.
7. Start the continuous worker under the process supervisor:
   `npm run ghl:continuous-worker`
8. Keep historical queue worker available for targeted repair only:
   `npm run ghl:worker`
9. Run `npm run smoke:production`.
10. Open `/settings/system/health`.
11. Verify Miami read-only sync health.
12. Verify a new GHL appointment appears in Dev Dashboard.
13. Verify reschedule/cancellation/status updates sync.

## Rollback

1. Stop new worker claims by stopping worker processes.
2. Roll back the web artifact.
3. Let active job leases expire or finish their current safe batch.
4. Do not reset GHL checkpoints.
5. Restart workers after smoke tests pass.
