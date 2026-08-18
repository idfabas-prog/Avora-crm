import { PortalProfileForm } from "@/components/portal/PortalForms";
import { requireCurrentPatient } from "@/lib/portal/patient";

export default async function PortalProfilePage() {
  const patient = await requireCurrentPatient();

  return (
    <div className="portal-stack">
      <section className="portal-page-title"><p className="eyebrow">Profile</p><h1>Your information</h1><p>Only safe contact and notification preferences are editable here.</p></section>
      <section className="portal-panel">
        <PortalProfileForm
          billing={patient.billingNotificationsEnabled}
          email={patient.emailRemindersEnabled}
          firstName={patient.firstName}
          lastName={patient.lastName}
          phone={patient.phone}
          sms={patient.smsRemindersEnabled}
        />
      </section>
    </div>
  );
}
