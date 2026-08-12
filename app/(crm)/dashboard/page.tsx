import { AddTaskForm, TaskStatusForm } from "@/components/crm/TaskForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";

async function countQuery(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query;
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.count ?? 0;
}

export default async function DashboardPage() {
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nextWeek = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  function withLocation<T extends { in: (column: string, values: string[]) => T }>(query: T) {
    return locationIds.length > 0 ? query.in("location_id", locationIds) : query;
  }

  const [
    newLeads,
    opportunities,
    consultsBooked,
    upcomingAppointments,
    completedAppointments,
    noShows,
    openTasks,
    usersResult,
    contactsResult,
    opportunitiesResult,
    tasksResult
  ] = await Promise.all([
    countQuery(withLocation(supabase.from("contacts").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "new_lead").gte("created_at", monthStart))),
    countQuery(withLocation(supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId))),
    countQuery(withLocation(supabase.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("start_at", monthStart).in("status", ["scheduled", "confirmed"]))),
    countQuery(withLocation(supabase.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).gte("start_at", now.toISOString()).lt("start_at", nextWeek))),
    countQuery(withLocation(supabase.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "completed").gte("start_at", monthStart))),
    countQuery(withLocation(supabase.from("appointments").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).eq("status", "no_show").gte("start_at", monthStart))),
    countQuery(withLocation(supabase.from("tasks").select("*", { count: "exact", head: true }).eq("organization_id", profile.organizationId).in("status", ["open", "in_progress"]))),
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", profile.organizationId).order("last_name"),
    supabase.from("opportunities").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    withLocation(supabase.from("tasks").select("id, title, status, due_at, user_profiles(full_name)").eq("organization_id", profile.organizationId).in("status", ["open", "in_progress"]).order("due_at", { ascending: true }).limit(8))
  ]);

  const liveMetrics = [
    { label: "New Leads", value: String(newLeads), detail: "Live this month" },
    { label: "Opportunities", value: String(opportunities), detail: "Live open and closed records" },
    { label: "Consults Booked", value: String(consultsBooked), detail: "Live scheduled/confirmed consults" },
    { label: "Upcoming Appointments", value: String(upcomingAppointments), detail: "Live next 7 days" },
    { label: "Completed Appointments", value: String(completedAppointments), detail: "Live this month" },
    { label: "No Shows", value: String(noShows), detail: "Live this month" },
    { label: "Open Tasks", value: String(openTasks), detail: "Live open/in-progress" },
    { label: "Revenue", value: "Demo", detail: "Placeholder until sales/payments phase" }
  ];

  const userOptions = (usersResult.data ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const contactOptions = (contactsResult.data ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }));
  const opportunityOptions = (opportunitiesResult.data ?? []).map((opportunity) => ({ id: opportunity.id, name: opportunity.name }));
  const locationOptions = profile.locations.map((location) => ({ id: location.id, name: location.name }));

  return (
    <div className="page-stack">
      <PageHeader
        description="Live operational metrics from Supabase. Revenue and sales metrics remain labeled placeholders until Phase 2 has sales/payment tables."
        title="Dashboard"
      />
      <section className="metric-grid">
        {liveMetrics.map((metric) => <StatCard key={metric.label} {...metric} />)}
      </section>
      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header"><h2>Tasks</h2><span>Live action queue</span></div>
          <AddTaskForm contacts={contactOptions} locations={locationOptions} opportunities={opportunityOptions} users={userOptions} />
          <div className="record-list">
            {(tasksResult.data ?? []).map((task) => {
              const owner = Array.isArray(task.user_profiles) ? task.user_profiles[0] : task.user_profiles;
              return (
                <article key={task.id}>
                  <strong>{task.title}</strong>
                  <p>{owner?.full_name ?? "Unassigned"} · Due {formatDateTime(task.due_at)}</p>
                  <StatusBadge status={fromDbStatus(task.status)} />
                  <TaskStatusForm currentStatus={fromDbStatus(task.status)} taskId={task.id} />
                </article>
              );
            })}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h2>Development Placeholders</h2><span>Not production metrics</span></div>
          <div className="placeholder-metrics">
            <StatCard detail="Waiting for sales/payments data model" label="Sales" value="Demo" />
            <StatCard detail="Waiting for sales/payments data model" label="Close Rate" value="Demo" />
            <StatCard detail="Waiting for sales/payments data model" label="Average Ticket" value="Demo" />
          </div>
        </div>
      </section>
    </div>
  );
}
