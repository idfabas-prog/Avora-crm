# Disaster Recovery Runbook

## App Server Down

1. Confirm hosting provider status.
2. Check `/api/health` and `/api/ready`.
3. Roll back to the previous known-good app version if the new release is unhealthy.
4. Keep workers stopped until the app can answer internal routes reliably.

## Worker Down

1. Open System Health and inspect worker heartbeats.
2. Restart the supervised worker process.
3. Confirm stale locks expire or are recovered by the worker.
4. Do not create a duplicate full import. Existing GHL jobs are checkpointed and idempotent.

## GHL Token Revoked

1. Confirm token-present boolean only. Never paste token values into logs or tickets.
2. Set the affected connection to warning/degraded.
3. Replace the server-only private token in the deployment environment.
4. Restart the worker after environment reload.
5. Run a read-only connection test.

## Supabase Outage

1. Pause workers or let leases expire.
2. Follow the Supabase backup/restore runbook if data loss is suspected.
3. Do not run seed files in production.

## Bad Deployment

1. Stop new worker claims.
2. Roll back the app to the previous artifact.
3. Keep the same database; do not reset checkpoints.
4. Run smoke tests before restarting workers.

## Migration Failure

1. Do not edit an already-applied migration.
2. Create a corrective migration.
3. Leave business records intact.
4. Run migration lint and staging smoke tests before production retry.

## Accidental Job Duplication

1. Use external record mappings to verify idempotency.
2. Inspect scheduler locks, job status, run ID, and connection ID.
3. Resolve only duplicate queue metadata where safe.
4. Do not delete imported business records without owner approval.
