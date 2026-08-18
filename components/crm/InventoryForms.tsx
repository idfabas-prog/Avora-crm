"use client";

import { approvePurchaseOrder, createInventoryTransfer, createPurchaseOrder, receiveInventoryStock, receiveInventoryTransfer, receivePurchaseOrderItem, recordInventoryAdjustment, recordTreatmentInventoryUsage, shipInventoryTransfer, upsertInventoryItem, upsertInventoryLocationSetting, upsertVendor } from "@/app/inventory-actions";
import { ActionForm } from "@/components/crm/ActionForm";

type Option = { id: string; name: string };

export function InventoryItemForm({ item }: { item?: Record<string, string | number | boolean | null> }) {
  return (
    <ActionForm action={upsertInventoryItem} submitLabel={item?.id ? "Save Item" : "Create Item"} successMessage="Inventory item saved">
      {item?.id ? <input name="inventory_item_id" type="hidden" value={String(item.id)} /> : null}
      <div className="form-grid two">
        <label><span>Name</span><input defaultValue={String(item?.name ?? "")} name="name" required /></label>
        <label><span>SKU</span><input defaultValue={String(item?.sku ?? "")} name="sku" /></label>
        <label><span>Category</span><select defaultValue={String(item?.category ?? "Consumable")} name="category"><option>Injectable</option><option>Biologic</option><option>Regenerative Product</option><option>Medication</option><option>Skincare</option><option>Consumable</option><option>Device Consumable</option><option>IV Supply</option><option>Lab Supply</option><option>Retail Product</option><option>Other</option></select></label>
        <label><span>Unit</span><input defaultValue={String(item?.unit_of_measure ?? "unit")} name="unit_of_measure" required /></label>
        <label><span>Default Cost</span><input defaultValue={((Number(item?.default_cost_cents ?? 0)) / 100).toFixed(2)} name="default_cost" /></label>
      </div>
      <label><span>Description</span><textarea defaultValue={String(item?.description ?? "")} name="description" rows={3} /></label>
      <div className="checkbox-grid">
        <label><input defaultChecked={Boolean(item?.track_lot ?? true)} name="track_lot" type="checkbox" /> Track lots</label>
        <label><input defaultChecked={Boolean(item?.track_expiration)} name="track_expiration" type="checkbox" /> Track expiration</label>
        <label><input defaultChecked={Boolean(item?.active ?? true)} name="active" type="checkbox" /> Active</label>
      </div>
    </ActionForm>
  );
}

export function VendorForm({ vendor }: { vendor?: Record<string, string | boolean | null> }) {
  return (
    <ActionForm action={upsertVendor} submitLabel={vendor?.id ? "Save Vendor" : "Create Vendor"} successMessage="Vendor saved">
      {vendor?.id ? <input name="vendor_id" type="hidden" value={String(vendor.id)} /> : null}
      <div className="form-grid two">
        <label><span>Name</span><input defaultValue={String(vendor?.name ?? "")} name="name" required /></label>
        <label><span>Contact</span><input defaultValue={String(vendor?.contact_name ?? "")} name="contact_name" /></label>
        <label><span>Email</span><input defaultValue={String(vendor?.email ?? "")} name="email" type="email" /></label>
        <label><span>Phone</span><input defaultValue={String(vendor?.phone ?? "")} name="phone" /></label>
        <label><span>Website</span><input defaultValue={String(vendor?.website ?? "")} name="website" /></label>
        <label><span>Account #</span><input defaultValue={String(vendor?.account_number ?? "")} name="account_number" /></label>
      </div>
      <label><span>Notes</span><textarea defaultValue={String(vendor?.notes ?? "")} name="notes" rows={3} /></label>
      <label className="checkbox-row"><input defaultChecked={Boolean(vendor?.active ?? true)} name="active" type="checkbox" /> Active</label>
    </ActionForm>
  );
}

export function ReorderSettingForm({ items, locations }: { items: Option[]; locations: Option[] }) {
  return (
    <ActionForm action={upsertInventoryLocationSetting} submitLabel="Save Reorder Rule" successMessage="Reorder rule saved">
      <div className="form-grid two">
        <label><span>Location</span><select name="location_id">{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Item</span><select name="inventory_item_id">{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Par Level</span><input name="par_level" type="number" /></label>
        <label><span>Reorder Point</span><input name="reorder_point" type="number" /></label>
        <label><span>Reorder Quantity</span><input name="reorder_quantity" type="number" /></label>
      </div>
      <label className="checkbox-row"><input defaultChecked name="active" type="checkbox" /> Active</label>
    </ActionForm>
  );
}

export function PurchaseOrderForm({ items, locations, vendors }: { items: Option[]; locations: Option[]; vendors: Option[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={createPurchaseOrder} submitLabel="Create PO" successMessage="Purchase order created">
      <div className="form-grid two">
        <label><span>PO Number</span><input name="po_number" placeholder="MIA-2026-0011" required /></label>
        <label><span>Location</span><select name="location_id">{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Vendor</span><select name="vendor_id">{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        <label><span>Item</span><select name="inventory_item_id">{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Vendor SKU</span><input name="vendor_sku" /></label>
        <label><span>Quantity</span><input defaultValue="1" min="0.001" name="quantity" step="0.001" type="number" /></label>
        <label><span>Unit Cost</span><input name="unit_cost" placeholder="350.00" required /></label>
        <label><span>Order Date</span><input defaultValue={today} name="order_date" type="date" /></label>
        <label><span>Expected Date</span><input name="expected_date" type="date" /></label>
      </div>
      <label><span>Notes</span><textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function ApprovePurchaseOrderForm({ purchaseOrderId }: { purchaseOrderId: string }) {
  return <ActionForm action={approvePurchaseOrder} className="inline-form" submitLabel="Approve" successMessage="PO approved"><input name="purchase_order_id" type="hidden" value={purchaseOrderId} /></ActionForm>;
}

export function ReceivePurchaseOrderItemForm({ itemId }: { itemId: string }) {
  return (
    <ActionForm action={receivePurchaseOrderItem} className="record-form" submitLabel="Receive" successMessage="Inventory received">
      <input name="purchase_order_item_id" type="hidden" value={itemId} />
      <div className="form-grid two">
        <label><span>Quantity</span><input defaultValue="1" min="0.001" name="received_quantity" step="0.001" type="number" /></label>
        <label><span>Lot Number</span><input name="lot_number" /></label>
        <label><span>Expiration</span><input name="expiration_date" type="date" /></label>
        <label><span>Received Date</span><input defaultValue={new Date().toISOString().slice(0, 10)} name="received_date" type="date" /></label>
      </div>
    </ActionForm>
  );
}

export function DirectReceiveInventoryForm({ items, locations, vendors }: { items: Option[]; locations: Option[]; vendors: Option[] }) {
  return (
    <ActionForm action={receiveInventoryStock} submitLabel="Receive Stock" successMessage="Stock received">
      <div className="form-grid two">
        <label><span>Location</span><select name="location_id">{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Item</span><select name="inventory_item_id">{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Vendor</span><select name="vendor_id"><option value="">No vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        <label><span>Quantity</span><input defaultValue="1" min="0.001" name="received_quantity" step="0.001" type="number" /></label>
        <label><span>Unit Cost</span><input name="unit_cost" placeholder="125.00" required /></label>
        <label><span>Lot Number</span><input name="lot_number" /></label>
        <label><span>Expiration</span><input name="expiration_date" type="date" /></label>
        <label><span>Received Date</span><input defaultValue={new Date().toISOString().slice(0, 10)} name="received_date" type="date" /></label>
      </div>
      <label><span>Reason</span><textarea defaultValue="Direct development stock receipt" name="reason" required rows={3} /></label>
    </ActionForm>
  );
}

export function InventoryAdjustmentForm({ lots }: { lots: Option[] }) {
  return (
    <ActionForm action={recordInventoryAdjustment} submitLabel="Record Event" successMessage="Inventory event recorded">
      <div className="form-grid two">
        <label><span>Lot</span><select name="inventory_lot_id">{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}</select></label>
        <label><span>Type</span><select name="event_type"><option value="adjustment_increase">Adjustment Increase</option><option value="adjustment_decrease">Adjustment Decrease</option><option value="waste">Waste</option><option value="return_to_vendor">Return to Vendor</option><option value="expire">Expire</option><option value="recall">Recall</option></select></label>
        <label><span>Quantity</span><input defaultValue="1" min="0.001" name="quantity" step="0.001" type="number" /></label>
      </div>
      <label><span>Reason</span><textarea name="reason" required rows={3} /></label>
    </ActionForm>
  );
}

export function InventoryTransferForm({ lots, locations }: { lots: Option[]; locations: Option[] }) {
  return (
    <ActionForm action={createInventoryTransfer} submitLabel="Create Transfer" successMessage="Transfer created">
      <div className="form-grid two">
        <label><span>From</span><select name="from_location_id">{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>To</span><select name="to_location_id">{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Lot</span><select name="inventory_lot_id">{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}</select></label>
        <label><span>Quantity</span><input defaultValue="1" min="0.001" name="quantity" step="0.001" type="number" /></label>
        <label><span>Transfer Date</span><input defaultValue={new Date().toISOString().slice(0, 10)} name="transfer_date" type="date" /></label>
      </div>
      <label><span>Notes</span><textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function TransferStatusForm({ transferId, status }: { transferId: string; status: string }) {
  if (status === "draft") {
    return <ActionForm action={shipInventoryTransfer} className="inline-form" submitLabel="Ship" successMessage="Transfer shipped"><input name="transfer_id" type="hidden" value={transferId} /></ActionForm>;
  }
  if (status === "in_transit") {
    return <ActionForm action={receiveInventoryTransfer} className="inline-form" submitLabel="Receive" successMessage="Transfer received"><input name="transfer_id" type="hidden" value={transferId} /></ActionForm>;
  }
  return null;
}

export function TreatmentInventoryUsageForm({ sessionId, lots }: { sessionId: string; lots: Option[] }) {
  return (
    <ActionForm action={recordTreatmentInventoryUsage} submitLabel="Record Usage" successMessage="Treatment inventory recorded">
      <input name="treatment_session_id" type="hidden" value={sessionId} />
      <div className="form-grid two">
        <label><span>Lot</span><select name="inventory_lot_id">{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}</select></label>
        <label><span>Quantity Used</span><input defaultValue="1" min="0.001" name="quantity_used" step="0.001" type="number" /></label>
      </div>
    </ActionForm>
  );
}
