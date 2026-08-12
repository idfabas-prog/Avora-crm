"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentProfile } from "@/lib/auth/profile";
import { LocationSwitcher } from "./LocationSwitcher";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Ask Avora", href: "/ai" },
  { label: "Contacts", href: "/contacts" },
  { label: "Conversations", href: "/conversations" },
  { label: "Opportunities", href: "/opportunities" },
  { label: "Calendar", href: "/calendar" },
  { label: "Sales", href: "/sales" },
  { label: "Payments", href: "/payments" },
  { label: "Automations", href: "/automations" },
  { label: "Marketing", href: "/marketing" },
  { label: "Reports", href: "/reports" },
  { label: "Staff", href: "/staff" },
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
        <div className="brand-mark">A</div>
        <div>
          <strong>Avora</strong>
          <span>Growth CRM</span>
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
