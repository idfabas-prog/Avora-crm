import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getAppEnvironment, validateEnvironment } from "../config/environment.ts";
import { liveGateEnabled } from "../security/feature-gates.ts";
import { checkRateLimit, clearRateLimitBuckets, defaultRateLimitRules } from "../security/rate-limit.ts";
import { safeInternalPath, isInternalRequest } from "../security/request-guard.ts";
import { verifyHmacSignature, hmacSha256 } from "../security/webhooks.ts";
import { redactMetadata } from "../observability/logger.ts";
import { readinessStatus, productionReadinessChecks } from "./production-readiness.ts";
import { classifyJobStatus, nextRetryDelayMs } from "./jobs.ts";
import { accessReviewRisk } from "./audits.ts";

test("detects explicit Avora environments", () => {
  assert.equal(getAppEnvironment({ APP_ENV: "staging" }), "staging");
  assert.equal(getAppEnvironment({ NODE_ENV: "test" }), "test");
});

test("fails production validation when critical variables are missing", () => {
  const result = validateEnvironment({ APP_ENV: "production" });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(result.missing.includes("CRON_SECRET"));
});

test("keeps live integration gates off by default", () => {
  assert.equal(liveGateEnabled("payments", {}), false);
  assert.equal(liveGateEnabled("telephony", { TELEPHONY_ALLOW_LIVE_CALLS: "true" }), true);
});

test("rate limiter blocks excessive repeated requests", () => {
  clearRateLimitBuckets();
  const rule = { ...defaultRateLimitRules.login, limit: 2 };
  assert.equal(checkRateLimit(rule, "127.0.0.1", 1).allowed, true);
  assert.equal(checkRateLimit(rule, "127.0.0.1", 2).allowed, true);
  assert.equal(checkRateLimit(rule, "127.0.0.1", 3).allowed, false);
});

test("internal request auth requires cron secret in production", () => {
  const request = new Request("https://avora.example/api/workflows/process", { headers: { authorization: "Bearer good" } });
  assert.equal(isInternalRequest(request, { APP_ENV: "production", CRON_SECRET: "good" }), true);
  assert.equal(isInternalRequest(request, { APP_ENV: "production", CRON_SECRET: "bad" }), false);
});

test("rejects unsafe redirect paths", () => {
  assert.equal(safeInternalPath("https://evil.example"), "/dashboard");
  assert.equal(safeInternalPath("//evil.example"), "/dashboard");
  assert.equal(safeInternalPath("/contacts"), "/contacts");
});

test("verifies HMAC webhook signatures", () => {
  const payload = "{\"ok\":true}";
  const signature = hmacSha256("secret", payload);
  assert.equal(verifyHmacSignature({ secret: "secret", payload, signature }), true);
  assert.equal(verifyHmacSignature({ secret: "secret", payload, signature: "bad" }), false);
});

test("redacts sensitive logging metadata", () => {
  const metadata = redactMetadata({ token: "abc", clinical_note: "private", safe: "ok" });
  assert.equal(metadata.token, "[redacted]");
  assert.equal(metadata.clinical_note, "[redacted]");
  assert.equal(metadata.safe, "ok");
});

test("readiness status blocks failed critical checks", () => {
  const checks = productionReadinessChecks({ APP_ENV: "production" });
  assert.equal(readinessStatus(checks), "NOT READY");
});

test("classifies stuck jobs and retry backoff", () => {
  assert.equal(classifyJobStatus("running", new Date(Date.now() - 20 * 60_000).toISOString()), "stuck");
  assert.ok(nextRetryDelayMs(3) > nextRetryDelayMs(1));
});

test("flags inactive users and high-risk permissions for access review", () => {
  const result = accessReviewRisk(["system.manage"], "2020-01-01T00:00:00.000Z");
  assert.equal(result.status, "review");
  assert.deepEqual(result.highRiskPermissions, ["system.manage"]);
});

test("service worker avoids private authenticated caches", () => {
  const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /CACHE_NAME = "avora-mobile-shell-v2"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/portal"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/clinical"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/payments"\)/);
});
