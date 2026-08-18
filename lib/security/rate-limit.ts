export type RateLimitScope = "ip" | "user" | "organization" | "endpoint";

export type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
  scope: RateLimitScope;
};

export type RateLimitResult = {
  allowed: boolean;
  key: string;
  remaining: number;
  resetAt: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export const defaultRateLimitRules: Record<string, RateLimitRule> = {
  login: { key: "login", limit: 10, windowMs: 60_000, scope: "ip" },
  passwordReset: { key: "password_reset", limit: 5, windowMs: 60_000, scope: "ip" },
  patientCheckIn: { key: "patient_check_in", limit: 20, windowMs: 60_000, scope: "ip" },
  ai: { key: "ai", limit: 30, windowMs: 60_000, scope: "user" },
  export: { key: "export", limit: 10, windowMs: 60_000, scope: "user" },
  webhook: { key: "webhook", limit: 120, windowMs: 60_000, scope: "ip" },
  internalJob: { key: "internal_job", limit: 60, windowMs: 60_000, scope: "endpoint" },
  search: { key: "search", limit: 60, windowMs: 60_000, scope: "user" }
};

export function rateLimitKey(rule: Pick<RateLimitRule, "key" | "scope">, identity: string) {
  return `${rule.scope}:${rule.key}:${identity || "anonymous"}`;
}

export function checkRateLimit(rule: RateLimitRule, identity: string, now = Date.now()): RateLimitResult {
  const key = rateLimitKey(rule, identity);
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + rule.windowMs } : existing;
  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: bucket.count <= rule.limit,
    key,
    remaining: Math.max(0, rule.limit - bucket.count),
    resetAt: bucket.resetAt
  };
}

export function clearRateLimitBuckets() {
  buckets.clear();
}

