# Next.js App Router Starter

This workspace is scaffolded as a Next.js App Router application with the current recommended defaults:

- TypeScript
- ESLint with `eslint-config-next`
- Tailwind CSS
- App Router
- Turbopack for local development
- `@/*` import alias

## Run Locally

Install dependencies with your package manager, then start the development server:

```bash
npm install
npm run dev
```

The app will be available at http://localhost:3000.

## Production Hardening

Avora Phase 20 adds a production-readiness foundation for environment separation, live integration gates, system health, launch readiness, security events, CI, and operational runbooks.

Start with:

- `docs/phase-20-production-hardening.md`
- `docs/security-overview.md`
- `docs/runbooks/deployment.md`
- `docs/runbooks/migrations.md`
- `docs/runbooks/backup-restore.md`
- `docs/runbooks/incident-response.md`
- `docs/runbooks/live-integrations.md`
- `docs/runbooks/manual-phase-20-test-plan.md`

Useful checks:

```bash
npm run security:static
npm run migrations:lint
npm run test:phase20
npm run test:domain
```
