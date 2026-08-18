import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { csvMoney, rowsToCsv } from "@/lib/financial/csv";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { getAccountingExportSummary, getCOGSExportSummary, getManagementFeeAccountingSummary, getReconciliationSummary, getRoyaltyAccountingSummary } from "@/lib/accounting/reports";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { createClient } from "@/lib/supabase/server";

function download(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}

export async function GET(request: Request) {
  const profile = await requireCurrentProfile();
  if (!hasAccountingPermission(profile, "accounting.exports.read")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const type = new URL(request.url).searchParams.get("type") ?? "journal_preview";
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);

  if (type === "reconciliation") {
    const report = await getReconciliationSummary(supabase, profile, locationIds);
    const rows = report.rows.map((row) => [row.processor, row.processor_transaction_id, row.locationName, row.status, csvMoney(row.gross_cents), csvMoney(row.fee_cents), csvMoney(row.net_cents), row.settlement_date]);
    return download(rowsToCsv(["processor", "transaction", "location", "status", "gross", "fee", "net", "settlement_date"], rows), "avora-accounting-reconciliation.csv");
  }

  if (type === "royalties") {
    const summary = await getRoyaltyAccountingSummary(supabase, profile);
    return download(rowsToCsv(["metric", "value"], [["count", summary.count], ["amount", csvMoney(summary.amountCents)], ["open_count", summary.openCount]]), "avora-accounting-royalties.csv");
  }

  if (type === "management_fees") {
    const summary = await getManagementFeeAccountingSummary(supabase, profile);
    return download(rowsToCsv(["metric", "value"], [["count", summary.count], ["amount", csvMoney(summary.amountCents)], ["open_count", summary.openCount]]), "avora-accounting-management-fees.csv");
  }

  if (type === "cogs") {
    const summary = await getCOGSExportSummary(supabase, profile, locationIds);
    return download(rowsToCsv(["metric", "value"], [["usage_rows", summary.count], ["amount", csvMoney(summary.amountCents)]]), "avora-accounting-cogs.csv");
  }

  const report = await getAccountingExportSummary(supabase, profile);
  const rows = report.items.map((item) => [item.source_type, item.source_id ?? "", item.external_account_id ?? "unmapped", item.debit_credit, csvMoney(item.amount_cents), item.export_status, item.description]);
  return download(rowsToCsv(["source_type", "source_id", "external_account_id", "debit_credit", "amount", "status", "description"], rows), `avora-accounting-${type}.csv`);
}
