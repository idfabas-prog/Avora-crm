"use client";

import Link from "next/link";
import { AI_ASSISTANT_DISPLAY_NAME } from "@/lib/config/branding";
import { quickActionsForRole } from "@/lib/mobile/navigation";

const actionLinks: Record<string, string> = {
  [AI_ASSISTANT_DISPLAY_NAME]: "/ai",
  "Review Alerts": "/executive/alerts",
  "Approve PTO": "/staff/time-off",
  "Open Close": "/accounting/close",
  "Open Session": "/clinical",
  "Save Note Draft": "/mobile/provider",
  "Record Inventory": "/inventory",
  "Upload Photo": "/clinical",
  "Call Lead": "/calls",
  "Text Lead": "/conversations",
  "Create Task": "/mobile/tasks",
  "Book Consult": "/calendar",
  "Find Contact": "/mobile/contacts",
  "Book Appointment": "/calendar",
  "Open Calls": "/calls"
};

export function QuickActionSheet({ role }: { role: string }) {
  return (
    <details className="mobile-action-sheet">
      <summary className="primary-button">Quick Actions</summary>
      <div>
        {quickActionsForRole(role).map((action) => (
          <Link className="secondary-button" href={actionLinks[action] ?? "/mobile"} key={action}>{action}</Link>
        ))}
      </div>
    </details>
  );
}
