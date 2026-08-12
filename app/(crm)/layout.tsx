import { Sidebar } from "@/components/shell/Sidebar";
import { TopHeader } from "@/components/shell/TopHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { getSelectedLocationId } from "@/lib/crm/location";

export default async function CrmLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await requireCurrentProfile();
  const selectedLocationId = await getSelectedLocationId(profile);

  return (
    <div className="app-shell">
      <Sidebar profile={profile} selectedLocationId={selectedLocationId} />
      <div className="main-shell">
        <TopHeader profile={profile} />
        <main className="content-shell">{children}</main>
      </div>
    </div>
  );
}
