import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function MobileMetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="mobile-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function MobileRecordCard({
  title,
  detail,
  href,
  status,
  actions
}: {
  title: string;
  detail: string;
  href?: string;
  status?: string;
  actions?: React.ReactNode;
}) {
  const body = (
    <>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {status ? <StatusBadge status={status} /> : null}
    </>
  );

  return (
    <article className="mobile-record-card">
      {href ? <Link href={href}>{body}</Link> : <div className="mobile-card-body">{body}</div>}
      {actions ? <div className="mobile-card-actions">{actions}</div> : null}
    </article>
  );
}
