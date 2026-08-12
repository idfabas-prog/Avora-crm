insert into public.appointment_types (organization_id, name, duration_minutes, active, category, description)
values
  ('10000000-0000-4000-8000-000000000001', 'Hair Restoration Consultation', 30, true, 'Hair Restoration', 'Initial fictional development consult for hair restoration leads.'),
  ('10000000-0000-4000-8000-000000000001', 'Hair Restoration Treatment', 45, true, 'Hair Restoration', 'Fictional development treatment appointment.'),
  ('10000000-0000-4000-8000-000000000001', 'Hair Restoration Follow-Up', 30, true, 'Hair Restoration', 'Fictional development follow-up appointment.'),
  ('10000000-0000-4000-8000-000000000001', 'T-Shape Consultation', 30, true, 'T-Shape', 'Initial fictional development T-Shape consultation.'),
  ('10000000-0000-4000-8000-000000000001', 'T-Shape Treatment', 60, true, 'T-Shape', 'Fictional development body-contouring treatment appointment.'),
  ('10000000-0000-4000-8000-000000000001', 'NeoGen Consultation', 30, true, 'NeoGen', 'Initial fictional development NeoGen consultation.'),
  ('10000000-0000-4000-8000-000000000001', 'NeoGen Treatment', 60, true, 'NeoGen', 'Fictional development NeoGen treatment appointment.'),
  ('10000000-0000-4000-8000-000000000001', 'Injectable Consultation', 30, true, 'Injectables', 'Initial fictional development injectable consultation.')
on conflict (organization_id, name) do update
set
  duration_minutes = excluded.duration_minutes,
  active = excluded.active,
  category = excluded.category,
  description = excluded.description;
