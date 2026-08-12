with target_org as (
  select id
  from public.organizations
  where slug = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when slug = 'avora' then 0 else 1 end
  limit 1
),
seeded_numbers (location_slug, provider, phone_number, friendly_name, supports_sms, supports_voice, active, is_primary, is_test_number) as (
  values
    ('miami', 'development', '+13055550101', 'Avora Miami NON-LIVE test number', true, true, true, true, true),
    ('tampa', 'development', '+18135550102', 'Avora Tampa NON-LIVE test number', true, true, true, true, true),
    ('jacksonville', 'development', '+19045550103', 'Avora Jacksonville NON-LIVE test number', true, true, true, true, true)
)
insert into public.communication_numbers (organization_id, location_id, provider, phone_number, friendly_name, supports_sms, supports_voice, active, is_primary, is_test_number)
select
  target_org.id,
  locations.id,
  seeded_numbers.provider,
  seeded_numbers.phone_number,
  seeded_numbers.friendly_name,
  seeded_numbers.supports_sms,
  seeded_numbers.supports_voice,
  seeded_numbers.active,
  seeded_numbers.is_primary,
  seeded_numbers.is_test_number
from target_org
join public.locations locations
  on locations.organization_id = target_org.id
join seeded_numbers
  on seeded_numbers.location_slug = locations.slug
on conflict (organization_id, provider, phone_number) do update
set
  friendly_name = excluded.friendly_name,
  active = excluded.active,
  is_test_number = excluded.is_test_number;

with target_org as (
  select id
  from public.organizations
  where slug = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when slug = 'avora' then 0 else 1 end
  limit 1
),
seeded_settings (location_slug, messaging_enabled, missed_call_text_back_enabled, appointment_confirmation_enabled, reminder_24h_enabled, reminder_1h_enabled) as (
  values
    ('miami', true, false, false, false, false),
    ('tampa', true, false, false, false, false),
    ('jacksonville', true, false, false, false, false)
)
insert into public.communication_settings (organization_id, location_id, messaging_enabled, missed_call_text_back_enabled, appointment_confirmation_enabled, reminder_24h_enabled, reminder_1h_enabled)
select
  target_org.id,
  locations.id,
  seeded_settings.messaging_enabled,
  seeded_settings.missed_call_text_back_enabled,
  seeded_settings.appointment_confirmation_enabled,
  seeded_settings.reminder_24h_enabled,
  seeded_settings.reminder_1h_enabled
from target_org
join public.locations locations
  on locations.organization_id = target_org.id
join seeded_settings
  on seeded_settings.location_slug = locations.slug
on conflict (organization_id, location_id) do update
set messaging_enabled = excluded.messaging_enabled;

with target_org as (
  select id
  from public.organizations
  where slug = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when slug = 'avora' then 0 else 1 end
  limit 1
),
seeded_sms_templates (organization_id, location_id, name, category, body, active) as (
  select
    target_org.id,
    null::uuid,
    template.name,
    template.category,
    template.body,
    template.active
  from target_org
  cross join (
    values
      ('Appointment Confirmation', 'Appointment', 'Hi {{first_name}}, your {{appointment_type}} appointment with Avora {{location_name}} is scheduled for {{appointment_date}} at {{appointment_time}}. Reply here if you have any questions.', true),
      ('24-Hour Reminder', 'Appointment', 'Hi {{first_name}}, this is a reminder about your Avora appointment tomorrow at {{appointment_time}}. We look forward to seeing you.', true),
      ('Lead Follow-Up', 'Lead Follow-Up', 'Hi {{first_name}}, this is Avora {{location_name}} checking in. Would you like help scheduling your consultation?', true),
      ('Missed Call Text-Back', 'General', 'Hi {{first_name}}, we saw that we missed your call to Avora {{location_name}}. How can we help?', true)
  ) as template(name, category, body, active)
),
updated_sms_templates as (
  update public.sms_templates existing
  set
    category = seeded.category,
    body = seeded.body,
    active = seeded.active
  from seeded_sms_templates seeded
  where existing.organization_id = seeded.organization_id
    and existing.name = seeded.name
    and existing.location_id is not distinct from seeded.location_id
  returning existing.id
)
insert into public.sms_templates (organization_id, location_id, name, category, body, active)
select seeded.organization_id, seeded.location_id, seeded.name, seeded.category, seeded.body, seeded.active
from seeded_sms_templates seeded
where not exists (
  select 1
  from public.sms_templates existing
  where existing.organization_id = seeded.organization_id
    and existing.name = seeded.name
    and existing.location_id is not distinct from seeded.location_id
);

with target_org as (
  select id
  from public.organizations
  where slug = 'avora'
     or id = '10000000-0000-4000-8000-000000000001'
  order by case when slug = 'avora' then 0 else 1 end
  limit 1
)
insert into public.contact_communication_preferences (organization_id, contact_id, channel, allowed, opted_out, consent_source, consent_notes)
select contacts.organization_id, contacts.id, 'sms', true, false, 'fictional development seed', 'Fictional development contacts only'
from target_org
join public.contacts contacts
  on contacts.organization_id = target_org.id
where lower(contacts.email) in ('isabella.m@example.com', 'camila.s@example.com', 'danielle.c@example.com')
on conflict (contact_id, channel) do nothing;

-- Diagnostic query for Supabase SQL Editor:
-- with target_contacts (seed_order, email, first_name, last_name, status, unread_count, inbound_from, inbound_to, body) as (
--   values
--     (1, 'isabella.m@example.com', 'Isabella', 'Martin', 'open', 0, '+1305555148', '+13055550101', '[SIMULATED] Hi, I would like to learn more about Avora.'),
--     (2, 'camila.s@example.com', 'Camila', 'Stone', 'closed', 0, '+1813555182', '+18135550102', '[SIMULATED] Thank you, the treatment prep details were helpful.'),
--     (3, 'danielle.c@example.com', 'Danielle', 'Cross', 'open', 1, '+1904555129', '+19045550103', '[SIMULATED] Can someone help me schedule my consultation?')
-- ),
-- seeded_contacts as (
--   select distinct on (target_contacts.seed_order)
--     contacts.id,
--     contacts.organization_id,
--     contacts.location_id,
--     contacts.phone,
--     contacts.email,
--     contacts.first_name,
--     contacts.last_name,
--     organizations.slug as organization_slug,
--     locations.slug as location_slug,
--     target_contacts.seed_order,
--     target_contacts.status,
--     target_contacts.unread_count
--   from target_contacts
--   join public.contacts contacts
--     on trim(lower(coalesce(contacts.email, ''))) = target_contacts.email
--     or (
--       trim(lower(contacts.first_name)) = trim(lower(target_contacts.first_name))
--       and trim(lower(contacts.last_name)) = trim(lower(target_contacts.last_name))
--     )
--   join public.organizations organizations
--     on organizations.id = contacts.organization_id
--    and organizations.slug = 'avora'
--   left join public.locations locations
--     on locations.id = contacts.location_id
--   order by target_contacts.seed_order, contacts.created_at desc
-- )
-- select *
-- from seeded_contacts
-- order by seed_order;

with target_contacts (seed_order, email, first_name, last_name, status, unread_count, inbound_from, inbound_to, body) as (
  values
    (1, 'isabella.m@example.com', 'Isabella', 'Martin', 'open', 0, '+1305555148', '+13055550101', '[SIMULATED] Hi, I would like to learn more about Avora.'),
    (2, 'camila.s@example.com', 'Camila', 'Stone', 'closed', 0, '+1813555182', '+18135550102', '[SIMULATED] Thank you, the treatment prep details were helpful.'),
    (3, 'danielle.c@example.com', 'Danielle', 'Cross', 'open', 1, '+1904555129', '+19045550103', '[SIMULATED] Can someone help me schedule my consultation?')
),
seeded_contacts as (
  select distinct on (target_contacts.seed_order)
    contacts.id,
    contacts.organization_id,
    contacts.location_id,
    contacts.phone,
    contacts.first_name,
    contacts.last_name,
    target_contacts.seed_order,
    target_contacts.status,
    target_contacts.unread_count,
    target_contacts.inbound_from,
    target_contacts.inbound_to,
    target_contacts.body
  from target_contacts
  join public.contacts contacts
    on trim(lower(coalesce(contacts.email, ''))) = target_contacts.email
    or (
      trim(lower(contacts.first_name)) = trim(lower(target_contacts.first_name))
      and trim(lower(contacts.last_name)) = trim(lower(target_contacts.last_name))
    )
  join public.organizations organizations
    on organizations.id = contacts.organization_id
   and organizations.slug = 'avora'
  order by target_contacts.seed_order, contacts.created_at desc
),
existing_seeded_conversations as (
  select conversations.contact_id
  from public.conversations conversations
  join seeded_contacts
    on seeded_contacts.id = conversations.contact_id
  where conversations.channel = 'sms'
  group by conversations.contact_id
)
insert into public.conversations (organization_id, location_id, contact_id, status, channel, last_message_at, unread_count)
select
  seeded_contacts.organization_id,
  seeded_contacts.location_id,
  seeded_contacts.id,
  seeded_contacts.status,
  'sms',
  now() - interval '30 minutes',
  seeded_contacts.unread_count
from seeded_contacts
where not exists (
  select 1
  from existing_seeded_conversations existing
  where existing.contact_id = seeded_contacts.id
);

with target_contacts (seed_order, email, first_name, last_name, status, unread_count, inbound_from, inbound_to, body) as (
  values
    (1, 'isabella.m@example.com', 'Isabella', 'Martin', 'open', 0, '+1305555148', '+13055550101', '[SIMULATED] Hi, I would like to learn more about Avora.'),
    (2, 'camila.s@example.com', 'Camila', 'Stone', 'closed', 0, '+1813555182', '+18135550102', '[SIMULATED] Thank you, the treatment prep details were helpful.'),
    (3, 'danielle.c@example.com', 'Danielle', 'Cross', 'open', 1, '+1904555129', '+19045550103', '[SIMULATED] Can someone help me schedule my consultation?')
),
seeded_contacts as (
  select distinct on (target_contacts.seed_order)
    contacts.id,
    contacts.organization_id,
    contacts.location_id,
    contacts.phone,
    contacts.first_name,
    contacts.last_name,
    target_contacts.seed_order,
    target_contacts.status,
    target_contacts.unread_count,
    target_contacts.inbound_from,
    target_contacts.inbound_to,
    target_contacts.body
  from target_contacts
  join public.contacts contacts
    on trim(lower(coalesce(contacts.email, ''))) = target_contacts.email
    or (
      trim(lower(contacts.first_name)) = trim(lower(target_contacts.first_name))
      and trim(lower(contacts.last_name)) = trim(lower(target_contacts.last_name))
    )
  join public.organizations organizations
    on organizations.id = contacts.organization_id
   and organizations.slug = 'avora'
  order by target_contacts.seed_order, contacts.created_at desc
),
seeded_conversations as (
  select distinct on (conversations.contact_id)
    conversations.id,
    conversations.organization_id,
    conversations.location_id,
    conversations.contact_id,
    conversations.status
  from public.conversations conversations
  join seeded_contacts
    on seeded_contacts.id = conversations.contact_id
  where conversations.channel = 'sms'
  order by conversations.contact_id, conversations.last_message_at desc nulls last, conversations.created_at desc
)
insert into public.messages (organization_id, location_id, conversation_id, contact_id, direction, channel, from_address, to_address, body, provider, provider_message_id, status, simulated, received_at, sent_at)
select
  seeded_conversations.organization_id,
  seeded_conversations.location_id,
  seeded_conversations.id,
  seeded_conversations.contact_id,
  'inbound',
  'sms',
  seeded_contacts.inbound_from,
  seeded_contacts.inbound_to,
  seeded_contacts.body,
  'development',
  'seed-inbound-' || seeded_conversations.contact_id::text,
  'received',
  true,
  now() - interval '30 minutes',
  null
from seeded_conversations
join seeded_contacts
  on seeded_contacts.id = seeded_conversations.contact_id
on conflict (provider, provider_message_id) do nothing;

-- Verification queries for Supabase SQL Editor:
-- select c.id, c.first_name, c.last_name, c.email, l.slug as location_slug
-- from public.contacts c
-- join public.organizations o on o.id = c.organization_id
-- left join public.locations l on l.id = c.location_id
-- where o.slug = 'avora'
--   and lower(c.email) in ('isabella.m@example.com', 'camila.s@example.com', 'danielle.c@example.com')
-- order by c.email;
--
-- select count(*) as seeded_conversation_count
-- from public.conversations c
-- join public.contacts ct on ct.id = c.contact_id
-- join public.organizations o on o.id = c.organization_id
-- where o.slug = 'avora'
--   and c.channel = 'sms'
--   and lower(ct.email) in ('isabella.m@example.com', 'camila.s@example.com', 'danielle.c@example.com');
--
-- select count(*) as seeded_message_count
-- from public.messages m
-- join public.contacts c on c.id = m.contact_id
-- join public.organizations o on o.id = m.organization_id
-- where o.slug = 'avora'
--   and m.provider = 'development'
--   and m.provider_message_id = 'seed-inbound-' || c.id::text
--   and lower(c.email) in ('isabella.m@example.com', 'camila.s@example.com', 'danielle.c@example.com');
