// Checks the Google Sheet on a timer while the server runs (started from instrumentation.ts).
import { db } from "../db";
import { loadServiceAccount, readTab, spreadsheetIdOf } from "../google/sheets";
import { syncRegistrations } from "./sync";

const g = globalThis as unknown as { thunderSyncTimer?: NodeJS.Timeout };

export function startRegistrationSync() {
  const sheet = process.env.REGISTRATIONS_SHEET;
  if (!sheet || g.thunderSyncTimer) return;
  const minutes = Math.max(1, Number(process.env.REGISTRATIONS_SYNC_MINUTES) || 10);
  const tab = process.env.REGISTRATIONS_TAB ?? "TeamSnapAPI";

  const run = async () => {
    try {
      const key = loadServiceAccount();
      const r = await syncRegistrations({
        pool: db,
        now: () => new Date(),
        readRows: () => readTab({ key }, spreadsheetIdOf(sheet), tab),
      });
      if (r.status === "updated") console.log(`[sheet sync] Player list updated from Google Sheet: ${r.imported} players.`);
      if (r.status === "failed") console.warn(`[sheet sync] ${r.message}`);
    } catch (e) {
      console.error("[sheet sync] failed:", e);
    }
  };

  g.thunderSyncTimer = setInterval(run, minutes * 60_000);
  setTimeout(run, 5_000);
  console.log(`[sheet sync] Checking the "${tab}" tab every ${minutes} minutes.`);
}
