# Backup And Restore Runbook

Supabase backup availability depends on the project plan and configured retention. Do not claim production backups are ready until the actual plan is verified.

## Backup

1. Confirm Supabase project and environment.
2. Confirm backup retention and last successful backup in Supabase.
3. Record timestamp, owner, and verification evidence.
4. Export schema/migrations from source control.
5. Document storage bucket inventory and access policy state.

## Restore Drill

1. Restore into a staging or drill project only.
2. Never restore production patient data into non-production without an approved de-identification process.
3. Apply migrations if needed.
4. Verify login, RLS, health, portal access, and core reporting.
5. Keep live-write gates disabled after restore.

## Disaster Recovery

1. Restore database.
2. Restore storage or reconnect buckets.
3. Reconfigure secrets.
4. Deploy app.
5. Verify `/api/health` and protected `/api/ready`.
6. Verify staff and patient login.
7. Keep live integrations disabled until individually revalidated.

