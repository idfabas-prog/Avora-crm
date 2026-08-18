export type AccountingMode = "disabled" | "development" | "enabled";

export type AccountingConfig = {
  mode: AccountingMode;
  quickBooksConfigured: boolean;
  xeroConfigured: boolean;
};

export function getAccountingConfig(): AccountingConfig {
  const mode = (process.env.ACCOUNTING_MODE ?? "development").toLowerCase();

  return {
    mode: mode === "enabled" || mode === "disabled" ? mode : "development",
    quickBooksConfigured: Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET && process.env.QUICKBOOKS_REDIRECT_URI),
    xeroConfigured: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_REDIRECT_URI)
  };
}
