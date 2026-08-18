import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync, statSync } from "node:fs";

const root = process.cwd();
const ignoredDirs = new Set([".git", ".next", "node_modules"]);
const ignoredSuffixes = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".lock"];
const ignoredEnvFiles = new Set([".env", ".env.local", ".env.staging.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".env.production", ".env.production.local"]);

function listFiles(directory, prefix = "") {
  return readdirSync(directory).flatMap((entry) => {
    if (entry.startsWith("~$")) return [];
    const absolute = join(directory, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(absolute);
    if (stat.isDirectory()) return ignoredDirs.has(entry) ? [] : listFiles(absolute, relative);
    if (ignoredSuffixes.some((suffix) => entry.endsWith(suffix))) return [];
    return [relative];
  });
}

const files = listFiles(root);

const secretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^=\s][^\n]+/i,
  /sk_live_[A-Za-z0-9_]+/,
  /whsec_[A-Za-z0-9_]+/,
  /TWILIO_AUTH_TOKEN\s*=\s*[^=\s][^\n]+/i,
  /OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]+/i
];

const findings = [];
for (const file of files) {
  if (ignoredEnvFiles.has(file)) continue;
  if (file === ".env.example" || file === "scripts/security-static-check.mjs") continue;
  const content = readFileSync(join(root, file), "utf8");
  if (secretPatterns.some((pattern) => pattern.test(content))) findings.push(file);
}

const publicEnv = files.flatMap((file) => {
  const content = readFileSync(join(root, file), "utf8");
  return [...content.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)].map((match) => ({ file, value: match[0] }));
});
const publicSecrets = publicEnv.filter(({ value }) => /SECRET|TOKEN|PASSWORD|SERVICE_ROLE|PRIVATE/i.test(value));

if (findings.length || publicSecrets.length) {
  console.error("Static security check failed.");
  if (findings.length) console.error(`Secret-like values found in: ${[...new Set(findings)].join(", ")}`);
  if (publicSecrets.length) console.error(`Suspicious public env vars: ${publicSecrets.map((item) => `${item.value} (${item.file})`).join(", ")}`);
  process.exit(1);
}

console.log(`Static security check passed. NEXT_PUBLIC references inspected: ${publicEnv.length}.`);
