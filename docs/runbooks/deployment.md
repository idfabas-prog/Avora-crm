# Production Deployment Runbook

1. Open a pull request.
2. Confirm CI passes: install, static security checks, migration lint, typecheck, lint, domain tests, build.
3. Deploy to staging.
4. Apply one migration at a time in staging.
5. Run only staging-safe seeds with explicit approval.
6. Run staging smoke tests.
7. Review `/settings/system/launch-readiness`.
8. Confirm feature gates remain off.
9. Confirm backup/restore readiness.
10. Approve production deployment.
11. Apply one production migration at a time.
12. Do not run demo seeds in production.
13. Deploy the application.
14. Run production smoke tests.
15. Monitor health, jobs, webhooks, and security events.

Rollback prefers application rollback plus forward-fix migrations. Do not assume destructive schema changes can be rolled back safely.

