# Migration Runbook

1. Review SQL manually.
2. Confirm no destructive `drop table`, `truncate`, or irreversible data rewrite exists unless separately approved.
3. Confirm every new `public` table has RLS enabled.
4. Confirm policies are organization, location, patient, or owner/admin scoped as appropriate.
5. Confirm idempotency indexes exist for provider events, jobs, and external IDs.
6. Create a backup or restore point according to the active Supabase plan.
7. Run one migration.
8. Verify schema and policy behavior.
9. Run seed only if it is required and approved for the environment.
10. Run smoke tests.

Production migrations should be additive where possible. Use forward-fix migrations instead of editing already-applied migrations.

