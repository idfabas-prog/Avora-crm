"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentProfile } from "@/lib/auth/profile";
import { AI_ASSISTANT_DISPLAY_NAME, APP_DISPLAY_NAME } from "@/lib/config/branding";
import { LocationSwitcher } from "./LocationSwitcher";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Mobile", href: "/mobile" },
  { label: "Executive", href: "/executive" },
  { label: "Expansion", href: "/expansion" },
  { label: "AI OS", href: "/ai/operating-system" },
  { label: AI_ASSISTANT_DISPLAY_NAME, href: "/ai" },
  { label: "Contacts", href: "/contacts" },
  { label: "Conversations", href: "/conversations" },
  { label: "Calls", href: "/calls" },
  { label: "Opportunities", href: "/opportunities" },
  { label: "Calendar", href: "/calendar" },
  { label: "Clinical", href: "/clinical" },
  { label: "Inventory", href: "/inventory" },
  { label: "Accounting", href: "/accounting" },
  { label: "Integrations", href: "/integrations/gohighlevel" },
  { label: "Sales", href: "/sales" },
  { label: "Payments", href: "/payments" },
  { label: "Automations", href: "/automations" },
  { label: "Marketing", href: "/marketing" },
  { label: "Reputation", href: "/reputation" },
  { label: "Reports", href: "/reports" },
  { label: "Staff", href: "/staff" },
  { label: "Time Clock", href: "/time-clock" },
  { label: "Settings", href: "/settings" }
];

export function Sidebar({
  profile,
  selectedLocationId
}: {
  profile: CurrentProfile;
  selectedLocationId: string | null;
}) {
  const pathname = usePathname();
  const initials = profile.fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">D</div>
        <div>
          <strong>{APP_DISPLAY_NAME}</strong>
          <span>Development CRM</span>
        </div>
      </div>
      <LocationSwitcher
        locations={profile.locations}
        organization={profile.organization}
        selectedLocationId={selectedLocationId}
      />
      <nav aria-label="Primary navigation" className="sidebar-nav">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? "active" : undefined}
              href={item.href}
              key={item.href}
            >
              <span aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="profile-card">
        <div className="avatar">{initials}</div>
        <div>
          <strong>{profile.fullName}</strong>
          <span>{profile.role}</span>
        </div>
      </div>
    </aside>
  );
}
