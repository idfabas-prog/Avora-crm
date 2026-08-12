import Link from "next/link";
import { AddContactForm } from "@/components/crm/ContactForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { contactStatuses, formatCurrency, formatDate, fromDbStatus, toDbStatus } from "@/lib/crm/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const item = searchParams[key];
  return Array.isArray(item) ? item[0] : item;
}

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const locationIds = allowedLocationIds(profile, selectedLocationId);
  const page = Math.max(1, Number(value(params, "page") ?? "1"));
  const pageSize = 12;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sort = value(params, "sort") ?? "created_at";
  const ascending = value(params, "dir") === "asc";

  let query = supabase
    .from("contacts")
    .select(
      `
        id,
        first_name,
        last_name,
        phone,
        email,
        lead_source,
        status,
        lifetime_value_cents,
        last_activity_at,
        created_at,
        location_id,
        assigned_to,
        locations(name),
        user_profiles(full_name)
      `,
      { count: "exact" }
    )
    .eq("organization_id", profile.organizationId);

  if (locationIds.length > 0) {
    query = query.in("location_id", locationIds);
  }

  const search = value(params, "q");
  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const status = value(params, "status");
  if (status) {
    query = query.eq("status", toDbStatus(status));
  }

  const leadSource = value(params, "lead_source");
  if (leadSource) {
    query = query.eq("lead_source", leadSource);
  }

  const assignedTo = value(params, "assigned_to");
  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }

  const { data: contacts, count, error } = await query
    .order(sort, { ascending })
    .range(from, to);

  const [{ data: users }, { data: leadSources }] = await Promise.all([
    supabase.from("user_profiles").select("id, full_name").eq("organization_id", profile.organizationId).order("full_name"),
    supabase.from("contacts").select("lead_source").eq("organization_id", profile.organizationId).not("lead_source", "is", null)
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const locationOptions = profile.locations.map((location) => ({ id: location.id, name: location.name }));
  const userOptions = (users ?? []).map((user) => ({ id: user.id, name: user.full_name }));
  const sourceOptions = Array.from(new Set((leadSources ?? []).map((item) => item.lead_source).filter(Boolean)));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="page-stack">
      <PageHeader
        action={
          <details className="drawer-details">
            <summary className="primary-button">Add Contact</summary>
            <div className="drawer-content">
              <h2>Add Contact</h2>
              <AddContactForm locations={locationOptions} users={userOptions} />
            </div>
          </details>
        }
        description="Live contacts from Supabase, scoped by authenticated user permissions and selected location."
        title="Contacts"
      />
      <section className="panel">
        <form className="query-toolbar">
          <input className="search-input" defaultValue={search ?? ""} name="q" placeholder="Search by name, phone, or email" />
          <select defaultValue={status ?? ""} name="status"><option value="">All statuses</option>{contactStatuses.map((item) => <option key={item}>{item}</option>)}</select>
          <select defaultValue={leadSource ?? ""} name="lead_source"><option value="">All sources</option>{sourceOptions.map((item) => <option key={item}>{item}</option>)}</select>
          <select defaultValue={assignedTo ?? ""} name="assigned_to"><option value="">All employees</option>{userOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select defaultValue={sort} name="sort"><option value="created_at">Created Date</option><option value="last_activity_at">Last Activity</option><option value="last_name">Name</option><option value="lifetime_value_cents">Lifetime Value</option></select>
          <select defaultValue={ascending ? "asc" : "desc"} name="dir"><option value="desc">Desc</option><option value="asc">Asc</option></select>
          <button type="submit">Apply</button>
        </form>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Full Name</th><th>Phone</th><th>Email</th><th>Location</th><th>Lead Source</th><th>Assigned To</th><th>Status</th><th>Lifetime Value</th><th>Last Activity</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((contact) => {
                const location = Array.isArray(contact.locations) ? contact.locations[0] : contact.locations;
                const assigned = Array.isArray(contact.user_profiles) ? contact.user_profiles[0] : contact.user_profiles;

                return (
                  <tr key={contact.id}>
                    <td><Link className="strong-link" href={`/contacts/${contact.id}`}>{contact.first_name} {contact.last_name}</Link></td>
                    <td>{contact.phone ?? "—"}</td>
                    <td>{contact.email ?? "—"}</td>
                    <td>{location?.name ?? "Unassigned"}</td>
                    <td>{contact.lead_source ?? "—"}</td>
                    <td>{assigned?.full_name ?? "Unassigned"}</td>
                    <td><StatusBadge status={fromDbStatus(contact.status)} /></td>
                    <td>{formatCurrency(contact.lifetime_value_cents)}</td>
                    <td>{formatDate(contact.last_activity_at)}</td>
                    <td>{formatDate(contact.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(contacts ?? []).length === 0 ? <p className="quiet-text">No contacts match the current filters.</p> : null}
        <div className="pagination">
          <Link aria-disabled={page <= 1} href={`/contacts?page=${Math.max(1, page - 1)}`}>Previous</Link>
          <span>Page {page} of {totalPages}</span>
          <Link aria-disabled={page >= totalPages} href={`/contacts?page=${Math.min(totalPages, page + 1)}`}>Next</Link>
        </div>
      </section>
    </div>
  );
}
