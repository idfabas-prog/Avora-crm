import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus } from "@/lib/crm/constants";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { getAccountingConfig } from "@/lib/accounting/config";
import { getUnmappedAccountingRecords } from "@/lib/accounting/reports";
import { createClient } from "@/lib/supabase/server";

export default async function AccountingSettingsPage() {
  const profile = await requireCurrentProfile();
  if (!hasAccountingPermission(profile, "accounting.mappings.read")) {
    return <div className="page-stack"><PageHeader title="Accounting Settings" description="Your role does not include accounting settings access." /></div>;
  }
  const supabase = await createClient();
  const config = getAccountingConfig();
  const [{ data: connections }, { data: accounts }, { data: mappings }, { data: locationMappings }, { data: entityMappings }, unmapped] = await Promise.all([
    supabase.from("accounting_connections").select("provider, status, company_name, sync_mode").eq("organization_id", profile.organizationId),
    supabase.from("accounting_accounts").select("external_account_id, account_name, account_type, active").eq("organization_id", profile.organizationId).order("external_account_id"),
    supabase.from("accounting_mappings").select("mapping_type, source_key, external_account_id, description, active").eq("organization_id", profile.organizationId).order("mapping_type"),
    supabase.from("accounting_location_mappings").select("external_location_id, external_location_name, active, locations(name)").eq("organization_id", profile.organizationId),
    supabase.from("accounting_entity_mappings").select("external_entity_id, external_entity_name, mapping_mode, active, operating_entities(name)").eq("organization_id", profile.organizationId),
    getUnmappedAccountingRecords(supabase, profile)
  ]);

  return (
    <div className="page-stack">
      <PageHeader description="Development-safe accounting provider, chart, and mapping foundation." title="Accounting Settings" />
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Connections</h2><span>Secrets are server-side only</span></div>
          <dl className="settings-list">
            <div><dt>Mode</dt><dd>{config.mode}</dd></div>
            <div><dt>QuickBooks Configured</dt><dd>{config.quickBooksConfigured ? "Yes" : "No"}</dd></div>
            <div><dt>Xero Configured</dt><dd>{config.xeroConfigured ? "Yes" : "No"}</dd></div>
          </dl>
          <div className="record-list">{(connections ?? []).map((connection) => <article key={`${connection.provider}-${connection.company_name}`}><strong>{connection.company_name ?? connection.provider}</strong><p>{connection.provider} - {connection.sync_mode}</p><StatusBadge status={fromDbStatus(connection.status)} /></article>)}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Mapping Coverage</h2><span>RLS-scoped</span></div>
          <dl className="settings-list">
            <div><dt>Missing Locations</dt><dd>{unmapped.missingLocationMappings.length}</dd></div>
            <div><dt>Missing Entity Estimate</dt><dd>{unmapped.missingEntityMappings}</dd></div>
            <div><dt>Missing Customer Sample</dt><dd>{unmapped.missingCustomerMappings}</dd></div>
          </dl>
        </section>
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Chart Of Accounts Cache</h2><span>{accounts?.length ?? 0} rows</span></div>
        <div className="table-wrap"><table><thead><tr><th>External ID</th><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody>{(accounts ?? []).map((account) => <tr key={account.external_account_id}><td>{account.external_account_id}</td><td>{account.account_name}</td><td>{account.account_type}</td><td>{account.active ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel wide-panel">
        <div className="panel-header"><h2>Mappings</h2><span>Configurable export treatment</span></div>
        <div className="table-wrap"><table><thead><tr><th>Type</th><th>Source</th><th>Account</th><th>Status</th><th>Description</th></tr></thead><tbody>{(mappings ?? []).map((mapping) => <tr key={`${mapping.mapping_type}-${mapping.source_key}`}><td>{fromDbStatus(mapping.mapping_type)}</td><td>{mapping.source_key}</td><td>{mapping.external_account_id ?? "Unmapped"}</td><td>{mapping.active ? "Active" : "Inactive"}</td><td>{mapping.description}</td></tr>)}</tbody></table></div>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Location Mappings</h2><span>Class/location foundation</span></div>
          <div className="record-list">{(locationMappings ?? []).map((mapping) => {
            const location = Array.isArray(mapping.locations) ? mapping.locations[0] : mapping.locations;
            return <article key={mapping.external_location_id}><strong>{location?.name ?? "Location"}</strong><p>{mapping.external_location_name}</p></article>;
          })}</div>
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Entity Mappings</h2><span>No consolidation assumptions</span></div>
          <div className="record-list">{(entityMappings ?? []).map((mapping) => {
            const entity = Array.isArray(mapping.operating_entities) ? mapping.operating_entities[0] : mapping.operating_entities;
            return <article key={mapping.external_entity_id}><strong>{entity?.name ?? "Entity"}</strong><p>{mapping.external_entity_name} - {fromDbStatus(mapping.mapping_mode)}</p></article>;
          })}</div>
        </section>
      </section>
    </div>
  );
}
