export type TerminalPlaceholder = {
  terminalLocationId: string | null;
  readerId: string | null;
  active: boolean;
};

export async function createTerminalConnectionTokenPlaceholder() {
  if (process.env.PAYMENTS_MODE !== "production") {
    return {
      simulated: true,
      secret: "simulated_terminal_connection_token"
    };
  }

  throw new Error("Stripe Terminal live connection tokens are not enabled in Phase 4.");
}
