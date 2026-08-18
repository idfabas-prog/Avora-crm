import Link from "next/link";
import { VendorForm } from "@/components/crm/InventoryForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { formatDate } from "@/lib/crm/constants";
import { formatMoney } from "@/lib/financial/money";
import { hasInventoryPermission } from "@/lib/inventory/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function InventoryVendorsSettingsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  if (!hasInventoryPermission(profile, "inventory.vendors.manage")) {
    return (
      <div className="page-stack">
        <PageHeader description="Your current role cannot manage inventory vendors." title="Inventory Vendors" />
      </div>
    );
  }

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, contact_name, email, phone, website, account_number, notes, active, vendor_items(last_cost_cents, preferred, inventory_items(name)), purchase_orders(po_number, status, total_cents, order_date)")
    .eq("organization_id", profile.organizationId)
    .order("name");

  return (
    <div className="page-stack">
      <PageHeader
        action={<div className="header-actions"><Link className="secondary-button" href="/settings/inventory/items">Items</Link><Link className="primary-button" href="/inventory/purchase-orders">Purchase Orders</Link></div>}
        description="Fictional development vendors only. No payment credentials are stored."
        title="Inventory Vendors"
      />
      <section className="dashboard-grid">
        <section className="panel"><div className="panel-header"><h2>Create Vendor</h2><span>Operational contact record</span></div><VendorForm /></section>
        <section className="panel">
          <div className="panel-header"><h2>Vendors</h2><span>{vendors?.length ?? 0} records</span></div>
          <div className="record-list">
            {(vendors ?? []).map((vendor) => (
              <article key={vendor.id}>
                <div className="split-row"><strong>{vendor.name}</strong><StatusBadge status={vendor.active ? "Active" : "Inactive"} /></div>
                <p>{vendor.contact_name ?? "No contact"} - {vendor.email ?? "No email"} - {vendor.phone ?? "No phone"}</p>
                <span>{vendor.website ?? "No website"} - account {vendor.account_number ?? "not set"}</span>
                <div className="record-list compact-list">
                  {(vendor.vendor_items ?? []).map((vendorItem, index) => {
                    const item = Array.isArray(vendorItem.inventory_items) ? vendorItem.inventory_items[0] : vendorItem.inventory_items;
                    return <article key={`${vendor.id}-${index}`}><strong>{item?.name ?? "Item"}</strong><p>{formatMoney(vendorItem.last_cost_cents)} last cost - {vendorItem.preferred ? "Preferred" : "Alternate"}</p></article>;
                  })}
                  {(vendor.purchase_orders ?? []).map((po) => <article key={po.po_number}><strong>{po.po_number}</strong><p>{formatDate(po.order_date)} - {formatMoney(po.total_cents)} - {po.status}</p></article>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
