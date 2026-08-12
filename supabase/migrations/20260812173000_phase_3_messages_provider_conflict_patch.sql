-- Patch for seed/webhook idempotency after Phase 3 communications migration.
-- The original Phase 3 migration added a partial unique index:
--   (provider, provider_message_id) where provider_message_id is not null
-- That enforces non-null provider message id uniqueness, but PostgreSQL cannot
-- use it as the arbiter for a bare:
--   on conflict (provider, provider_message_id)
-- This full unique index preserves nullable provider_message_id support because
-- PostgreSQL unique indexes allow multiple null values.

create unique index if not exists messages_provider_message_id_conflict_idx
on public.messages(provider, provider_message_id);
