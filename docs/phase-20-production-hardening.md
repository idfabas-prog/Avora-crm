# Avora Phase 20 Production Hardening

Phase 20 prepares Avora for a controlled production launch. It does not enable live money movement, live telephony, bulk messaging, live accounting posting, or live push delivery.

## Environment Model

Avora recognizes four environments through `APP_ENV`: `development`, `test`, `staging`, and `production`.

- Development may use mock providers and demo data.
- Test uses mock configuration for CI and local test runs.
- Staging must use a separate Supabase project and sandbox/test provider accounts.
- Production must use production secrets, production domains, backup verification, and explicit live-write approvals.

## Required Production Gates

The following live-write gates should start as `false`:

- `PAYMENTS_ALLOW_LIVE_CHARGES=false`
- `TELEPHONY_ALLOW_LIVE_CALLS=false`
- `CAMPAIGNS_ALLOW_LIVE_SENDS=false`
- `ACCOUNTING_ALLOW_LIVE_EXPORTS=false`
- `PUSH_ALLOW_LIVE_SENDS=false`
- `AI_LIVE_PROVIDER_ENABLED=false`

Credentials alone must not enable live external writes.

## Public Environment Audit

Only publishable values may use `NEXT_PUBLIC_`. Current expected public variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

No service-role key, webhook secret, OAuth secret, API token, or provider auth token may be public.

## RLS And Authorization

Protected CRM pages use `requireCurrentProfile`. Patient portal pages use patient auth helpers. Server actions and API exports must enforce authorization server-side; hiding UI is not authorization.

Final staging verification must include:

- organization isolation
- location isolation
- patient portal account isolation
- clinical record isolation
- compensation isolation
- call recording/transcript isolation
- accounting and executive report isolation

## Seed Policy

Demo seeds are not part of production deployment. The Phase 20 seed includes a guard that refuses explicit production mode unless `app.allow_demo_seed=true` is deliberately set for that SQL session.

## Storage Policy

No clinical, document, transcript, or patient-sensitive bucket may be public. Sensitive file access must use short-lived signed URLs and RLS-backed authorization checks.

## Service Worker Policy

The PWA service worker may cache static shell assets only. It must not cache authenticated HTML, API responses, contacts, conversations, payments, clinical records, portal data, AI responses, or messages.

## Launch Status

Phase 20 can report `READY FOR CONTROLLED PRODUCTION LAUNCH` only when CI/build/tests pass, critical launch checks have no blockers, backup/restore has been verified, production secrets are configured, and live-write gates have been reviewed.

