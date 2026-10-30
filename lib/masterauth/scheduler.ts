// Writes queued user changes to the MasterAuth sheet every minute while the server runs (started from
// instrumentation.ts). Only when MASTERAUTH_SYNC=on; turn it off at go-live, when the app becomes the only source.
import { db } from "../db";
import { appendRow, loadServiceAccount, readTab, spreadsheetIdOf, writeCells } from "../google/sheets";
import { openPin, syncOn } from "./pin-box";
import { pushToSheet } from "./push";

const g = globalThis as unknown as { masterAuthTimer?: NodeJS.Timeout; masterAuthRunning?: boolean };

async function run() {
  if (!syncOn() || g.masterAuthRunning) return;
  g.masterAuthRunning = true;
  try {
    const key = loadServiceAccount();
    const id = spreadsheetIdOf(process.env.MASTERAUTH_SHEET!);
    const tab = process.env.MASTERAUTH_TAB ?? "Master Auth";
    const r = await pushToSheet({
      pool: db,
      now: () => new Date(),
      openPin,
      sheet: {
        read: () => readTab({ key }, id, tab),
        writeCells: (cells) => writeCells({ key }, id, tab, cells),
        appendRow: (values) => appendRow({ key }, id, tab, values),
      },
    });
    if (r.status === "done") console.log(`[masterauth] Sheet updated: ${r.updated} changed, ${r.added} added.`);
    if (r.status === "failed") console.warn(`[masterauth] ${r.message}`);
  } catch (e) {
    console.error("[masterauth] failed:", e);
  } finally {
    g.masterAuthRunning = false;
  }
}

export function startMasterAuthSync() {
  if (!syncOn() || g.masterAuthTimer) return;
  g.masterAuthTimer = setInterval(run, 60_000);
  setTimeout(run, 10_000);
  console.log("[masterauth] Writing user changes to the MasterAuth sheet every minute.");
}
