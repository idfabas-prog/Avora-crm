import Link from "next/link";
import { saveExecutiveTarget } from "@/app/executive-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireCurrentProfile } from "@/lib/auth/profile";
import { assertExecutivePermission, canManageExecutiveSettings } from "@/lib/executive/permissions";
import { formatMoney } from "@/lib/financial/money";
import { createClient } from "@/lib/supabase/server";

const metricOptions = [
  ["net_collected_revenue_cents", "Net Collected Revenue"],
  ["contribution_margin_percent", "Contribution Margin"],
  ["close_rate_percent", "Close Rate"],
  ["marketing_roas", "Marketing ROAS"],
  ["labor_cost_percent", "Labor Cost %"],
  ["no_show_rate_percent", "No-Show Rate"],
  ["nps", "NPS"]
];

type TargetRow = {
  id: string;
  location_id: string | null;
  metric_key: string;
  period_type: string;
  target_value: number | string;
  warning_threshold: number | string | null;
  critical_threshold: number | string | null;
  effective_start: string;
  effective_end: string | null;
  active: boolean;
  locations: { name: string | null } | Array<{ name: string | null }> | null;
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function displayTarget(metricKey: string, value: number | string) {
  const numeric = Number(value);
  if (metricKey.endsWith("_cents")) return formatMoney(numeric);
  if (metricKey.includes("percent")) return `${(numeric * 100).toFixed(1)}%`;
  if (metricKey === "marketing_roas") return `${numeric.toFixed(1)}x`;
  return String(numeric);
}

export default async function ExecutiveTargetsPage() {
  const profile = await requireCurrentProfile();
  assertExecutivePermission(profile, "executive.targets.read");
  const canManage = canManageExecutiveSettings(profile);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("executive_targets")
    .select("id, location_id, metric_key, period_type, target_value, warning_threshold, critical_threshold, effective_start, effective_end, active, locations(name)")
    .eq("organization_id", profile.organizationId)
    .order("effective_start", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const targets = (data ?? []) as TargetRow[];

  return (
    <div className="page-stack">
      <PageHeader
        action={<Link className="secondary-button" href="/executive">Command Center</Link>}
        description="Targets preserve history through effective dates. Existing targets are not overwritten when a new period begins."
        title="Executive Targets"
      />
      {canManage ? (
        <section className="panel">
          <div className="panel-header"><h2>Create Target</h2><span>Owner/admin</span></div>
          <form action={saveExecutiveTarget} className="form-grid">
            <label>
              Scope
              <select name="location_id">
                <option value="company">Company</option>
                {profile.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <label>
              Metric
              <select name="metric_key">
                {metricOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Period
              <select name="period_type" defaultValue="monthly">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
            <label>
              Target Value
              <input name="target_value" placeholder="Example: 76000000 or 0.58" required type="number" step="0.0001" />
            </label>
            <label>
              Warning Threshold
              <input name="warning_threshold" placeholder="Optional" type="number" step="0.0001" />
            </label>
            <label>
              Critical Threshold
              <input name="critical_threshold" placeholder="Optional" type="number" step="0.0001" />
            </label>
            <label>
              Effective Start
              <input name="effective_start" required type="date" />
            </label>
            <label>
              Effective End
              <input name="effective_end" type="date" />
            </label>
            <button className="primary-button" type="submit">Save Target</button>
          </form>
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-header"><h2>Configured Targets</h2><span>{targets.length}</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Metric</th>
                <th>Period</th>
                <th>Target</th>
                <th>Warning</th>
                <th>Critical</th>
                <th>Effective</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => {
                const location = first(target.locations);
                return (
                  <tr key={target.id}>
                    <td>{location?.name ?? "Company"}</td>
                    <td>{target.metric_key}</td>
                    <td>{target.period_type}</td>
                    <td>{displayTarget(target.metric_key, target.target_value)}</td>
                    <td>{target.warning_threshold === null ? "None" : displayTarget(target.metric_key, target.warning_threshold)}</td>
                    <td>{target.critical_threshold === null ? "None" : displayTarget(target.metric_key, target.critical_threshold)}</td>
                    <td>{target.effective_start}{target.effective_end ? ` to ${target.effective_end}` : ""}</td>
                    <td><StatusBadge status={target.active ? "Active" : "Inactive"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
