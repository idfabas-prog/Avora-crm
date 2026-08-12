"use client";

import {
  addPayment,
  createCommissionAdjustment,
  createRefund,
  createSale,
  createSaleAdjustment,
  recalculateSale,
  removePackageItem,
  updateCommissionStatus,
  upsertCommissionRule,
  upsertPackage,
  upsertPackageItem,
  upsertPaymentMethodRule,
  upsertRoyaltyRule,
  upsertService,
  upsertServiceLocationOverride
} from "@/app/financial-actions";
import { ActionForm } from "@/components/crm/ActionForm";
import { previewCommissionRule, previewRoyaltyRule } from "@/lib/financial/rule-preview";

type Option = { id: string; name: string };
type CatalogItem = { id: string; name: string; price_cents: number; type: "service" | "package" };

export function NewSaleForm({
  contacts,
  locations,
  opportunities,
  salespeople,
  catalog,
  contactId
}: {
  contacts: Option[];
  locations: Option[];
  opportunities: Option[];
  salespeople: Option[];
  catalog: CatalogItem[];
  contactId?: string;
}) {
  return (
    <ActionForm action={createSale} submitLabel="Create Sale" successMessage="Sale created">
      <div className="form-grid two">
        <label>
          <span>Contact</span>
          <select defaultValue={contactId ?? ""} name="contact_id" required>
            <option value="">Choose contact</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
          </select>
        </label>
        <label>
          <span>Location</span>
          <select name="location_id" required>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label>
          <span>Salesperson</span>
          <select name="salesperson_id">
            <option value="">Current user</option>
            {salespeople.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label>
          <span>Opportunity</span>
          <select name="opportunity_id">
            <option value="">None</option>
            {opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.name}</option>)}
          </select>
        </label>
        <label>
          <span>Item</span>
          <select
            name="item_id"
            required
            onChange={(event) => {
              const selected = catalog.find((item) => item.id === event.currentTarget.value);
              const form = event.currentTarget.form;
              if (!form || !selected) return;
              const type = form.elements.namedItem("item_type") as HTMLInputElement | null;
              const price = form.elements.namedItem("unit_price") as HTMLInputElement | null;
              if (type) type.value = selected.type;
              if (price) price.value = String((selected.price_cents / 100).toFixed(2));
            }}
          >
            <option value="">Choose service or package</option>
            {catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <input name="item_type" type="hidden" />
        <label><span>Quantity</span><input defaultValue="1" min="1" name="quantity" type="number" /></label>
        <label><span>Price</span><input name="unit_price" placeholder="5500.00" required /></label>
        <label><span>Discount</span><input name="discount_amount" placeholder="0.00" /></label>
        <label><span>Sale Date</span><input defaultValue={new Date().toISOString().slice(0, 16)} name="sale_date" type="datetime-local" /></label>
      </div>
      <label><span>Notes</span><textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function AddPaymentForm({ sales }: { sales: Option[] }) {
  return (
    <ActionForm action={addPayment} submitLabel="Record Payment" successMessage="Payment recorded">
      <div className="form-grid two">
        <label><span>Sale</span><select name="sale_id" required>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}</select></label>
        <label><span>Amount</span><input name="amount" placeholder="1000.00" required /></label>
        <label><span>Method</span><select name="payment_method"><option value="card">Card</option><option value="cash">Cash</option><option value="ach">ACH</option><option value="check">Check</option><option value="cherry">Cherry</option><option value="carecredit">CareCredit</option><option value="external_financing">External Financing</option><option value="other">Other</option></select></label>
        <label><span>Provider</span><select name="payment_provider"><option value="manual">Manual Record</option><option value="stripe">Stripe Test/Live</option><option value="external">External</option><option value="cherry">Cherry</option><option value="other">Other</option></select></label>
        <label><span>Purpose</span><select name="payment_purpose"><option value="deposit">Deposit</option><option value="installment">Installment</option><option value="final_payment">Final Payment</option><option value="full_payment">Full Payment</option><option value="adjustment">Adjustment</option></select></label>
        <label><span>Date</span><input defaultValue={new Date().toISOString().slice(0, 16)} name="received_at" type="datetime-local" /></label>
      </div>
      <label><span>Reference</span><input name="external_reference" /></label>
      <label><span>Notes</span><textarea name="notes" rows={3} /></label>
    </ActionForm>
  );
}

export function RefundForm({ payments }: { payments: Option[] }) {
  return (
    <ActionForm action={createRefund} submitLabel="Create Refund" successMessage="Refund created">
      <div className="form-grid two">
        <label><span>Payment</span><select name="payment_id" required>{payments.map((payment) => <option key={payment.id} value={payment.id}>{payment.name}</option>)}</select></label>
        <label><span>Amount</span><input name="amount" placeholder="100.00" required /></label>
        <label><span>Date</span><input defaultValue={new Date().toISOString().slice(0, 16)} name="refunded_at" type="datetime-local" /></label>
      </div>
      <label><span>Reason</span><textarea name="reason" required rows={3} /></label>
      <label className="checkbox-row"><input name="confirm_refund" required type="checkbox" value="yes" /> I understand this refund changes net revenue and may create commission/royalty reversals.</label>
    </ActionForm>
  );
}

export function SaleAdjustmentForm({ sales }: { sales: Option[] }) {
  return (
    <ActionForm action={createSaleAdjustment} submitLabel="Add Adjustment" successMessage="Adjustment added">
      <div className="form-grid two">
        <label><span>Sale</span><select name="sale_id" required>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}</select></label>
        <label><span>Type</span><select name="adjustment_type"><option value="credit">Credit</option><option value="write_off">Write-Off</option><option value="price_correction">Price Correction</option><option value="post_sale_discount">Manual Discount</option><option value="manual">Other</option></select></label>
        <label><span>Direction</span><select name="direction"><option value="negative">Reduce Sale</option><option value="positive">Increase Sale</option></select></label>
        <label><span>Amount</span><input name="amount" required /></label>
      </div>
      <label><span>Reason</span><textarea name="reason" required rows={3} /></label>
    </ActionForm>
  );
}

export function CommissionStatusForm({ commissionId }: { commissionId: string }) {
  return (
    <ActionForm action={updateCommissionStatus} className="inline-form" submitLabel="Update" successMessage="Commission updated">
      <input name="commission_id" type="hidden" value={commissionId} />
      <select name="status">
        <option value="approved">Approve</option>
        <option value="paid">Mark Paid</option>
      </select>
    </ActionForm>
  );
}

export type ServiceFormData = {
  id?: string;
  name?: string;
  category?: string;
  description?: string | null;
  default_price_cents?: number | null;
  active?: boolean | null;
  commission_eligible?: boolean | null;
  royalty_eligible?: boolean | null;
  default_commission_rate?: number | null;
  default_royalty_rate?: number | null;
};

export function ServiceForm({ service }: { service?: ServiceFormData }) {
  return (
    <ActionForm action={upsertService} submitLabel={service?.id ? "Save Service" : "Create Service"} successMessage="Service saved">
      {service?.id ? <input name="service_id" type="hidden" value={service.id} /> : null}
      <div className="form-grid two">
        <label><span>Name</span><input defaultValue={service?.name ?? ""} name="name" required /></label>
        <label><span>Category</span><input defaultValue={service?.category ?? "Other"} name="category" required /></label>
        <label><span>Default Price</span><input defaultValue={((service?.default_price_cents ?? 0) / 100).toFixed(2)} name="default_price" /></label>
        <label><span>Default Commission %</span><input defaultValue={String((service?.default_commission_rate ?? 0) * 100)} name="default_commission_rate" /></label>
        <label><span>Default Royalty %</span><input defaultValue={String((service?.default_royalty_rate ?? 0) * 100)} name="default_royalty_rate" /></label>
      </div>
      <label><span>Description</span><textarea defaultValue={service?.description ?? ""} name="description" rows={3} /></label>
      <div className="checkbox-grid">
        <label><input defaultChecked={service?.active ?? true} name="active" type="checkbox" /> Active</label>
        <label><input defaultChecked={service?.commission_eligible ?? true} name="commission_eligible" type="checkbox" /> Commission eligible</label>
        <label><input defaultChecked={service?.royalty_eligible ?? true} name="royalty_eligible" type="checkbox" /> Royalty eligible</label>
      </div>
    </ActionForm>
  );
}

export function ServiceOverrideForm({ services, locations }: { services: Option[]; locations: Option[] }) {
  return (
    <ActionForm action={upsertServiceLocationOverride} submitLabel="Save Override" successMessage="Override saved">
      <div className="form-grid two">
        <label><span>Service</span><select name="service_id" required>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Override Price</span><input name="price" /></label>
      </div>
      <div className="checkbox-grid">
        <label><input defaultChecked name="active" type="checkbox" /> Available</label>
        <label><input defaultChecked name="commission_eligible" type="checkbox" /> Commission eligible</label>
        <label><input defaultChecked name="royalty_eligible" type="checkbox" /> Royalty eligible</label>
      </div>
    </ActionForm>
  );
}

export type PackageFormData = { id?: string; name?: string; description?: string | null; package_price_cents?: number | null; active?: boolean | null };

export function PackageForm({ pack }: { pack?: PackageFormData }) {
  return (
    <ActionForm action={upsertPackage} submitLabel={pack?.id ? "Save Package" : "Create Package"} successMessage="Package saved">
      {pack?.id ? <input name="package_id" type="hidden" value={pack.id} /> : null}
      <div className="form-grid two">
        <label><span>Name</span><input defaultValue={pack?.name ?? ""} name="name" required /></label>
        <label><span>Price</span><input defaultValue={((pack?.package_price_cents ?? 0) / 100).toFixed(2)} name="package_price" /></label>
      </div>
      <label><span>Description</span><textarea defaultValue={pack?.description ?? ""} name="description" rows={3} /></label>
      <label className="checkbox-row"><input defaultChecked={pack?.active ?? true} name="active" type="checkbox" /> Active</label>
    </ActionForm>
  );
}

export function PackageItemForm({ packages, services }: { packages: Option[]; services: Option[] }) {
  return (
    <ActionForm action={upsertPackageItem} submitLabel="Save Package Item" successMessage="Package item saved">
      <div className="form-grid two">
        <label><span>Package</span><select name="package_id" required>{packages.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>
        <label><span>Service</span><select name="service_id" required>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label><span>Quantity</span><input defaultValue="1" min="1" name="quantity" required type="number" /></label>
        <label><span>Unit Value</span><input defaultValue="0.00" name="unit_value" /></label>
      </div>
    </ActionForm>
  );
}

export function RemovePackageItemForm({ packageId, serviceId }: { packageId: string; serviceId: string }) {
  return (
    <ActionForm action={removePackageItem} className="inline-form" submitLabel="Remove" successMessage="Removed">
      <input name="package_id" type="hidden" value={packageId} />
      <input name="service_id" type="hidden" value={serviceId} />
    </ActionForm>
  );
}

export function PaymentMethodRuleForm({ rule, locations }: { rule?: Record<string, string | number | boolean | null>; locations: Option[] }) {
  return (
    <ActionForm action={upsertPaymentMethodRule} submitLabel={rule?.id ? "Save Rule" : "Create Rule"} successMessage="Payment method saved">
      {rule?.id ? <input name="rule_id" type="hidden" value={String(rule.id)} /> : null}
      <div className="form-grid two">
        <label><span>Method</span><input defaultValue={String(rule?.payment_method ?? "")} name="payment_method" required /></label>
        <label><span>Provider</span><input defaultValue={String(rule?.provider ?? "")} name="provider" required /></label>
        <label><span>Location</span><select defaultValue={String(rule?.location_id ?? "")} name="location_id"><option value="">Organization Default</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Fee %</span><input defaultValue={String(Number(rule?.fee_percentage ?? 0) * 100)} name="fee_percentage" /></label>
        <label><span>Fixed Fee</span><input defaultValue={((Number(rule?.fee_fixed_cents ?? 0)) / 100).toFixed(2)} name="fee_fixed" /></label>
      </div>
      <div className="checkbox-grid">
        <label><input defaultChecked={Boolean(rule?.active ?? true)} name="active" type="checkbox" /> Active</label>
        <label><input defaultChecked={Boolean(rule?.affects_commission_basis)} name="affects_commission_basis" type="checkbox" /> Affects commission basis</label>
        <label><input defaultChecked={Boolean(rule?.affects_royalty_basis)} name="affects_royalty_basis" type="checkbox" /> Affects royalty basis</label>
      </div>
    </ActionForm>
  );
}

export function CommissionRuleForm({ users, locations, services, packages }: { users: Option[]; locations: Option[]; services: Option[]; packages: Option[] }) {
  const preview = previewCommissionRule({ commissionType: "percentage", rate: 0.05, basis: "money_collected" }, { employee: "Selected employee", service: "selected service", location: "selected location" });
  return (
    <ActionForm action={upsertCommissionRule} submitLabel="Save Commission Rule" successMessage="Commission rule saved">
      <p className="quiet-text">{preview}</p>
      <div className="form-grid two">
        <label><span>Employee</span><select name="user_id"><option value="">Organization default</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id"><option value="">Any location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Service</span><select name="service_id"><option value="">Any service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label><span>Package</span><select name="package_id"><option value="">Any package</option>{packages.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>
        <label><span>Category</span><input name="category" /></label>
        <label><span>Type</span><select name="commission_type"><option value="percentage">Percentage</option><option value="fixed_amount">Fixed Amount</option></select></label>
        <label><span>Rate / Amount</span><input defaultValue="5" name="rate" required /></label>
        <label><span>Basis</span><select name="basis"><option value="money_collected">Money Collected</option><option value="gross_sale">Gross Sale</option><option value="net_after_payment_fees">Net After Payment Fees</option><option value="custom_manual">Custom / Manual</option></select></label>
        <label><span>Effective Start</span><input defaultValue={new Date().toISOString().slice(0, 10)} name="effective_start_date" type="date" /></label>
        <label><span>Effective End</span><input name="effective_end_date" type="date" /></label>
      </div>
      <label className="checkbox-row"><input defaultChecked name="active" type="checkbox" /> Active</label>
    </ActionForm>
  );
}

export function CommissionAdjustmentForm({ users, sales, payments, locations }: { users: Option[]; sales: Option[]; payments: Option[]; locations: Option[] }) {
  return (
    <ActionForm action={createCommissionAdjustment} submitLabel="Create Adjustment" successMessage="Commission adjustment created">
      <div className="form-grid two">
        <label><span>Employee</span><select name="user_id" required>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label><span>Location</span><select name="location_id"><option value="">None</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Sale</span><select name="sale_id" required>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}</select></label>
        <label><span>Payment</span><select name="payment_id"><option value="">None</option>{payments.map((payment) => <option key={payment.id} value={payment.id}>{payment.name}</option>)}</select></label>
        <label><span>Direction</span><select name="direction"><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
        <label><span>Amount</span><input name="amount" required /></label>
      </div>
      <label><span>Reason</span><textarea name="reason" required rows={3} /></label>
    </ActionForm>
  );
}

export function RoyaltyRuleForm({ locations, services, packages }: { locations: Option[]; services: Option[]; packages: Option[] }) {
  const preview = previewRoyaltyRule({ rate: 0.07, basis: "money_collected" }, { category: "selected revenue" });
  return (
    <ActionForm action={upsertRoyaltyRule} submitLabel="Save Royalty Rule" successMessage="Royalty rule saved">
      <p className="quiet-text">{preview}</p>
      <div className="form-grid two">
        <label><span>Location</span><select name="location_id"><option value="">Any location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label><span>Service</span><select name="service_id"><option value="">Any service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label><span>Package</span><select name="package_id"><option value="">Any package</option>{packages.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select></label>
        <label><span>Category</span><input name="category" /></label>
        <label><span>Rate %</span><input defaultValue="7" name="rate" required /></label>
        <label><span>Basis</span><select name="basis"><option value="money_collected">Money Collected</option><option value="gross_sale">Gross Sale</option><option value="net_after_refunds">Net After Refunds</option></select></label>
        <label><span>Effective Start</span><input defaultValue={new Date().toISOString().slice(0, 10)} name="effective_start_date" type="date" /></label>
        <label><span>Effective End</span><input name="effective_end_date" type="date" /></label>
      </div>
      <label className="checkbox-row"><input defaultChecked name="active" type="checkbox" /> Active</label>
    </ActionForm>
  );
}

export function RecalculateSaleForm({ sales }: { sales: Option[] }) {
  return (
    <ActionForm action={recalculateSale} submitLabel="Recalculate Sale" successMessage="Sale recalculated">
      <label><span>Sale</span><select name="sale_id" required>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}</select></label>
      <label className="checkbox-row"><input name="confirm_recalculate" required type="checkbox" value="yes" /> I understand recalculation may change stored totals.</label>
    </ActionForm>
  );
}
