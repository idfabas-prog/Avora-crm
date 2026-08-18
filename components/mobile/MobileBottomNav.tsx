"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentProfile } from "@/lib/auth/profile";
import { mobileNavForProfile } from "@/lib/mobile/navigation";

export function MobileBottomNav({ profile }: { profile: CurrentProfile }) {
  const pathname = usePathname();
  const nav = mobileNavForProfile(profile);

  return (
    <nav aria-label="Mobile navigation" className="mobile-bottom-nav">
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={item.href} key={item.href}>
            <span aria-hidden="true">{item.label.slice(0, 1)}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
