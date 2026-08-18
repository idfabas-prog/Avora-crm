import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!/^[A-Z0-9_]+=/.test(line)) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function appUrl() {
  const value = process.env.APP_URL || "http://localhost:3000";
  return value.replace(/\/$/, "");
}

async function check(name, path, options = {}) {
  const url = new URL(path, appUrl());
  const response = await fetch(url, {
    redirect: "manual",
    headers: options.internal && process.env.CRON_SECRET ? {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      "x-cron-secret": process.env.CRON_SECRET
    } : undefined
  });
  const ok = options.allowRedirect ? response.status >= 200 && response.status < 400 : response.ok;
  return {
    name,
    ok,
    status: response.status,
    path
  };
}

async function main() {
  loadDotEnvLocal();
  const checks = [];
  checks.push(await check("health endpoint", "/api/health"));
  checks.push(await check("readiness endpoint", "/api/ready"));
  checks.push(await check("login route", "/login", { allowRedirect: true }));
  checks.push(await check("dashboard route protected", "/dashboard", { allowRedirect: true }));
  checks.push(await check("calendar route protected", "/calendar", { allowRedirect: true }));
  checks.push(await check("system health route protected", "/settings/system/health", { allowRedirect: true }));

  const failed = checks.filter((item) => !item.ok);
  for (const item of checks) {
    console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name} status=${item.status} path=${item.path}`);
  }
  if (failed.length) {
    console.error(`Smoke test failed: ${failed.map((item) => item.name).join(", ")}`);
    process.exit(1);
  }
}

await main();
