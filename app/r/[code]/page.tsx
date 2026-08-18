import Link from "next/link";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export default async function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const safeCode = code.replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-row"><div className="brand-mark">D</div><strong>{APP_DISPLAY_NAME}</strong></div>
        <h1>Referral Code {safeCode}</h1>
        <p className="quiet-text">This demo referral link captures the referral code foundation without exposing patient identifiers. Staff can attach the code when creating a fictional lead.</p>
        <Link className="primary-button" href="/login">Continue to {APP_DISPLAY_NAME}</Link>
      </section>
    </main>
  );
}
