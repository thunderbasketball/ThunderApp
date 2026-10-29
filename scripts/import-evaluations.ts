// Imports the Google Sheet's Evaluations tab. Safe to run again (cards already in the app are left alone).
//   npm run import:evaluations -- --dry-run   (show what would happen; nothing changes)
//   npm run import:evaluations
import pg from "pg";
import { loadServiceAccount, readTab, spreadsheetIdOf } from "../lib/google/sheets";
import { importEvaluations, parseEvaluationsTab, type EvalProblem } from "../lib/evaluations-import";

const dryRun = process.argv.includes("--dry-run");
const sheet = process.env.REGISTRATIONS_SHEET;
if (!sheet) {
  console.log("Set REGISTRATIONS_SHEET in .env.local.");
  process.exit(1);
}

let rows: string[][];
try {
  rows = await readTab({ key: loadServiceAccount() }, spreadsheetIdOf(sheet), process.env.EVALUATIONS_TAB ?? "Evaluations");
} catch (e) {
  console.log(e instanceof Error ? e.message : e);
  process.exit(1);
}
const parsed = parseEvaluationsTab(rows);
const list = (title: string, items: EvalProblem[]) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const p of items) console.log(`  row ${p.row}: ${p.message}`);
};
list("ERRORS (nothing will be imported)", parsed.errors);
if (parsed.errors.length) process.exit(1);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=public",
});
try {
  const result = await importEvaluations(pool, parsed.items, { now: new Date(), dryRun, by: "Sheet import" });
  const label = { added: "added", already: "already in app", noTeam: "TEAM NOT FOUND", noPlayer: "PLAYER NOT FOUND in registrations" };
  console.log(`${dryRun ? "Dry run – would import" : "Imported"}:\n`);
  for (const r of result) console.log(`  row ${r.row}  ${r.team.padEnd(14)} ${r.player} – ${label[r.status]}`);
  const n = (s: string) => result.filter((r) => r.status === s).length;
  console.log(`\nAdded ${n("added")}, already in app ${n("already")}, not matched ${n("noTeam") + n("noPlayer")}.`);
  list("Warnings", parsed.warnings);
  if (dryRun) console.log("\nDry run: nothing changed.");
} finally {
  await pool.end();
}
