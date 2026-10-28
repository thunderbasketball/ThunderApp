// Sends the "unread for 8 hours" summary emails (announcements and chat): checks every 15 minutes while the server runs
// (started from instrumentation.ts).
import { sendUnreadEmails } from "../announcements";
import { sendUnreadChatEmails } from "../chat";
import { db } from "../db";
import { sendEmail } from "../email";

const g = globalThis as unknown as { thunderNotifyTimer?: NodeJS.Timeout; thunderNotifyRunning?: boolean };
const CHECK_MINUTES = 15;

async function run() {
  if (g.thunderNotifyRunning) return;
  g.thunderNotifyRunning = true;
  try {
    const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const deps = { pool: db, now: () => new Date(), sendEmail, appUrl };
    const n = await sendUnreadEmails(deps);
    if (n) console.log(`[notify] Sent ${n} unread-announcement email${n === 1 ? "" : "s"}.`);
    const c = await sendUnreadChatEmails(deps);
    if (c) console.log(`[notify] Sent ${c} unread-chat email${c === 1 ? "" : "s"}.`);
  } catch (e) {
    console.error("[notify] failed:", e);
  } finally {
    g.thunderNotifyRunning = false;
  }
}

export function startNotifyEmails() {
  if (g.thunderNotifyTimer) return;
  g.thunderNotifyTimer = setInterval(run, CHECK_MINUTES * 60_000);
  setTimeout(run, 10_000);
}
