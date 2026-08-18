import Link from "next/link";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export default async function PortalCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const safeToken = token.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12);

  return (
    <main className="portal-login-page">
      <section className="portal-login-panel">
        <div>
          <p className="eyebrow">{APP_DISPLAY_NAME} Mobile</p>
          <h1>Check-In</h1>
          <p>This development-safe check-in foundation validates future secure appointment tokens without exposing patient identifiers in the URL.</p>
          <p className="quiet-text">Token preview: {safeToken || "pending"}</p>
          <div className="portal-actions">
            <Link className="primary-button" href="/portal/appointments">Open Appointments</Link>
            <Link className="secondary-button" href="/portal">Portal Home</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
