-- Read-only verification for a manually pasted Avora/Dev Dashboard staging schema.
--
-- Paste this into the Supabase SQL Editor after a browser/API interruption during
-- staging_full_schema.sql. It does not create, alter, insert, update, or delete.
-- It checks catalog metadata directly, so it still works when
-- supabase_migrations.schema_migrations was not populated by the SQL Editor.

with
expected_migration_files(ordinal, migration_file) as (
  values
    (1, '20260812133000_v1_crm_foundation.sql'),
    (2, '20260812150000_phase_2_appointments_audit.sql'),
    (3, '20260812170000_phase_3_communications.sql'),
    (4, '20260812173000_phase_3_messages_provider_conflict_patch.sql'),
    (5, '20260812190000_phase_4_sales_payments_commissions.sql'),
    (6, '20260812210000_phase_5_workflow_automation.sql'),
    (7, '20260812220000_phase_6_ai_intelligence.sql'),
    (8, '20260812230000_phase_7_clinical_treatment_operations.sql'),
    (9, '20260813010000_phase_8_marketing_attribution.sql'),
    (10, '20260813030000_phase_9_patient_portal_memberships.sql'),
    (11, '20260813050000_phase_10_inventory_cogs.sql'),
    (12, '20260813051000_phase_10_workflow_inventory_category_patch.sql'),
    (13, '20260813060000_phase_11_workforce_timeclock_payroll_support.sql'),
    (14, '20260813070000_phase_12_reputation_referrals_reactivation.sql'),
    (15, '20260814090000_phase_13_executive_command_center.sql'),
    (16, '20260814110000_phase_14_campaigns_segmentation_bulk_messaging.sql'),
    (17, '20260814130000_phase_15_phone_call_center_ai.sql'),
    (18, '20260814150000_phase_16_advanced_ai_operating_system.sql'),
    (19, '20260814170000_phase_17_expansion_territories_multi_entity.sql'),
    (20, '20260814190000_phase_18_accounting_erp_financial_close.sql'),
    (21, '20260814210000_phase_19_mobile_pwa_native_readiness.sql'),
    (22, '20260814230000_phase_20_production_hardening.sql'),
    (23, '20260815010000_phase_21_gohighlevel_migration_live_sync.sql'),
    (24, '20260815013000_phase_21b1_gohighlevel_oauth_installation.sql'),
    (25, '20260816010000_phase_21c_ghl_calendar_type_mappings.sql'),
    (26, '20260816030000_phase_22_production_operations.sql')
),
expected_table_groups(migration_file, table_names) as (
  values
    ('20260812133000_v1_crm_foundation.sql', array['organizations','locations','roles','permissions','role_permissions','user_profiles','user_locations','contacts','contact_notes','tags','contact_tags','pipelines','pipeline_stages','opportunities','tasks','audit_logs']),
    ('20260812150000_phase_2_appointments_audit.sql', array['appointment_types','appointments']),
    ('20260812170000_phase_3_communications.sql', array['contact_communication_preferences','communication_numbers','conversations','messages','sms_templates','communication_settings','scheduled_messages','calls','communication_webhook_events']),
    ('20260812190000_phase_4_sales_payments_commissions.sql', array['services','packages','package_items','location_service_settings','sales','sale_items','sale_discounts','sale_adjustments','payment_method_rules','payments','refunds','commission_rules','commissions','royalty_rules','royalties','stripe_customers','stripe_webhook_events','stripe_terminal_placeholders']),
    ('20260812210000_phase_5_workflow_automation.sql', array['workflows','workflow_versions','workflow_locations','domain_events','workflow_enrollments','workflow_execution_steps','workflow_event_logs','workflow_scheduled_jobs','workflow_action_executions','workflow_test_runs']),
    ('20260812220000_phase_6_ai_intelligence.sql', array['ai_feature_settings','ai_requests','ai_insights','lead_scores','ai_feedback','ai_saved_questions','ai_cached_summaries']),
    ('20260812230000_phase_7_clinical_treatment_operations.sql', array['clinical_service_settings','clinical_profiles','package_entitlements','treatment_plans','treatment_plan_items','treatment_sessions','treatment_entitlement_events','clinical_templates','clinical_notes','clinical_note_addenda','consent_templates','consent_records','clinical_documents','clinical_photos','treatment_followups']),
    ('20260813010000_phase_8_marketing_attribution.sql', array['marketing_sources','marketing_source_aliases','marketing_campaigns','marketing_campaign_locations','marketing_ad_groups','marketing_ads','contact_attributions','sale_attributions','marketing_spend','marketing_sync_runs','marketing_attribution_corrections']),
    ('20260813030000_phase_9_patient_portal_memberships.sql', array['portal_settings','patient_accounts','portal_appointment_requests','membership_plans','patient_memberships','membership_benefit_events','payment_plans','payment_plan_installments','patient_notifications']),
    ('20260813050000_phase_10_inventory_cogs.sql', array['inventory_items','vendors','vendor_items','inventory_location_settings','purchase_orders','purchase_order_items','inventory_lots','inventory_events','treatment_inventory_usage','inventory_service_requirements','inventory_transfers','inventory_transfer_items','inventory_alerts']),
    ('20260813060000_phase_11_workforce_timeclock_payroll_support.sql', array['workforce_settings','employment_profiles','shift_templates','staff_shifts','recurring_shift_patterns','time_entries','time_entry_breaks','pay_periods','timesheets','pto_policies','pto_balances','pto_events','pto_requests','organization_holidays','time_entry_audits','attendance_exceptions','labor_cost_records','staff_skills']),
    ('20260813070000_phase_12_reputation_referrals_reactivation.sql', array['reputation_settings','review_sources','location_review_sources','review_request_templates','review_requests','feedback_surveys','feedback_responses','feedback_escalations','review_sync_runs','external_reviews','review_response_drafts','referral_programs','referral_codes','referrals','referral_reward_events','patient_credit_events','patient_loyalty_snapshots','reactivation_segments','reactivation_campaigns','reactivation_attributions']),
    ('20260814090000_phase_13_executive_command_center.sql', array['executive_targets','executive_alert_settings','executive_alerts','executive_metric_snapshots','executive_scorecard_weights','location_operating_profiles','executive_saved_views']),
    ('20260814110000_phase_14_campaigns_segmentation_bulk_messaging.sql', array['segments','segment_members','suppression_lists','suppression_list_members','campaign_settings','campaigns','campaign_variants','campaign_runs','campaign_recipients','campaign_jobs','campaign_events']),
    ('20260814130000_phase_15_phone_call_center_ai.sql', array['call_dispositions','call_queues','call_queue_members','call_queue_events','missed_call_callbacks','voicemails','call_recording_settings','call_recordings','call_transcripts','call_attributions','call_lists','call_list_members','call_scripts','call_notes','call_webhook_events']),
    ('20260814150000_phase_16_advanced_ai_operating_system.sql', array['ai_operating_settings','ai_operating_briefs','predictive_scores','ai_recommendations','forecast_records']),
    ('20260814170000_phase_17_expansion_territories_multi_entity.sql', array['operating_entities','regions','region_locations','region_managers','territories','territory_geographies','location_territories','location_entities','territory_overlap_warnings','expansion_projects','expansion_sites','market_assessments','expansion_financial_models','expansion_forecast_months','launch_checklist_templates','launch_checklist_template_items','expansion_checklist_items','expansion_readiness_snapshots','expansion_staffing_plans','expansion_training_items','expansion_inventory_requirements','expansion_equipment_items','expansion_marketing_plan','location_operating_agreements','management_fee_rules','management_fee_records','brand_standard_templates','brand_audits','brand_audit_items','location_setting_overrides','region_setting_overrides','expansion_document_links','expansion_milestones','expansion_budget_items','expansion_alerts','expansion_ramp_metrics']),
    ('20260814190000_phase_18_accounting_erp_financial_close.sql', array['accounting_connections','accounting_accounts','accounting_mappings','accounting_location_mappings','accounting_entity_mappings','accounting_customer_mappings','accounting_export_batches','accounting_export_items','accounting_exceptions','processor_reconciliation_records','accounting_periods','close_checklist_templates','accounting_close_items','accounting_sync_runs','accounting_webhook_events']),
    ('20260814210000_phase_19_mobile_pwa_native_readiness.sql', array['mobile_settings','device_registrations','mobile_notification_preferences','mobile_notifications','mobile_drafts','mobile_app_events']),
    ('20260814230000_phase_20_production_hardening.sql', array['system_settings','system_feature_flags','system_incidents','security_events','system_health_checks','launch_readiness_checks','system_job_failures']),
    ('20260815010000_phase_21_gohighlevel_migration_live_sync.sql', array['ghl_connections','external_record_mappings','ghl_sync_cursors','ghl_sync_runs','ghl_sync_jobs','ghl_sync_events','ghl_webhook_events','ghl_sync_exceptions','ghl_custom_field_mappings','ghl_user_mappings']),
    ('20260815013000_phase_21b1_gohighlevel_oauth_installation.sql', array['ghl_oauth_states','ghl_oauth_installations','ghl_oauth_credentials']),
    ('20260816010000_phase_21c_ghl_calendar_type_mappings.sql', array['ghl_calendar_type_mappings']),
    ('20260816030000_phase_22_production_operations.sql', array['system_worker_heartbeats','system_scheduler_locks','system_smoke_test_runs','system_retention_policies','system_deployment_events'])
),
expected_function_groups(migration_file, function_names) as (
  values
    ('20260812133000_v1_crm_foundation.sql', array['set_updated_at','current_organization_ids','has_permission']),
    ('20260812190000_phase_4_sales_payments_commissions.sql', array['sale_item_set_line_total','recalculate_sale_financials','recalculate_sale_from_item','recalculate_sale_from_payment','prevent_excess_refund']),
    ('20260812210000_phase_5_workflow_automation.sql', array['claim_due_workflow_jobs']),
    ('20260812230000_phase_7_clinical_treatment_operations.sql', array['refresh_package_entitlement_usage','refresh_package_entitlement_usage_from_event','create_clinical_entitlements_for_sale']),
    ('20260813010000_phase_8_marketing_attribution.sql', array['snapshot_sale_attribution_for_sale']),
    ('20260813030000_phase_9_patient_portal_memberships.sql', array['is_current_patient_contact','activate_patient_account_for_current_user','update_patient_safe_profile','sign_patient_consent','record_patient_simulated_payment']),
    ('20260813050000_phase_10_inventory_cogs.sql', array['recalculate_inventory_balance','receive_inventory_stock','receive_purchase_order_item','record_inventory_adjustment','record_treatment_inventory_usage','ship_inventory_transfer','receive_inventory_transfer']),
    ('20260813060000_phase_11_workforce_timeclock_payroll_support.sql', array['calculate_time_entry_minutes','clock_in','clock_out','start_time_break','end_time_break','generate_labor_cost_record','recalculate_pto_balance']),
    ('20260813070000_phase_12_reputation_referrals_reactivation.sql', array['evaluate_review_request_eligibility','create_review_request','create_feedback_escalation','issue_referral_reward','record_reactivation_attribution']),
    ('20260814090000_phase_13_executive_command_center.sql', array['acknowledge_executive_alert','resolve_executive_alert']),
    ('20260814110000_phase_14_campaigns_segmentation_bulk_messaging.sql', array['claim_campaign_jobs','complete_campaign_job']),
    ('20260814130000_phase_15_phone_call_center_ai.sql', array['call_location_allowed','is_missed_call','call_net_revenue_cents']),
    ('20260814150000_phase_16_advanced_ai_operating_system.sql', array['ai_location_allowed','ai_confidence_label','ai_recommendation_priority','ai_insight_severity']),
    ('20260814170000_phase_17_expansion_territories_multi_entity.sql', array['expansion_region_allowed','expansion_location_allowed','expansion_project_readiness','expansion_budget_variance','expansion_management_fee']),
    ('20260814190000_phase_18_accounting_erp_financial_close.sql', array['accounting_period_locked','accounting_batch_balance','accounting_record_exception','accounting_close_readiness']),
    ('20260814210000_phase_19_mobile_pwa_native_readiness.sql', array['mobile_deactivate_device','mobile_mark_notification_read']),
    ('20260816030000_phase_22_production_operations.sql', array['claim_system_scheduler_lock'])
),
expected_index_groups(migration_file, index_names) as (
  values
    ('20260812133000_v1_crm_foundation.sql', array['contacts_organization_id_idx','contacts_location_id_idx','opportunities_stage_id_idx','tasks_assigned_to_idx']),
    ('20260812150000_phase_2_appointments_audit.sql', array['appointments_location_id_idx','appointments_provider_id_idx','appointments_start_at_idx','appointments_type_id_idx']),
    ('20260812170000_phase_3_communications.sql', array['conversations_org_location_idx','messages_conversation_id_created_idx','messages_provider_message_id_unique_idx','scheduled_messages_status_time_idx']),
    ('20260812173000_phase_3_messages_provider_conflict_patch.sql', array['messages_provider_message_id_conflict_idx']),
    ('20260812190000_phase_4_sales_payments_commissions.sql', array['payments_provider_payment_id_idx','refunds_provider_refund_id_idx','commissions_payment_rule_idx','royalties_location_idx']),
    ('20260812210000_phase_5_workflow_automation.sql', array['workflow_enrollments_unique_key_idx','workflow_scheduled_jobs_idempotency_idx','workflow_scheduled_jobs_due_idx','domain_events_type_processed_idx']),
    ('20260812220000_phase_6_ai_intelligence.sql', array['ai_feature_settings_org_idx','ai_requests_org_created_idx','lead_scores_contact_null_opportunity_idx']),
    ('20260812230000_phase_7_clinical_treatment_operations.sql', array['treatment_entitlement_events_session_once_idx','treatment_sessions_provider_due_idx','clinical_documents_contact_idx']),
    ('20260813010000_phase_8_marketing_attribution.sql', array['contact_attributions_primary_idx','marketing_spend_org_default_idx','sale_attributions_sale_idx']),
    ('20260813030000_phase_9_patient_portal_memberships.sql', array['patient_accounts_auth_user_org_idx','patient_memberships_active_plan_idx','payment_plan_installments_status_idx']),
    ('20260813050000_phase_10_inventory_cogs.sql', array['inventory_events_idempotency_idx','inventory_lots_location_item_idx','inventory_lots_source_po_item_idx']),
    ('20260813060000_phase_11_workforce_timeclock_payroll_support.sql', array['time_entries_one_open_per_user_idx','time_entry_breaks_one_open_idx','staff_shifts_user_date_idx']),
    ('20260813070000_phase_12_reputation_referrals_reactivation.sql', array['review_requests_contact_status_idx','referrals_unique_referred_contact_idx','reactivation_attributions_event_idx']),
    ('20260814090000_phase_13_executive_command_center.sql', array['executive_targets_location_unique_idx','executive_alerts_active_identity_idx','executive_metric_snapshots_unique_idx']),
    ('20260814110000_phase_14_campaigns_segmentation_bulk_messaging.sql', array['campaign_recipients_run_contact_idx','campaign_events_idempotency_idx','campaign_jobs_due_idx']),
    ('20260814130000_phase_15_phone_call_center_ai.sql', array['communication_numbers_provider_external_phone_number_idx','calls_provider_call_id_idx','missed_call_callbacks_idempotency_idx','call_recordings_provider_recording_id_idx']),
    ('20260814150000_phase_16_advanced_ai_operating_system.sql', array['ai_operating_settings_org_key_idx','predictive_scores_type_score_idx','forecast_records_metric_idx']),
    ('20260814170000_phase_17_expansion_territories_multi_entity.sql', array['operating_entities_org_idx','territories_org_region_idx','expansion_projects_org_stage_idx','management_fee_records_period_idx']),
    ('20260814190000_phase_18_accounting_erp_financial_close.sql', array['accounting_connections_provider_company_uidx','accounting_export_items_source_idx','accounting_periods_status_idx']),
    ('20260814210000_phase_19_mobile_pwa_native_readiness.sql', array['device_registrations_user_device_uidx','mobile_drafts_user_route_uidx','mobile_notifications_user_status_idx']),
    ('20260814230000_phase_20_production_hardening.sql', array['system_feature_flags_org_idx','system_job_failures_job_uidx','launch_readiness_checks_org_status_idx']),
    ('20260815010000_phase_21_gohighlevel_migration_live_sync.sql', array['external_record_mappings_provider_idx','external_record_mappings_internal_idx','ghl_sync_jobs_claim_idx','ghl_sync_runs_connection_status_idx']),
    ('20260815013000_phase_21b1_gohighlevel_oauth_installation.sql', array['ghl_oauth_states_connection_idx','ghl_oauth_installations_connection_status_idx']),
    ('20260816010000_phase_21c_ghl_calendar_type_mappings.sql', array['ghl_calendar_type_mappings_org_idx','ghl_calendar_type_mappings_type_idx']),
    ('20260816030000_phase_22_production_operations.sql', array['system_worker_heartbeats_org_type_idx','system_scheduler_locks_due_idx','ghl_sync_jobs_connection_status_run_at_idx'])
),
expected_columns(migration_file, table_name, column_name) as (
  values
    ('20260812133000_v1_crm_foundation.sql', 'organizations', 'slug'),
    ('20260812133000_v1_crm_foundation.sql', 'locations', 'organization_id'),
    ('20260812133000_v1_crm_foundation.sql', 'user_profiles', 'role_id'),
    ('20260812133000_v1_crm_foundation.sql', 'contacts', 'email'),
    ('20260812150000_phase_2_appointments_audit.sql', 'appointments', 'appointment_type_id'),
    ('20260812150000_phase_2_appointments_audit.sql', 'appointments', 'provider_id'),
    ('20260812150000_phase_2_appointments_audit.sql', 'appointments', 'start_at'),
    ('20260812150000_phase_2_appointments_audit.sql', 'appointments', 'end_at'),
    ('20260812170000_phase_3_communications.sql', 'messages', 'provider_message_id'),
    ('20260812170000_phase_3_communications.sql', 'conversations', 'last_message_at'),
    ('20260812190000_phase_4_sales_payments_commissions.sql', 'payments', 'provider_payment_id'),
    ('20260812190000_phase_4_sales_payments_commissions.sql', 'sales', 'total_amount_cents'),
    ('20260812210000_phase_5_workflow_automation.sql', 'workflows', 'category'),
    ('20260812210000_phase_5_workflow_automation.sql', 'workflow_versions', 'definition'),
    ('20260812220000_phase_6_ai_intelligence.sql', 'ai_requests', 'mode'),
    ('20260813030000_phase_9_patient_portal_memberships.sql', 'clinical_documents', 'patient_visible'),
    ('20260813010000_phase_8_marketing_attribution.sql', 'marketing_sources', 'provider'),
    ('20260813030000_phase_9_patient_portal_memberships.sql', 'patient_accounts', 'auth_user_id'),
    ('20260813050000_phase_10_inventory_cogs.sql', 'inventory_events', 'idempotency_key'),
    ('20260813060000_phase_11_workforce_timeclock_payroll_support.sql', 'time_entries', 'clocked_in_at'),
    ('20260813070000_phase_12_reputation_referrals_reactivation.sql', 'review_requests', 'eligibility_reason'),
    ('20260814090000_phase_13_executive_command_center.sql', 'executive_targets', 'effective_start'),
    ('20260814110000_phase_14_campaigns_segmentation_bulk_messaging.sql', 'campaign_recipients', 'idempotency_key'),
    ('20260814130000_phase_15_phone_call_center_ai.sql', 'communication_numbers', 'external_phone_number_id'),
    ('20260814130000_phase_15_phone_call_center_ai.sql', 'communication_numbers', 'is_tracking_number'),
    ('20260814130000_phase_15_phone_call_center_ai.sql', 'calls', 'provider_call_id'),
    ('20260814130000_phase_15_phone_call_center_ai.sql', 'calls', 'appointment_id'),
    ('20260814130000_phase_15_phone_call_center_ai.sql', 'calls', 'queue_id'),
    ('20260814150000_phase_16_advanced_ai_operating_system.sql', 'predictive_scores', 'score'),
    ('20260814170000_phase_17_expansion_territories_multi_entity.sql', 'expansion_projects', 'stage'),
    ('20260814190000_phase_18_accounting_erp_financial_close.sql', 'accounting_export_batches', 'status'),
    ('20260814210000_phase_19_mobile_pwa_native_readiness.sql', 'device_registrations', 'device_name'),
    ('20260814230000_phase_20_production_hardening.sql', 'system_feature_flags', 'feature_key'),
    ('20260815010000_phase_21_gohighlevel_migration_live_sync.sql', 'ghl_connections', 'ghl_location_id'),
    ('20260815010000_phase_21_gohighlevel_migration_live_sync.sql', 'external_record_mappings', 'external_object_type'),
    ('20260815013000_phase_21b1_gohighlevel_oauth_installation.sql', 'ghl_oauth_installations', 'scopes'),
    ('20260816010000_phase_21c_ghl_calendar_type_mappings.sql', 'ghl_calendar_type_mappings', 'external_calendar_id'),
    ('20260816010000_phase_21c_ghl_calendar_type_mappings.sql', 'ghl_calendar_type_mappings', 'appointment_type_id'),
    ('20260816030000_phase_22_production_operations.sql', 'system_incidents', 'source'),
    ('20260816030000_phase_22_production_operations.sql', 'system_incidents', 'message'),
    ('20260816030000_phase_22_production_operations.sql', 'system_incidents', 'opened_at'),
    ('20260816030000_phase_22_production_operations.sql', 'system_worker_heartbeats', 'worker_type')
),
expected_constraints(migration_file, table_name, constraint_name, required_fragment) as (
  values
    ('20260813051000_phase_10_workflow_inventory_category_patch.sql', 'workflows', 'workflows_category_check', 'inventory'),
    ('20260814130000_phase_15_phone_call_center_ai.sql', 'calls', 'calls_direction_check', 'inbound'),
    ('20260814130000_phase_15_phone_call_center_ai.sql', 'calls', 'calls_status_check', 'voicemail')
),
expected_tables as (
  select m.ordinal, g.migration_file, t.table_name
  from expected_table_groups g
  join expected_migration_files m using (migration_file)
  cross join lateral unnest(g.table_names) as t(table_name)
),
expected_functions as (
  select m.ordinal, g.migration_file, f.function_name
  from expected_function_groups g
  join expected_migration_files m using (migration_file)
  cross join lateral unnest(g.function_names) as f(function_name)
),
expected_indexes as (
  select m.ordinal, g.migration_file, i.index_name
  from expected_index_groups g
  join expected_migration_files m using (migration_file)
  cross join lateral unnest(g.index_names) as i(index_name)
),
schema_count_check as (
  select
    0 as ordinal,
    'all migrations'::text as migration_file,
    'migration_file_count'::text as check_type,
    'expected migration files'::text as object_name,
    case when count(*) = 26 then 'PASS' else 'MISSING' end as status,
    'expected 26 migration files in this verifier; found ' || count(*)::text as details
  from expected_migration_files
),
migration_history_check as (
  select
    0 as ordinal,
    'manual SQL Editor compatible'::text as migration_file,
    'migration_history_optional'::text as check_type,
    'supabase_migrations.schema_migrations'::text as object_name,
    'INFO'::text as status,
    case
      when to_regclass('supabase_migrations.schema_migrations') is null
        then 'migration history table is absent; this verifier uses schema catalogs instead'
      else 'migration history table exists, but this verifier does not depend on it'
    end as details
),
table_checks as (
  select
    ordinal,
    migration_file,
    'table'::text as check_type,
    'public.' || table_name as object_name,
    case when to_regclass(format('public.%I', table_name)) is null then 'MISSING' else 'PASS' end as status,
    'expected table from migration'::text as details
  from expected_tables
),
rls_checks as (
  select
    t.ordinal,
    t.migration_file,
    'rls_enabled'::text as check_type,
    'public.' || t.table_name as object_name,
    case
      when c.oid is null then 'MISSING'
      when c.relrowsecurity then 'PASS'
      else 'MISSING'
    end as status,
    case
      when c.oid is null then 'table missing, cannot verify RLS'
      when c.relrowsecurity then 'row level security is enabled'
      else 'table exists but row level security is not enabled'
    end as details
  from expected_tables t
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = t.table_name and c.relkind in ('r','p')
),
policy_presence_checks as (
  select
    t.ordinal,
    t.migration_file,
    'policy_presence'::text as check_type,
    'public.' || t.table_name as object_name,
    case
      when t.table_name = 'ghl_oauth_credentials' then 'INFO'
      when exists (
        select 1
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = t.table_name
      ) then 'PASS'
      else 'MISSING'
    end as status,
    case
      when t.table_name = 'ghl_oauth_credentials' then 'credential table is intentionally RLS-protected without client policies'
      else 'expected at least one RLS policy on this table'
    end as details
  from expected_tables t
),
function_checks as (
  select
    f.ordinal,
    f.migration_file,
    'function'::text as check_type,
    'public.' || f.function_name || '()' as object_name,
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = f.function_name
      ) then 'PASS'
      else 'MISSING'
    end as status,
    'expected public function/RPC from migration'::text as details
  from expected_functions f
),
index_checks as (
  select
    i.ordinal,
    i.migration_file,
    'index'::text as check_type,
    'public.' || i.index_name as object_name,
    case
      when exists (
        select 1
        from pg_indexes x
        where x.schemaname = 'public'
          and x.indexname = i.index_name
      ) then 'PASS'
      else 'MISSING'
    end as status,
    'expected critical index or unique/idempotency guard'::text as details
  from expected_indexes i
),
column_checks as (
  select
    m.ordinal,
    c.migration_file,
    'column'::text as check_type,
    'public.' || c.table_name || '.' || c.column_name as object_name,
    case
      when exists (
        select 1
        from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.table_name
          and col.column_name = c.column_name
      ) then 'PASS'
      else 'MISSING'
    end as status,
    'expected critical column, including later-phase alterations'::text as details
  from expected_columns c
  join expected_migration_files m using (migration_file)
),
constraint_checks as (
  select
    m.ordinal,
    e.migration_file,
    'constraint_contains'::text as check_type,
    'public.' || e.table_name || '.' || e.constraint_name as object_name,
    case
      when con.oid is not null
        and pg_get_constraintdef(con.oid) ilike '%' || e.required_fragment || '%'
        then 'PASS'
      else 'MISSING'
    end as status,
    'expected constraint definition to contain "' || e.required_fragment || '"' as details
  from expected_constraints e
  join expected_migration_files m using (migration_file)
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
  left join pg_constraint con on con.conrelid = c.oid and con.conname = e.constraint_name
)
select migration_file, check_type, object_name, status, details
from (
  select * from schema_count_check
  union all
  select * from migration_history_check
  union all
  select * from table_checks
  union all
  select * from rls_checks
  union all
  select * from policy_presence_checks
  union all
  select * from function_checks
  union all
  select * from index_checks
  union all
  select * from column_checks
  union all
  select * from constraint_checks
) checks
order by
  ordinal,
  case status when 'MISSING' then 0 when 'INFO' then 1 else 2 end,
  migration_file,
  check_type,
  object_name;
