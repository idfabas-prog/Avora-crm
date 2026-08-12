"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { dollarsToCents } from "@/lib/financial/money";
import { assertPositiveAmount } from "@/lib/financial/validation";

function required(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function allowedLocation(locationId: string | null, allowedIds: string[]) {
  if (!locationId) return null;
  if (!allowedIds.includes(locationId)) {
    throw new Error("Selected location is not available for this user");
  }
  return locationId;
}

async function audit(action: string, entityTable: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();

  await supabase.from("audit_logs").insert({
    organization_id: profile.organizationId,
    actor_id: profile.id,
    action,
    entity_table: entityTable,
    entity_id: entityId,
    metadata
  });
}

export async function createSale(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const locationId = allowedLocation(required(formData.get("location_id"), "Location"), profile.locations.map((location) => location.id));
  const itemType = required(formData.get("item_type"), "Item type");
  const itemId = required(formData.get("item_id"), "Item");
  const quantity = Math.max(Number(required(formData.get("quantity"), "Quantity")), 1);
  const unitPriceCents = dollarsToCents(required(formData.get("unit_price"), "Price"));
  const discountAmountCents = dollarsToCents(optional(formData.get("discount_amount")));

  assertPositiveAmount(unitPriceCents, "Price");

  const itemResult = itemType === "package"
    ? await supabase.from("packages").select("id, name").eq("id", itemId).eq("organization_id", profile.organizationId).single()
    : await supabase.from("services").select("id, name, commission_eligible, royalty_eligible").eq("id", itemId).eq("organization_id", profile.organizationId).single();

  if (itemResult.error || !itemResult.data) {
    throw new Error(itemResult.error?.message ?? "Selected item was not found");
  }

  const { data: sale, error } = await supabase
    .from("sales")
    .insert({
      organization_id: profile.organizationId,
      location_id: locationId,
      contact_id: required(formData.get("contact_id"), "Contact"),
      opportunity_id: optional(formData.get("opportunity_id")),
      salesperson_id: optional(formData.get("salesperson_id")) ?? profile.id,
      created_by: profile.id,
      sale_date: required(formData.get("sale_date"), "Sale date"),
      notes: optional(formData.get("notes")),
      source: "manual"
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const serviceItem = itemType === "service" ? itemResult.data as { id: string; name: string; commission_eligible?: boolean; royalty_eligible?: boolean } : null;
  const packageItem = itemType === "package" ? itemResult.data as { id: string; name: string } : null;
  const { error: lineError } = await supabase.from("sale_items").insert({
    sale_id: sale.id,
    service_id: serviceItem?.id ?? null,
    package_id: packageItem?.id ?? null,
    description: serviceItem?.name ?? packageItem?.name ?? "Sale item",
    quantity,
    unit_price_cents: unitPriceCents,
    discount_amount_cents: discountAmountCents,
    commission_eligible: serviceItem?.commission_eligible ?? true,
    royalty_eligible: serviceItem?.royalty_eligible ?? true
  });

  if (lineError) {
    throw new Error(lineError.message);
  }

  await audit("Sale Created", "sales", sale.id, { location_id: locationId });
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath(`/contacts/${required(formData.get("contact_id"), "Contact")}`);
}

export async function addPayment(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const saleId = required(formData.get("sale_id"), "Sale");
  const amountCents = dollarsToCents(required(formData.get("amount"), "Amount"));
  assertPositiveAmount(amountCents);

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id, organization_id, location_id, contact_id")
    .eq("id", saleId)
    .eq("organization_id", profile.organizationId)
    .single();

  if (saleError || !sale) {
    throw new Error(saleError?.message ?? "Sale was not found");
  }

  if (sale.location_id) {
    allowedLocation(sale.location_id, profile.locations.map((location) => location.id));
  }

  const provider = required(formData.get("payment_provider"), "Provider");
  const simulated = provider !== "stripe" || process.env.PAYMENTS_MODE !== "production";
  const providerPaymentId = optional(formData.get("provider_payment_id")) ?? `sim_pay_${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("payments")
    .insert({
      organization_id: profile.organizationId,
      location_id: sale.location_id,
      contact_id: sale.contact_id,
      sale_id: sale.id,
      amount_cents: amountCents,
      payment_method: required(formData.get("payment_method"), "Payment method"),
      payment_provider: provider,
      payment_purpose: optional(formData.get("payment_purpose")) ?? "installment",
      provider_payment_id: providerPaymentId,
      status: optional(formData.get("status")) ?? "succeeded",
      received_at: optional(formData.get("received_at")) ?? new Date().toISOString(),
      processed_by: profile.id,
      notes: optional(formData.get("notes")),
      external_reference: optional(formData.get("external_reference")),
      simulated
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await audit("Payment Recorded", "payments", data.id, { sale_id: sale.id, simulated });
  revalidatePath("/payments");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath(`/contacts/${sale.contact_id}`);
}

export async function createRefund(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const paymentId = required(formData.get("payment_id"), "Payment");
  const amountCents = dollarsToCents(required(formData.get("amount"), "Amount"));
  assertPositiveAmount(amountCents, "Refund amount");

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, organization_id, location_id, contact_id, sale_id, amount_cents")
    .eq("id", paymentId)
    .eq("organization_id", profile.organizationId)
    .single();

  if (paymentError || !payment) {
    throw new Error(paymentError?.message ?? "Payment was not found");
  }

  if (payment.location_id) {
    allowedLocation(payment.location_id, profile.locations.map((location) => location.id));
  }

  const { data, error } = await supabase
    .from("refunds")
    .insert({
      organization_id: profile.organizationId,
      location_id: payment.location_id,
      payment_id: payment.id,
      sale_id: payment.sale_id,
      contact_id: payment.contact_id,
      amount_cents: amountCents,
      reason: optional(formData.get("reason")),
      provider_refund_id: optional(formData.get("provider_refund_id")) ?? `sim_ref_${crypto.randomUUID()}`,
      status: optional(formData.get("status")) ?? "succeeded",
      processed_by: profile.id,
      refunded_at: optional(formData.get("refunded_at")) ?? new Date().toISOString()
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await audit("Refund Created", "refunds", data.id, { payment_id: payment.id, sale_id: payment.sale_id });
  revalidatePath("/payments");
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath(`/contacts/${payment.contact_id}`);
}

export async function updateCommissionStatus(formData: FormData) {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const commissionId = required(formData.get("commission_id"), "Commission");
  const status = required(formData.get("status"), "Status");
  const timestamp = new Date().toISOString();

  const patch: Record<string, string | null> = { status };
  if (status === "approved") patch.approved_at = timestamp;
  if (status === "paid") patch.paid_at = timestamp;

  const { error } = await supabase
    .from("commissions")
    .update(patch)
    .eq("id", commissionId)
    .eq("organization_id", profile.organizationId);

  if (error) {
    throw new Error(error.message);
  }

  await audit(status === "paid" ? "Commission Paid" : "Commission Approved", "commissions", commissionId, { status });
  revalidatePath("/sales/commissions");
  revalidatePath("/reports");
}
