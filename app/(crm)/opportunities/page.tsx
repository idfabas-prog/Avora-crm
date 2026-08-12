import { AddOpportunityForm, StageMoveForm } from "@/components/crm/OpportunityForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatCurrency, formatDateTime, fromDbStatus } from "@/lib/crm/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const item = searchParams[key];
  return Array.isArray(item) ? item[0] : item;
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const pipelineFilter = value(params, "pipeline_id");
  const assignedFilter = value(params, "assigned_to");

  const [{ data: pipelines }, { data: users }, { data: contacts }] = await Promise.all([
    supabase.from("pipelines").select("id, name").eq("organization_id", profile.organizationId).order("name"),
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", profile.organizationId).order("last_name")
  ]);

  const defaultPipeline = pipelineFilter ?? pipelines?.find((pipeline) => pipeline.name === "Hair Restoration")?.id ?? pipelines?.[0]?.id;

  const { data: stages, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id, name, pipeline_id, position")
    .eq("organization_id", profile.organizationId)
    .eq("pipeline_id", defaultPipeline)
    .order("position");

  if (stageError) {
    throw new Error(stageError.message);
  }

  let opportunityQuery = supabase
    .from("opportunities")
    .select(`
      id,
      name,
      value_cents,
      status,
      last_activity_at,
      location_id,
      stage_id,
      assigned_to,
      contacts(first_name, last_name, lead_source),
      locations(name),
      user_profiles(full_name)
    `)
    .eq("organization_id", profile.organizationId)
    .eq("pipeline_id", defaultPipeline);

  if (locationIds.length > 0) {
    opportunityQuery = opportunityQuery.in("location_id", locationIds);
  }

  if (assignedFilter) {
    opportunityQuery = opportunityQuery.eq("assigned_to", assignedFilter);
  }

  const { data: opportunities, error } = await opportunityQuery.order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const locationOptions = profile.locations.map((location) => ({ id: location.id, name: location.name }));
  const userOptions = (users ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const pipelineOptions = (pipelines ?? []).map((pipeline) => ({ id: pipeline.id, name: pipeline.name }));
  const stageOptions = (stages ?? []).map((stage) => ({ id: stage.id, name: stage.name, pipeline_id: stage.pipeline_id }));
  const contactOptions = (contacts ?? []).map((contact) => ({ id: contact.id, name: `${contact.first_name} ${contact.last_name}` }));

  return (
    <div className="page-stack">
      <PageHeader
        action={
          <details className="drawer-details">
            <summary className="primary-button">Add Opportunity</summary>
            <div className="drawer-content">
              <h2>Add Opportunity</h2>
              <AddOpportunityForm contacts={contactOptions} locations={locationOptions} pipelines={pipelineOptions} stages={stageOptions} users={userOptions} />
            </div>
          </details>
        }
        description="Live Hair Restoration pipeline with user-scoped Supabase data and stage movement."
        title="Opportunities"
      />
      <form className="query-toolbar">
        <select defaultValue={defaultPipeline ?? ""} name="pipeline_id">{pipelineOptions.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select>
        <select defaultValue={assignedFilter ?? ""} name="assigned_to"><option value="">All salespeople</option>{userOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <button type="submit">Apply</button>
      </form>
      <section className="kanban-board" aria-label="Pipeline">
        {(stages ?? []).map((stage) => (
          <div className="kanban-column" key={stage.id}>
            <div className="kanban-title">
              <h2>{stage.name}</h2>
              <span>{(opportunities ?? []).filter((item) => item.stage_id === stage.id).length}</span>
            </div>
            {(opportunities ?? [])
              .filter((item) => item.stage_id === stage.id)
              .map((item) => {
                const contact = Array.isArray(item.contacts) ? item.contacts[0] : item.contacts;
                const location = Array.isArray(item.locations) ? item.locations[0] : item.locations;
                const assigned = Array.isArray(item.user_profiles) ? item.user_profiles[0] : item.user_profiles;

                return (
                  <article className="opportunity-card" key={item.id}>
                    <strong>{contact ? `${contact.first_name} ${contact.last_name}` : item.name}</strong>
                    <p>{formatCurrency(item.value_cents)}</p>
                    <StatusBadge status={fromDbStatus(item.status)} />
                    <dl>
                      <div><dt>Location</dt><dd>{location?.name ?? "Unassigned"}</dd></div>
                      <div><dt>Salesperson</dt><dd>{assigned?.full_name ?? "Unassigned"}</dd></div>
                      <div><dt>Lead Source</dt><dd>{contact?.lead_source ?? "—"}</dd></div>
                      <div><dt>Last Activity</dt><dd>{formatDateTime(item.last_activity_at)}</dd></div>
                    </dl>
                    <StageMoveForm currentStageId={item.stage_id} opportunityId={item.id} stages={stageOptions} />
                  </article>
                );
              })}
          </div>
        ))}
      </section>
    </div>
  );
}
