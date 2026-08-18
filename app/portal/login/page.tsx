import { redirect } from "next/navigation";
import { PortalLoginForm } from "@/components/auth/PortalLoginForm";
import { getCurrentPatient } from "@/lib/portal/patient";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export default async function PortalLoginPage() {
  const patient = await getCurrentPatient();

  if (patient) {
    redirect("/portal");
  }

  return (
    <main className="portal-login-page">
      <section className="portal-login-panel">
        <div>
          <p className="eyebrow">{APP_DISPLAY_NAME} Patient Portal</p>
          <h1>Welcome to your care home</h1>
          <p>Use your fictional development portal account to view appointments, balances, packages, consents, and memberships.</p>
        </div>
        <PortalLoginForm />
      </section>
    </main>
  );
}
