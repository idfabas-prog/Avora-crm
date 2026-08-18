import Link from "next/link";
import { MobileRecordCard } from "@/components/mobile/MobileCards";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { allowedLocationIds, getSelectedLocationId } from "@/lib/crm/location";
import { formatDateTime, fromDbStatus } from "@/lib/crm/constants";
import { getMobileContacts } from "@/lib/mobile/reports";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const item = params[key];
  return Array.isArray(item) ? item[0] : item;
}

export default async function MobileContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const profile = await requireCurrentProfile();
  const supabase = await createClient();
  const selectedLocationId = await getSelectedLocationId(profile);
  const query = value(params, "q") ?? null;
  const contacts = await getMobileContacts(supabase, profile, allowedLocationIds(profile, selectedLocationId), query);

  return (
    <div className="mobile-page">
      <PageHeader description="Fast phone-friendly patient and lead search with safe tap actions." title="Mobile Contacts" />
      <form className="mobile-search">
        <input defaultValue={query ?? ""} inputMode="search" name="q" placeholder="Search name, phone, or email" type="search" />
        <button className="primary-button" type="submit">Search</button>
      </form>
      <section className="mobile-section">
        {contacts.map((contact) => (
          <MobileRecordCard
            actions={<div className="mobile-card-actions-row"><a href={`tel:${contact.phone ?? ""}`}>Call</a><Link href={`/conversations?contact_id=${contact.id}`}>Text</Link><Link href={`/calendar?contact_id=${contact.id}`}>Book</Link></div>}
            detail={`${contact.phone ?? "No phone"} - ${contact.locationName} - ${formatDateTime(contact.last_activity_at)}`}
            href={`/contacts/${contact.id}`}
            key={contact.id}
            status={fromDbStatus(contact.status)}
            title={`${contact.first_name} ${contact.last_name}`}
          />
        ))}
      </section>
    </div>
  );
}
