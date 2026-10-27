// Imports a TeamSnap registration CSV (stand-in for the Director's upload page, Phase 9).
//   npm run import:teamsnap -- "data/import/<file>.csv" --dry-run   (check only)
//   npm run import:teamsnap -- "data/import/<file>.csv"             (replace registrations)
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseRegistrations, schoolYearOf, type Problem } from "../lib/teamsnap/parse";
import { importRegistrations } from "../lib/teamsnap/import";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
if (!file) {
  console.log('Usage: npm run import:teamsnap -- "data/import/<file>.csv" [--dry-run]');
  process.exit(1);
}

const now = new Date();
const parsed = parseRegistrations(readFileSync(file, "utf8"), { schoolYear: schoolYearOf(now) });

const list = (title: string, items: Problem[]) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const p of items) console.log(`  row ${p.row}${p.name ? ` – ${p.name}` : ""}: ${p.message}`);
};

const byGroup = new Map<string, { label: string; n: number }>();
for (const p of parsed.players) {
  const key = `${p.gender}${String(p.grade_sort).padStart(2, "0")}`;
  const g = byGroup.get(key) ?? { label: `${p.gender} ${p.grade}`, n: 0 };
  g.n++;
  byGroup.set(key, g);
}
console.log(`Players ready: ${parsed.players.length}`);
for (const [, g] of [...byGroup].sort(([a], [b]) => a.localeCompare(b))) console.log(`  ${g.label}: ${g.n}`);
list("Skipped", parsed.skipped);
list("Warnings (imported anyway)", parsed.warnings);
list("ERRORS (nothing will be imported)", parsed.errors);

if (parsed.errors.length) process.exit(1);
if (dryRun) {
  console.log("\nDry run: nothing changed.");
  process.exit(0);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=public",
});
try {
  const d = await pool.query<{ name: string }>(
    "select first_name || ' ' || last_name as name from users where thunder_director and active order by created_at limit 1",
  );
  const by = d.rows[0]?.name ?? "Director";
  const { imported } = await importRegistrations(pool, parsed, by, now);
  console.log(`\nImported ${imported} players (replacing the previous list). Recorded as imported by ${by}.`);
} finally {
  await pool.end();
}
