import { NextResponse } from "next/server";
import { requireCurrentPatient } from "@/lib/portal/patient";
import { liveGateEnabled } from "@/lib/security/feature-gates";

export async function POST() {
  const patient = await requireCurrentPatient();
  const liveBillingConfigured = process.env.PAYMENTS_MODE === "production" && liveGateEnabled("payments") && Boolean(process.env.STRIPE_SECRET_KEY);

  if (!liveBillingConfigured) {
    return NextResponse.json({
      mode: "development",
      simulated: true,
      message: "Stripe customer portal is scaffolded. No live customer portal session is created in development mode.",
      contactId: patient.contactId
    });
  }

  return NextResponse.json(
    { error: "Live Stripe customer portal creation must be explicitly implemented with production billing controls." },
    { status: 409 }
  );
}
