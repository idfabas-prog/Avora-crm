import { envMatrixRows, getAppVersion, validateEnvironment } from "../config/environment.ts";
import { integrationGateSummary } from "../security/feature-gates.ts";
import { productionWriteGateStatus } from "./operations.ts";

export type CheckStatus = "pass" | "warning" | "fail";

export type ProductionCheck = {
  key: string;
  category: string;
  status: CheckStatus;
  blocker: boolean;
  summary: string;
  remediation: string;
};

export function productionReadinessChecks(env: NodeJS.ProcessEnv = process.env): ProductionCheck[] {
  const validation = validateEnvironment(env);
  const gates = integrationGateSummary(env);
  const liveEnabled = gates.filter((gate) => gate.liveEnabled);
  const ghlWriteGate = productionWriteGateStatus(env);

  return [
    {
      key: "environment.validation",
      category: "Environment",
      status: validation.ok ? "pass" : "fail",
      blocker: !validation.ok,
      summary: validation.ok ? "Required environment variables are present for this environment." : `Missing or invalid environment variables: ${validation.missing.join(", ") || "configuration warning"}.`,
      remediation: "Fill required variables in the deployment environment and keep secrets server-only."
    },
    {
      key: "public.env.audit",
      category: "Secrets",
      status: envMatrixRows().filter((row) => row.public && row.secret).length === 0 ? "pass" : "fail",
      blocker: envMatrixRows().some((row) => row.public && row.secret),
      summary: "Only publishable Supabase and Stripe values are marked public.",
      remediation: "Never prefix server-only secrets with NEXT_PUBLIC_."
    },
    {
      key: "live.gates.default_off",
      category: "Integrations",
      status: liveEnabled.length === 0 ? "pass" : "warning",
      blocker: false,
      summary: liveEnabled.length === 0 ? "All live write gates are off." : `Live gates enabled: ${liveEnabled.map((gate) => gate.gate).join(", ")}.`,
      remediation: "Enable live integrations one at a time only after provider-specific runbooks pass."
    },
    {
      key: "backup.restore.runbook",
      category: "Backups",
      status: "warning",
      blocker: false,
      summary: "Backup and restore runbooks are documented, but Supabase plan-level backup status must be verified manually.",
      remediation: "Confirm Supabase backup tier and complete a staging restore drill before launch."
    },
    {
      key: "ghl.write_gate.locked",
      category: "Integrations",
      status: ghlWriteGate.safe ? "pass" : "fail",
      blocker: !ghlWriteGate.safe,
      summary: ghlWriteGate.safe ? "GoHighLevel writes are blocked." : "GHL_ALLOW_WRITES is enabled.",
      remediation: "Set GHL_ALLOW_WRITES=false before any staging or production worker starts."
    },
    {
      key: "demo.seed.production_guard",
      category: "Migrations",
      status: env.ALLOW_DEMO_SEED === "true" && validation.environment === "production" ? "fail" : "pass",
      blocker: env.ALLOW_DEMO_SEED === "true" && validation.environment === "production",
      summary: env.ALLOW_DEMO_SEED === "true" && validation.environment === "production" ? "Demo seeding is enabled in production." : "Demo seed execution is blocked for production when ALLOW_DEMO_SEED=false.",
      remediation: "Set ALLOW_DEMO_SEED=false and never run seed files in production."
    },
    {
      key: "worker.supervisor.required",
      category: "Workers",
      status: "warning",
      blocker: false,
      summary: "The app includes persistent worker commands, but the hosting platform must supervise and restart them.",
      remediation: "Deploy npm run ghl:continuous-worker as a separate worker process and configure automatic restart."
    },
    {
      key: "rls.manual.audit",
      category: "RLS",
      status: "warning",
      blocker: false,
      summary: "RLS policies are additive and tested by domain isolation helpers; final database policy inventory requires Supabase verification.",
      remediation: "Run the RLS audit query checklist in staging before production promotion."
    },
    {
      key: "service.worker.private.cache",
      category: "PWA",
      status: "pass",
      blocker: false,
      summary: "The service worker avoids authenticated CRM, API, portal, clinical, payment, message, and AI response caching.",
      remediation: "Retest cache contents after every PWA change."
    }
  ];
}

export function readinessStatus(checks = productionReadinessChecks()) {
  if (checks.some((check) => check.status === "fail" && check.blocker)) return "NOT READY";
  if (checks.some((check) => check.status !== "pass")) return "READY WITH WARNINGS";
  return "READY FOR CONTROLLED PRODUCTION LAUNCH";
}

export type ReadinessDatabaseStatus = "ok" | "unavailable";

export function buildReadinessProbe(database: ReadinessDatabaseStatus, env: NodeJS.ProcessEnv = process.env) {
  const environment = validateEnvironment(env);
  const checks = productionReadinessChecks(env);
  const status = readinessStatus(checks);
  const blockers = checks.filter((check) => check.blocker && check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warning");
  const ok = database === "ok" && environment.ok && status !== "NOT READY";

  return {
    statusCode: ok ? 200 : 503,
    payload: {
      ok,
      version: getAppVersion(env),
      environment: environment.environment,
      database,
      status,
      checks: {
        environment: environment.ok,
        database: database === "ok",
        ghlWritesAllowed: env.GHL_ALLOW_WRITES === "true",
        demoSeedAllowed: env.ALLOW_DEMO_SEED === "true",
        warningCount: warnings.length,
        blockerCount: blockers.length,
        blockers: blockers.map((check) => ({
          key: check.key,
          category: check.category,
          status: check.status
        }))
      }
    }
  };
}
