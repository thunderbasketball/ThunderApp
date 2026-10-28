// Imports the sheet's Gyms, PracticeSlots and BlackOuts tabs. Safe to run again (existing slots are left alone).
//   npm run import:practice -- --dry-run
//   npm run import:practice
import pg from "pg";
import { loadServiceAccount, readTab, spreadsheetIdOf } from "../lib/google/sheets";
import { importPractice, parsePracticeTabs, type Problem } from "../lib/practice/import";

const dryRun = process.argv.includes("--dry-run");
const sheet = process.env.PRACTICE_SHEET ?? process.env.REGISTRATIONS_SHEET;
if (!sheet) {
  console.log("Set REGISTRATIONS_SHEET (or PRACTICE_SHEET) in .env.local.");
  process.exit(1);
}
const key = loadServiceAccount();
const id = spreadsheetIdOf(sheet);
const [gyms, slots, blackouts] = await Promise.all(["Gyms", "PracticeSlots", "BlackOuts"].map((t) => readTab({ key }, id, t)));
const parsed = parsePracticeTabs({ gyms, slots, blackouts });

const list = (title: string, items: Problem[]) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const p of items) console.log(`  ${p.tab} row ${p.row}: ${p.message}`);
};
list("ERRORS (nothing will be imported)", parsed.errors);
if (parsed.errors.length) process.exit(1);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, options: "-c search_path=public" });
try {
  const d = await pool.query<{ name: string }>(
    "select first_name || ' ' || last_name as name from users where thunder_director and active order by created_at limit 1",
  );
  const r = await importPractice(pool, parsed, { by: d.rows[0]?.name ?? "Director", dryRun });
  console.log(dryRun ? "Dry run – would import:" : "Imported:");
  console.log(`  Gyms: ${r.gyms} new · Courts: ${r.courts} new`);
  console.log(`  Slots: ${r.slotsNew} new${r.slotsExisting ? `, ${r.slotsExisting} already in the app (left alone)` : ""}`);
  console.log(`  Bookings: ${Object.entries(r.booked).map(([t, n]) => `${t} ${n}`).join(", ") || "none"}`);
  console.log(`  Blacked-out slots: ${r.blackouts} · Blackout dates: ${r.blackoutDates} new`);
  if (r.unknownTeams.length) console.log(`\nUNKNOWN TEAMS (the real import will stop): ${r.unknownTeams.join(", ")}`);
  list("Warnings", parsed.warnings);
  console.log(dryRun ? "\nDry run: nothing changed." : "\nDone.");
} finally {
  await pool.end();
}
