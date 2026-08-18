import { getAccountingConfig } from "@/lib/accounting/config";
import { createDevelopmentAccountingProvider } from "./development-provider";
import { createQuickBooksProvider } from "./quickbooks";
import { createXeroProvider } from "./xero";
import type { AccountingProviderName } from "./types";

export function getAccountingProvider(provider: AccountingProviderName = "csv_export") {
  const config = getAccountingConfig();
  if (config.mode !== "enabled") return createDevelopmentAccountingProvider();
  if (provider === "quickbooks_online") return createQuickBooksProvider();
  if (provider === "xero") return createXeroProvider();
  return createDevelopmentAccountingProvider();
}
