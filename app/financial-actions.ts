"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { dollarsToCents } from "@/lib/financial/money";
import { assertPositiveAmount } from "@/lib/financial/validation";
import { assertFinancialPermission } from "@/lib/financial/permissions";

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
  assertFinancialPermission(profile, "sales.write");
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
  assertFinancialPermission(profile, "payments.write");
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
  assertFinancialPermission(profile, "payments.refund");
  const supabase = await createClient();
  const paymentId = required(formData.get("payment_id"), "Payment");
  const amountCents = dollarsToCents(required(formData.get("amount"), "Amount"));
  const reason = required(formData.get("reason"), "Refund reason");

  if (String(formData.get("confirm_refund") ?? "") !== "yes") {
    throw new Error("Confirm the refund before submitting");
  }

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
      reason,
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
  assertFinancialPermission(profile, "commissions.manage");
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

export async function upsertService(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "services.manage");
  const supabase = await createClient();
  const serviceId = optional(formData.get("service_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Service name"),
    category: required(formData.get("category"), "Category"),
    description: optional(formData.get("description")),
    default_price_cents: dollarsToCents(formData.get("default_price")),
    active: formData.get("active") === "on",
    commission_eligible: formData.get("commission_eligible") === "on",
    royalty_eligible: formData.get("royalty_eligible") === "on",
    default_commission_rate: Number(String(formData.get("default_commission_rate") ?? "0")) / 100,
    default_royalty_rate: Number(String(formData.get("default_royalty_rate") ?? "0")) / 100
  };

  if (payload.default_price_cents < 0) throw new Error("Default price cannot be negative");

  const query = serviceId
    ? supabase.from("services").update(payload).eq("id", serviceId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("services").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit(serviceId ? "Service Updated" : "Service Created", "services", data.id);
  revalidatePath("/settings/services");
  revalidatePath("/sales");
}

export async function upsertServiceLocationOverride(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "services.manage");
  const supabase = await createClient();
  const locationId = allowedLocation(required(formData.get("location_id"), "Location"), profile.locations.map((location) => location.id));
  const serviceId = required(formData.get("service_id"), "Service");
  const price = optional(formData.get("price"));
  const payload = {
    organization_id: profile.organizationId,
    location_id: locationId,
    service_id: serviceId,
    price_cents: price ? dollarsToCents(price) : null,
    active: formData.get("active") === "on",
    commission_eligible: formData.get("commission_eligible") === "on",
    royalty_eligible: formData.get("royalty_eligible") === "on"
  };

  const { data: existing } = await supabase.from("location_service_settings").select("id").eq("location_id", locationId).eq("service_id", serviceId).maybeSingle();
  const { data, error } = existing
    ? await supabase.from("location_service_settings").update(payload).eq("id", existing.id).select("id").single()
    : await supabase.from("location_service_settings").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Service Location Override Updated", "location_service_settings", data.id, { service_id: serviceId, location_id: locationId });
  revalidatePath("/settings/services");
}

export async function upsertPackage(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "services.manage");
  const supabase = await createClient();
  const packageId = optional(formData.get("package_id"));
  const payload = {
    organization_id: profile.organizationId,
    name: required(formData.get("name"), "Package name"),
    description: optional(formData.get("description")),
    package_price_cents: dollarsToCents(formData.get("package_price")),
    active: formData.get("active") === "on"
  };
  if (payload.package_price_cents < 0) throw new Error("Package price cannot be negative");

  const query = packageId
    ? supabase.from("packages").update(payload).eq("id", packageId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("packages").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit(packageId ? "Package Updated" : "Package Created", "packages", data.id);
  revalidatePath("/settings/packages");
  revalidatePath("/sales");
}

export async function upsertPackageItem(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "services.manage");
  const supabase = await createClient();
  const packageId = required(formData.get("package_id"), "Package");
  const serviceId = required(formData.get("service_id"), "Service");
  const quantity = Number(required(formData.get("quantity"), "Quantity"));
  const unitValueCents = dollarsToCents(formData.get("unit_value"));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be positive");

  const { error } = await supabase.from("package_items").upsert({
    package_id: packageId,
    service_id: serviceId,
    quantity,
    unit_value_cents: unitValueCents
  });
  if (error) throw new Error(error.message);
  await audit("Package Item Updated", "package_items", packageId, { service_id: serviceId });
  revalidatePath("/settings/packages");
}

export async function removePackageItem(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "services.manage");
  const supabase = await createClient();
  const packageId = required(formData.get("package_id"), "Package");
  const serviceId = required(formData.get("service_id"), "Service");
  const { error } = await supabase.from("package_items").delete().eq("package_id", packageId).eq("service_id", serviceId);
  if (error) throw new Error(error.message);
  await audit("Package Item Removed", "package_items", packageId, { service_id: serviceId });
  revalidatePath("/settings/packages");
}

export async function upsertPaymentMethodRule(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "payments.write");
  const supabase = await createClient();
  const ruleId = optional(formData.get("rule_id"));
  const payload = {
    organization_id: profile.organizationId,
    location_id: optional(formData.get("location_id")),
    payment_method: required(formData.get("payment_method"), "Payment method"),
    provider: required(formData.get("provider"), "Provider"),
    fee_percentage: Number(String(formData.get("fee_percentage") ?? "0")) / 100,
    fee_fixed_cents: dollarsToCents(formData.get("fee_fixed")),
    affects_commission_basis: formData.get("affects_commission_basis") === "on",
    affects_royalty_basis: formData.get("affects_royalty_basis") === "on",
    active: formData.get("active") === "on"
  };
  const query = ruleId
    ? supabase.from("payment_method_rules").update(payload).eq("id", ruleId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("payment_method_rules").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Payment Method Rule Updated", "payment_method_rules", data.id);
  revalidatePath("/settings/payments");
}

export async function upsertCommissionRule(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "commissions.manage");
  const supabase = await createClient();
  const ruleId = optional(formData.get("rule_id"));
  const commissionType = required(formData.get("commission_type"), "Commission type");
  const rawRate = Number(required(formData.get("rate"), "Rate"));
  const payload = {
    organization_id: profile.organizationId,
    location_id: optional(formData.get("location_id")),
    user_id: optional(formData.get("user_id")),
    service_id: optional(formData.get("service_id")),
    package_id: optional(formData.get("package_id")),
    category: optional(formData.get("category")),
    commission_type: commissionType,
    rate: commissionType === "fixed_amount" ? dollarsToCents(String(rawRate)) : rawRate / 100,
    basis: required(formData.get("basis"), "Basis"),
    effective_start_date: required(formData.get("effective_start_date"), "Effective start"),
    effective_end_date: optional(formData.get("effective_end_date")),
    active: formData.get("active") === "on"
  };
  const query = ruleId
    ? supabase.from("commission_rules").update(payload).eq("id", ruleId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("commission_rules").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Commission Rule Updated", "commission_rules", data.id);
  revalidatePath("/settings/commissions");
}

export async function createCommissionAdjustment(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "commissions.manage");
  const supabase = await createClient();
  const direction = required(formData.get("direction"), "Direction");
  const amount = dollarsToCents(required(formData.get("amount"), "Amount"));
  assertPositiveAmount(amount);
  const { data, error } = await supabase.from("commissions").insert({
    organization_id: profile.organizationId,
    location_id: optional(formData.get("location_id")),
    user_id: required(formData.get("user_id"), "Employee"),
    sale_id: required(formData.get("sale_id"), "Related sale"),
    payment_id: optional(formData.get("payment_id")),
    basis_amount_cents: 0,
    commission_rate: 0,
    commission_amount_cents: direction === "negative" ? -amount : amount,
    status: "adjusted",
    notes: required(formData.get("reason"), "Reason")
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Commission Adjusted", "commissions", data.id);
  revalidatePath("/sales/commissions");
  revalidatePath("/settings/commissions");
}

export async function upsertRoyaltyRule(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "royalties.manage");
  const supabase = await createClient();
  const ruleId = optional(formData.get("rule_id"));
  const payload = {
    organization_id: profile.organizationId,
    location_id: optional(formData.get("location_id")),
    category: optional(formData.get("category")),
    service_id: optional(formData.get("service_id")),
    package_id: optional(formData.get("package_id")),
    rate: Number(required(formData.get("rate"), "Rate")) / 100,
    basis: required(formData.get("basis"), "Basis"),
    effective_start_date: required(formData.get("effective_start_date"), "Effective start"),
    effective_end_date: optional(formData.get("effective_end_date")),
    active: formData.get("active") === "on"
  };
  const query = ruleId
    ? supabase.from("royalty_rules").update(payload).eq("id", ruleId).eq("organization_id", profile.organizationId).select("id").single()
    : supabase.from("royalty_rules").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  await audit("Royalty Rule Updated", "royalty_rules", data.id);
  revalidatePath("/settings/royalties");
  revalidatePath("/reports");
}

export async function createSaleAdjustment(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "sales.adjust");
  const supabase = await createClient();
  const saleId = required(formData.get("sale_id"), "Sale");
  const amount = dollarsToCents(required(formData.get("amount"), "Amount"));
  const direction = required(formData.get("direction"), "Direction");
  const { data, error } = await supabase.from("sale_adjustments").insert({
    organization_id: profile.organizationId,
    sale_id: saleId,
    adjustment_type: required(formData.get("adjustment_type"), "Adjustment type"),
    amount_cents: direction === "negative" ? -amount : amount,
    reason: required(formData.get("reason"), "Reason"),
    authorized_by: profile.id
  }).select("id").single();
  if (error) throw new Error(error.message);
  await audit("Adjustment Added", "sale_adjustments", data.id, { sale_id: saleId });
  revalidatePath("/sales");
  revalidatePath("/payments");
}

export async function recalculateSale(formData: FormData) {
  const profile = await requireCurrentProfile();
  assertFinancialPermission(profile, "financial_reports.read");
  const supabase = await createClient();
  const saleId = required(formData.get("sale_id"), "Sale");
  if (String(formData.get("confirm_recalculate") ?? "") !== "yes") {
    throw new Error("Confirm recalculation before submitting");
  }
  const { error } = await supabase.rpc("recalculate_sale_financials", { target_sale_id: saleId });
  if (error) throw new Error(error.message);
  await audit("Sale Recalculated", "sales", saleId);
  revalidatePath("/settings/financial-health");
  revalidatePath("/sales");
  revalidatePath("/reports");
}
