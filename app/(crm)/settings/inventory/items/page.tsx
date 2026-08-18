import Link from "next/link";
import { InventoryItemForm } from "@/components/crm/InventoryForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function InventoryItemsSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasInventoryPermission(profile, "inventory.write")) {
    return (
      <div className="page-stack">
        <PageHeader description="Your current role cannot manage inventory items." title="Inventory Items" />
      </div>
    );
  }

  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, sku, category, unit_of_measure, default_cost_cents, track_lot, track_expiration, active")
    .eq("organization_id", profile.organizationId)
    .order("name");

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/inventory">Reorder Rules</Link><Link className="primary-button" href="/inventory">Inventory</Link></div>}
        description="Create, edit, deactivate, and configure lot/expiration tracking."
        title="Inventory Items"
      />
      <section className="dashboard-grid">
        <section className="panel"><div className="panel-header"><h2>Create Item</h2><span>Fictional/demo inventory catalog</span></div><InventoryItemForm /></section>
        <section className="panel">
          <div className="panel-header"><h2>Catalog</h2><span>{items?.length ?? 0} items</span></div>
          <div className="record-list">
            {(items ?? []).map((item) => (
              <article key={item.id}>
                <strong><Link className="strong-link" href={`/inventory/items/${item.id}`}>{item.name}</Link></strong>
                <p>{item.category} - {item.sku ?? "No SKU"} - {item.unit_of_measure} - {formatMoney(item.default_cost_cents)}</p>
                <span>Lot tracking {item.track_lot ? "on" : "off"} - expiration tracking {item.track_expiration ? "on" : "off"}</span>
                <StatusBadge status={item.active ? "Active" : "Inactive"} />
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
