import Link from "next/link";
import { ReorderSettingForm } from "@/components/crm/InventoryForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function InventorySettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasInventoryPermission(profile, "inventory.settings.manage")) {
    return (
      <div className="page-stack">
        <PageHeader description="Your current role does not include inventory settings access." title="Inventory Settings" />
      </div>
    );
  }

  const [{ data: items }, { data: settings }] = await Promise.all([
    supabase.from("inventory_items").select("id, name").eq("organization_id", profile.organizationId).eq("active", true).order("name"),
    supabase.from("inventory_location_settings").select("id, par_level, reorder_point, reorder_quantity, active, locations(name), inventory_items(name, unit_of_measure)").eq("organization_id", profile.organizationId).order("created_at", { ascending: false })
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/inventory/vendors">Vendors</Link><Link className="primary-button" href="/settings/inventory/items">Items</Link></div>}
        description="Inventory catalog, vendors, and reorder thresholds."
        title="Inventory Settings"
      />
      <section className="settings-nav">
        <Link href="/settings/inventory/items">Inventory Items</Link>
        <Link href="/settings/inventory/vendors">Vendors</Link>
        <Link href="/inventory/purchase-orders">Purchase Orders</Link>
        <Link href="/reports/gross-profit">Gross Profit</Link>
      </section>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h2>Reorder Rule</h2><span>Location-specific par and reorder points</span></div>
          <ReorderSettingForm items={(items ?? []).map((item) => ({ id: item.id, name: item.name }))} locations={profile.locations} />
        </section>
        <section className="panel">
          <div className="panel-header"><h2>Current Rules</h2><span>Deterministic reorder suggestions</span></div>
          <div className="record-list">
            {(settings ?? []).map((setting) => {
              const item = Array.isArray(setting.inventory_items) ? setting.inventory_items[0] : setting.inventory_items;
              const location = Array.isArray(setting.locations) ? setting.locations[0] : setting.locations;
              return <article key={setting.id}><strong>{item?.name ?? "Item"} - {location?.name ?? "Location"}</strong><p>Par {setting.par_level ?? "-"} - reorder point {setting.reorder_point ?? "-"} - reorder quantity {setting.reorder_quantity ?? "-"}</p><span>{setting.active ? "Active" : "Inactive"} - unit {item?.unit_of_measure ?? "unit"}</span></article>;
            })}
          </div>
        </section>
      </section>
    </div>
  );
}
