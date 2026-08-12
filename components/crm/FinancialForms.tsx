"use client";

import { addPayment, createRefund, createSale, updateCommissionStatus } from "@/app/financial-actions";
import { ActionForm } from "@/components/crm/ActionForm";

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
      <label><span>Reason</span><textarea name="reason" rows={3} /></label>
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
