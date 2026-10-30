// Imports the Google Sheet's Teams tab. Safe to run again (adds missing staff to existing teams).
//   npm run import:teams -- --dry-run   (show what would happen; nothing changes)
//   npm run import:teams
import pg from "pg";
import { loadServiceAccount, readTab, spreadsheetIdOf } from "../lib/google/sheets";
import { importTeams, parseTeamsTab, type TeamsProblem } from "../lib/teams-import";

const dryRun = process.argv.includes("--dry-run");
const sheet = process.env.TEAMS_SHEET ?? process.env.REGISTRATIONS_SHEET;
if (!sheet) {
  console.log("Set REGISTRATIONS_SHEET (or TEAMS_SHEET) in .env.local.");
  process.exit(1);
}

let rows: string[][];
try {
  rows = await readTab({ key: loadServiceAccount() }, spreadsheetIdOf(sheet), process.env.TEAMS_TAB ?? "Teams");
} catch (e) {
  console.log(e instanceof Error ? e.message : e);
  process.exit(1);
}
const parsed = parseTeamsTab(rows);
const list = (title: string, items: TeamsProblem[]) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const p of items) console.log(`  row ${p.row}${p.team ? ` – ${p.team}` : ""}: ${p.message}`);
};
list("ERRORS (nothing will be imported)", parsed.errors);
if (parsed.errors.length) process.exit(1);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=public",
});
try {
  const d = await pool.query<{ name: string }>(
    "select first_name || ' ' || last_name as name from users where has_role(coach_id, 'thunder', 'Director') and active order by created_at limit 1",
  );
  const by = d.rows[0]?.name ?? "Director";
  const result = await importTeams(pool, parsed, { by, now: new Date(), dryRun });

  const label = { user: "app user", newLogin: "NEW LOGIN from registration", already: "role already filled", unmatched: "NOT FOUND" };
  console.log(`${dryRun ? "Dry run – would import" : "Imported"} ${parsed.teams.length} teams:\n`);
  for (const t of result) {
    console.log(`${t.name}  (${t.status === "created" ? "new" : "already in app"})`);
    for (const s of t.staff) console.log(`    ${s.role.padEnd(10)} ${s.coachId}  ${s.who ?? ""}${s.who ? " – " : ""}${label[s.status]}`);
  }
  const unmatched = [...new Set(result.flatMap((t) => t.staff.filter((s) => s.status === "unmatched").map((s) => s.coachId)))];
  const logins = [...new Set(result.flatMap((t) => t.staff.filter((s) => s.status === "newLogin").map((s) => s.who)))];
  console.log(`\nNew logins: ${logins.length}${logins.length ? ` (${logins.join(", ")})` : ""}`);
  if (unmatched.length) console.log(`Not found (add these users, then run again): ${unmatched.join(", ")}`);
  list("Warnings", parsed.warnings);
  console.log(dryRun ? "\nDry run: nothing changed." : `\nRecorded as created by ${by}.`);
} finally {
  await pool.end();
}
