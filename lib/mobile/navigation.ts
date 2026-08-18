import type { CurrentProfile } from "@/lib/auth/profile";
import { AI_ASSISTANT_DISPLAY_NAME } from "../config/branding.ts";

export type MobileNavItem = {
  label: string;
  href: string;
  permission?: string;
};

const navByRole: Record<string, MobileNavItem[]> = {
  owner: [
    { label: "Home", href: "/mobile" },
    { label: "Executive", href: "/executive" },
    { label: "Tasks", href: "/mobile/tasks" },
    { label: "Calls", href: "/calls" },
    { label: "More", href: "/settings" }
  ],
  administrator: [
    { label: "Home", href: "/mobile" },
    { label: "Executive", href: "/executive" },
    { label: "Tasks", href: "/mobile/tasks" },
    { label: "Calls", href: "/calls" },
    { label: "More", href: "/settings" }
  ],
  manager: [
    { label: "Home", href: "/mobile" },
    { label: "Schedule", href: "/mobile/schedule" },
    { label: "Tasks", href: "/mobile/tasks" },
    { label: "Calls", href: "/calls" },
    { label: "More", href: "/settings" }
  ],
  provider: [
    { label: "Today", href: "/mobile/provider" },
    { label: "Patients", href: "/mobile/contacts" },
    { label: "Clinical", href: "/clinical" },
    { label: "Tasks", href: "/mobile/tasks" },
    { label: "More", href: "/settings" }
  ],
  salesperson: [
    { label: "Leads", href: "/mobile" },
    { label: "Follow-Up", href: "/sales/follow-up" },
    { label: "Calls", href: "/calls" },
    { label: "Tasks", href: "/mobile/tasks" },
    { label: "More", href: "/settings" }
  ]
};

export function mobileNavForProfile(profile: Pick<CurrentProfile, "role">) {
  return navByRole[profile.role] ?? [
    { label: "Home", href: "/mobile" },
    { label: "Schedule", href: "/mobile/schedule" },
    { label: "Contacts", href: "/mobile/contacts" },
    { label: "Tasks", href: "/mobile/tasks" },
    { label: "More", href: "/settings" }
  ];
}

export function quickActionsForRole(role: string) {
  if (role === "provider") return ["Open Session", "Save Note Draft", "Record Inventory", "Upload Photo"];
  if (role === "salesperson") return ["Call Lead", "Text Lead", "Create Task", "Book Consult"];
  if (role === "manager" || role === "owner" || role === "administrator") return [AI_ASSISTANT_DISPLAY_NAME, "Review Alerts", "Approve PTO", "Open Close"];
  return ["Find Contact", "Book Appointment", "Create Task", "Open Calls"];
}
