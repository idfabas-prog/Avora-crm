import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql") && !file.startsWith("~$"));
const timestamps = new Map();
const failures = [];

for (const file of files) {
  const timestamp = file.slice(0, 14);
  if (timestamps.has(timestamp)) failures.push(`Duplicate migration timestamp ${timestamp}: ${timestamps.get(timestamp)} and ${file}`);
  timestamps.set(timestamp, file);
  const sql = readFileSync(join(migrationsDir, file), "utf8").toLowerCase();
  if (/\bdrop\s+table\b/.test(sql)) failures.push(`Destructive DROP TABLE detected in ${file}`);
  if (/\btruncate\s+table\b/.test(sql)) failures.push(`Destructive TRUNCATE detected in ${file}`);
  const createdPublicTables = [...sql.matchAll(/create\s+table\s+public\.([a-z0-9_]+)/g)].map((match) => match[1]);
  for (const table of createdPublicTables) {
    if (!sql.includes(`alter table public.${table} enable row level security`)) {
      failures.push(`Missing RLS enable for public.${table} in ${file}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Migration lint passed for ${files.length} migration files.`);

