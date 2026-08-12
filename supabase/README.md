# Avora Supabase Setup

## Environment

Copy `.env.example` to `.env.local` and provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.

## Database

Apply the migration in `supabase/migrations/20260812133000_v1_crm_foundation.sql`.

Then apply `supabase/seed.sql` for the Avora organization, locations, roles, permissions, contacts, pipeline, opportunities, and tasks.

To seed fictional staff profiles, first create Supabase Auth users with these emails:

- `maya.bennett@avora.example`
- `sofia.reyes@avora.example`
- `julian.hart@avora.example`
- `nina.caldwell@avora.example`

Then run `supabase/seed_demo_staff_after_auth.sql`.
