import Link from "next/link";
import { getCurrentPatient } from "@/lib/portal/patient";

const navItems = [
  ["/portal", "Home"],
  ["/portal/appointments", "Appointments"],
  ["/portal/payments", "Payments"],
  ["/portal/packages", "Packages"],
  ["/portal/memberships", "Memberships"],
  ["/portal/documents", "Documents"],
  ["/portal/consents", "Consents"],
  ["/portal/profile", "Profile"]
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const patient = await getCurrentPatient();

  if (!patient) {
    return <>{children}</>;
  }

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <Link className="portal-brand" href="/portal">
          <span>A</span>
          <div><strong>{patient.settings.brandName}</strong><small>Patient Portal</small></div>
        </Link>
        <nav>
          {navItems.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </header>
      <main className="portal-content">{children}</main>
    </div>
  );
}
