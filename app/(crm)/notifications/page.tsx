import Link from "next/link";
import { ActionForm } from "@/components/crm/ActionForm";
import { dismissMobileNotification, markMobileNotificationRead } from "@/app/mobile-actions";
import { MobileRecordCard } from "@/components/mobile/MobileCards";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { fromDbStatus, formatDateTime } from "@/lib/crm/constants";
import { parseSafeRoute } from "@/lib/mobile/deep-links";
import { getNotificationCenter } from "@/lib/mobile/reports";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const notifications = await getNotificationCenter(supabase, profile);

  return (
    <div className="mobile-page">
      <PageHeader description="Safe notification center with deep links and no sensitive lock-screen payloads." title="Notifications" />
      <section className="mobile-section">
        {notifications.map((notification) => (
          <MobileRecordCard
            actions={<div className="mobile-card-actions-row"><Link href={parseSafeRoute(notification.deep_link)}>Open</Link><ActionForm action={markMobileNotificationRead} className="inline-form" submitLabel="Read" successMessage="Marked read"><input name="notification_id" type="hidden" value={notification.id} /></ActionForm><ActionForm action={dismissMobileNotification} className="inline-form" submitLabel="Dismiss" successMessage="Dismissed"><input name="notification_id" type="hidden" value={notification.id} /></ActionForm></div>}
            detail={`${notification.body_safe} - ${formatDateTime(notification.created_at)}`}
            key={notification.id}
            status={fromDbStatus(notification.status)}
            title={notification.title}
          />
        ))}
      </section>
    </div>
  );
}
