import { TaskStatusForm } from "@/components/crm/TaskForms";
import { MobileRecordCard } from "@/components/mobile/MobileCards";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;
function first<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MobileTasksPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  let query = supabase
    .from("tasks")
    .select("id, title, status, due_at, contacts(first_name, last_name), locations(name)")
    .eq("organization_id", profile.organizationId)
    .or(`assigned_to.eq.${profile.id},assigned_to.is.null`)
    .in("status", ["open", "in_progress"])
    .order("due_at", { ascending: true })
    .limit(40);
  if (locationIds.length > 0) query = query.in("location_id", locationIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="mobile-page">
      <PageHeader description="Today, overdue, and assigned work with thumb-sized status controls." title="Mobile Tasks" />
      <section className="mobile-section">
        {(data ?? []).map((task) => {
          const contact = first(task.contacts);
          const location = first(task.locations);
          return (
            <MobileRecordCard
              actions={<TaskStatusForm currentStatus={fromDbStatus(task.status)} taskId={task.id} />}
              detail={`${contact ? `${contact.first_name} ${contact.last_name}` : "No contact"} - ${location?.name ?? "No location"} - Due ${formatDateTime(task.due_at)}`}
              key={task.id}
              status={fromDbStatus(task.status)}
              title={task.title}
            />
          );
        })}
      </section>
    </div>
  );
}
