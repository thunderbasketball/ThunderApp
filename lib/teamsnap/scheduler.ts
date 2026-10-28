// Keeps registrations in step with the Google Sheet:
// - a timer while the server runs (started from instrumentation.ts), and
// - a backup check whenever someone opens a page and the last check is older than the interval
//   (covers a server started before the timer existed, a sleeping laptop, and hosting without timers).
import { db } from "../db";
import { loadServiceAccount, readTab, spreadsheetIdOf } from "../google/sheets";
import { getSyncStatus, syncRegistrations } from "./sync";

const g = globalThis as unknown as { thunderSyncTimer?: NodeJS.Timeout; thunderSyncRunning?: boolean };
const minutes = () => Math.max(1, Number(process.env.REGISTRATIONS_SYNC_MINUTES) || 5);

async function run() {
  const sheet = process.env.REGISTRATIONS_SHEET;
  if (!sheet || g.thunderSyncRunning) return;
  g.thunderSyncRunning = true;
  try {
    const key = loadServiceAccount();
    const tab = process.env.REGISTRATIONS_TAB ?? "TeamSnapAPI";
    const r = await syncRegistrations({
      pool: db,
      now: () => new Date(),
      readRows: () => readTab({ key }, spreadsheetIdOf(sheet), tab),
    });
    if (r.status === "updated") console.log(`[sheet sync] Player list updated from Google Sheet: ${r.imported} players.`);
    if (r.status === "failed") console.warn(`[sheet sync] ${r.message}`);
  } catch (e) {
    console.error("[sheet sync] failed:", e);
  } finally {
    g.thunderSyncRunning = false;
  }
}

export function startRegistrationSync() {
  if (!process.env.REGISTRATIONS_SHEET || g.thunderSyncTimer) return;
  g.thunderSyncTimer = setInterval(run, minutes() * 60_000);
  setTimeout(run, 5_000);
  console.log(`[sheet sync] Checking the sheet every ${minutes()} minutes.`);
}

// Runs a check if the last one is older than the interval. Cheap when it isn't: one small query.
export async function syncIfStale() {
  if (!process.env.REGISTRATIONS_SHEET || g.thunderSyncRunning) return;
  try {
    const s = await getSyncStatus(db);
    if (s?.checkedAt && Date.now() - s.checkedAt.getTime() < minutes() * 60_000) return;
  } catch (e) {
    console.error("[sheet sync] status check failed:", e);
    return;
  }
  await run();
}
