import Link from "next/link";
import { acknowledgeInsightAction, refreshOperatingBriefAction, updateRecommendationStatusAction } from "@/app/ai-operating-actions";
import type { OperatingRow } from "@/lib/ai/operating-system";

function confidenceText(value: OperatingRow["confidence"]) {
  if (typeof value === "number") return `${Math.round(value * 100)}% confidence`;
  return value ? `${value} confidence` : "confidence not set";
}

function statusText(row: OperatingRow) {
  return row.priority ?? row.severity ?? row.status ?? (row.score == null ? "ready" : `${row.score}/100`);
}

export function AiOperatingList({
  rows,
  empty,
  actionKind = "none"
}: {
  rows: OperatingRow[];
  empty: string;
  actionKind?: "none" | "insight" | "recommendation";
}) {
  return (
    <div className="record-list">
      {rows.map((row) => (
        <article key={row.id}>
          <strong>{row.title}</strong>
          <p>{row.summary}</p>
          <span>{statusText(row)} · {confidenceText(row.confidence)}</span>
          {row.supporting_route ? <Link href={row.supporting_route}>Open view</Link> : null}
          {actionKind === "insight" ? (
            <form action={acknowledgeInsightAction}>
              <input name="insight_id" type="hidden" value={row.id} />
              <button className="secondary-button" type="submit">Acknowledge</button>
            </form>
          ) : null}
          {actionKind === "recommendation" ? (
            <form action={updateRecommendationStatusAction}>
              <input name="recommendation_id" type="hidden" value={row.id} />
              <input name="status" type="hidden" value="deferred" />
              <button className="secondary-button" type="submit">Defer</button>
            </form>
          ) : null}
        </article>
      ))}
      {!rows.length ? <p className="quiet-text">{empty}</p> : null}
    </div>
  );
}

export function BriefRefreshButton() {
  return (
    <form action={refreshOperatingBriefAction}>
      <button className="primary-button" type="submit">Refresh Brief</button>
    </form>
  );
}

export function AiSafetyPanel() {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Safety Guardrails</h2><span>Advisory-only</span></div>
      <dl className="settings-list">
        <div><dt>Business actions</dt><dd>No autonomous messages, calls, charges, refunds, inventory changes, payroll changes, ad-budget changes, or workflow publishing.</dd></div>
        <div><dt>Clinical safety</dt><dd>No diagnosis, treatment advice, or clinical decision automation.</dd></div>
        <div><dt>Prediction inputs</dt><dd>Protected attributes and clinical details are explicitly excluded from scoring.</dd></div>
      </dl>
    </section>
  );
}
