// One-time import of existing users from the MasterAuth sheet. Safe to run again.
//   npm run import:users -- --dry-run   (show what would happen; nothing changes)
//   npm run import:users
// Never prints PINs.
import pg from "pg";
import { loadServiceAccount, readTab, spreadsheetIdOf } from "../lib/google/sheets";
import { importMasterAuth, parseMasterAuth, type Problem } from "../lib/masterauth/import";

const dryRun = process.argv.includes("--dry-run");
const sheet = process.env.MASTERAUTH_SHEET;
if (!sheet) {
  console.log("Set MASTERAUTH_SHEET in .env.local to the MasterAuth sheet link.");
  process.exit(1);
}

let rows: string[][];
try {
  rows = await readTab({ key: loadServiceAccount() }, spreadsheetIdOf(sheet), process.env.MASTERAUTH_TAB ?? "Master Auth");
} catch (e) {
  console.log(e instanceof Error ? e.message : e);
  process.exit(1);
}
const parsed = parseMasterAuth(rows);
const list = (title: string, items: Problem[]) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const p of items) console.log(`  row ${p.row}${p.name ? ` – ${p.name}` : ""}: ${p.message}`);
};
list("ERRORS (nothing will be imported)", parsed.errors);
if (parsed.errors.length) process.exit(1);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=public",
});
try {
  const out = await importMasterAuth(pool, parsed, { now: new Date(), dryRun });
  const sorted = [...out].sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name));
  console.log(`${dryRun ? "Dry run – MasterAuth has" : "Imported"} ${out.length} users:`);
  for (const status of ["new", "updated", "unchanged"] as const) {
    const these = sorted.filter((u) => u.status === status);
    if (!these.length) continue;
    console.log(`\n${{ new: "New to the app", updated: "Already in the app – updated", unchanged: "Already in the app – no change" }[status]} (${these.length})`);
    for (const u of these) console.log(`  ${u.coachId}  ${u.name}${u.changes.length ? `: ${u.changes.join("; ")}` : ""}`);
  }
  const inSheet = new Set(out.map((u) => u.coachId));
  const appOnly = await pool.query<{ coach_id: string; name: string }>(
    "select coach_id, first_name || ' ' || last_name as name from users order by last_name",
  );
  const extra = appOnly.rows.filter((r) => !inSheet.has(r.coach_id));
  if (extra.length) console.log(`\nOnly in the app, left alone (${extra.length}): ${extra.map((r) => `${r.name} (${r.coach_id})`).join(", ")}`);
  list("Warnings", parsed.warnings);
  console.log(dryRun ? "\nDry run: nothing changed." : "\nDone.");
} finally {
  await pool.end();
}
