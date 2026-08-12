export function liveStripeEnabled() {
  return process.env.PAYMENTS_MODE === "production" && process.env.PAYMENTS_ALLOW_LIVE_CHARGES === "true";
}

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export async function createPaymentIntentPlaceholder() {
  if (!liveStripeEnabled()) {
    return {
      mode: "development",
      simulated: true,
      providerPaymentId: `sim_pi_${crypto.randomUUID()}`
    };
  }

  throw new Error("Live Stripe PaymentIntent creation is intentionally not enabled in Phase 4.");
}

export function verifyStripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}
