import { SearchInput } from "@/components/ui/SearchInput";
import type { CurrentProfile } from "@/lib/auth/profile";

export function TopHeader({ profile }: { profile: CurrentProfile }) {
  return (
    <header className="top-header">
      <div>
        <p>Good morning</p>
        <strong>
          {profile.organization} workspace · {profile.title ?? profile.email}
        </strong>
      </div>
      <div className="top-header-actions">
        <SearchInput placeholder="Search contacts, opportunities, payments" />
        <button aria-label="Notifications" className="icon-button" type="button">
          <span aria-hidden="true">•</span>
        </button>
      </div>
    </header>
  );
}
