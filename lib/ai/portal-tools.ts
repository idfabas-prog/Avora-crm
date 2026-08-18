import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentProfile } from "@/lib/auth/profile";
import { formatMoney } from "@/lib/financial/money";
import type { AiTrace } from "./types";

export async function getPortalRevenueSummary(supabase: SupabaseClient, profile: CurrentProfile) {
  const [{ data: accounts }, { data: memberships }, { data: paymentPlans }, { data: installments }] = await Promise.all([
    supabase.from("patient_accounts").select("id, status").eq("organization_id", profile.organizationId),
    supabase.from("patient_memberships").select("id, status, billing_status").eq("organization_id", profile.organizationId),
    supabase.from("payment_plans").select("id, status, total_amount_cents").eq("organization_id", profile.organizationId),
    supabase.from("payment_plan_installments").select("id, amount_cents, status, payment_plans!inner(organization_id)").eq("payment_plans.organization_id", profile.organizationId)
  ]);
  const activeAccounts = accounts?.filter((account) => account.status === "active").length ?? 0;
  const invitedAccounts = accounts?.filter((account) => account.status === "invited").length ?? 0;
  const activeMemberships = memberships?.filter((membership) => ["trial", "active"].includes(membership.status)).length ?? 0;
  const planTotalCents = paymentPlans?.reduce((sum, plan) => sum + plan.total_amount_cents, 0) ?? 0;
  const pastDueInstallments = installments?.filter((installment) => ["failed", "past_due"].includes(installment.status)).length ?? 0;
  const dueCents = installments?.filter((installment) => ["scheduled", "due", "failed", "past_due"].includes(installment.status)).reduce((sum, installment) => sum + installment.amount_cents, 0) ?? 0;
  const trace: AiTrace = {
    tools: ["getPortalRevenueSummary", "getPortalAdoption", "getMembershipSummary", "getPaymentPlanSummary"],
    locations: [],
    recordCounts: {
      patient_accounts: accounts?.length ?? 0,
      patient_memberships: memberships?.length ?? 0,
      payment_plans: paymentPlans?.length ?? 0,
      payment_plan_installments: installments?.length ?? 0
    }
  };

  return {
    facts: [
      `${activeAccounts} patient portal accounts are active and ${invitedAccounts} are pending activation.`,
      `${activeMemberships} memberships are active or trialing.`,
      `Payment plans represent ${formatMoney(planTotalCents)} in original scheduled value.`
    ],
    analysis: [
      `${pastDueInstallments} installments are failed or past due.`,
      `Open scheduled installment value is ${formatMoney(dueCents)}.`,
      "This summary uses aggregate portal, membership, and payment-plan data only."
    ],
    recommendations: [
      invitedAccounts > 0 ? "Follow up with invited patients who have not activated the portal." : "Portal activation is current for seeded accounts.",
      pastDueInstallments > 0 ? "Review past-due installments before changing treatment access." : "No past-due installment pressure is visible in this scope.",
      "AI does not access portal passwords, auth tokens, private documents, signatures, commissions, or royalties."
    ],
    trace
  };
}

export const getPortalAdoption = getPortalRevenueSummary;
export const getMembershipSummary = getPortalRevenueSummary;
export const getPaymentPlanSummary = getPortalRevenueSummary;
