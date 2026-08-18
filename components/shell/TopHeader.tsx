import Link from "next/link";
import { SearchInput } from "@/components/ui/SearchInput";
import type { CurrentProfile } from "@/lib/auth/profile";
import { APP_DISPLAY_NAME } from "@/lib/config/branding";

export function TopHeader({ profile }: { profile: CurrentProfile }) {
  return (
    <header className="top-header">
      <div>
        <p>Good morning</p>
        <strong>
          {APP_DISPLAY_NAME} workspace - {profile.title ?? profile.email}
        </strong>
      </div>
      <div className="top-header-actions">
        <SearchInput placeholder="Search contacts, opportunities, payments" />
        <Link aria-label="Notifications" className="icon-button" href="/notifications">
          <span aria-hidden="true">*</span>
        </Link>
      </div>
    </header>
  );
}
