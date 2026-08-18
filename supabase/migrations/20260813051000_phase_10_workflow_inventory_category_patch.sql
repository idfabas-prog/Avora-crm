alter table public.workflows
  drop constraint if exists workflows_category_check;

alter table public.workflows
  add constraint workflows_category_check
  check (
    category in (
      'lead_nurture',
      'appointment',
      'sales',
      'treatment_follow_up',
      'reactivation',
      'payment',
      'internal_operations',
      'custom',
      'inventory'
    )
  );
