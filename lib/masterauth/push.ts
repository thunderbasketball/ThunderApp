// App → MasterAuth sheet (SPEC.md section 7). Users queued in masterauth_outbox (by the users trigger) are written to
// their row, found by CoachID; someone new gets a new row. Only Thunder's columns are written: names, PIN, email,
// VerifiedEmail, ThunderRequest/Coach/Director. Never Active on an existing row (it's shared with Scenic City), never
// the Scenic City columns, ThunderAdmin or the old login columns. A user deleted in the app keeps their row with
// Thunder roles cleared. Failures are retried later and never block anything in the app.
import type { Pool } from "pg";
import { STARTER_PIN } from "../auth/crypto";

type Cell = { row: number; col: number; value: string | boolean };
export type SheetIO = {
  read: () => Promise<string[][]>;
  writeCells: (cells: Cell[]) => Promise<void>;
  appendRow: (values: (string | boolean | null)[]) => Promise<void>;
};
type Deps = { pool: Pool; now: () => Date; sheet: SheetIO; openPin: (sealed: string) => string | null };

export const STATUS_NAME = "masterauth-push";
const BATCH = 100;
const COLUMNS = [
  "CoachID",
  "FirstName",
  "LastName",
  "Active",
  "PIN",
  "CellNumber",
  "EmailAddress",
  "VerifiedEmail",
  "ThunderRequest",
  "ThunderCoach",
  "ThunderDirector",
] as const;
type Column = (typeof COLUMNS)[number];

const bool = (v: string | undefined) => /^(true|yes|y|1|x)$/i.test((v ?? "").trim());
// Formula guard for anything that ends up in the sheet (RAW writes never run formulas, but exports to CSV might).
const safe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
// Minutes to wait before retrying: 1, 2, 4 … up to an hour.
const backoff = (attempts: number) => Math.min(60, 2 ** attempts);

// stamp: queued_at as exact text (a JS Date would drop its microseconds and never match again).
type Queued = { coach_id: string; pin_enc: string | null; starter_pin: boolean; deleted: boolean; stamp: string; attempts: number };
type User = {
  first_name: string;
  last_name: string;
  cell: string;
  email: string | null;
  verified_email: string | null;
  pin_hash: string | null; // null = starter PIN
  thunder_request: boolean;
  thunder_coach: boolean;
  thunder_director: boolean;
};

export type PushResult = { status: "idle" | "done" | "failed"; updated: number; added: number; message?: string };

export async function pushToSheet(deps: Deps): Promise<PushResult> {
  const now = deps.now();
  const due = await deps.pool.query<Queued>(
    `select coach_id, pin_enc, starter_pin, deleted, queued_at::text as stamp, attempts from masterauth_outbox
     where next_try_at is null or next_try_at <= $1 order by queued_at limit ${BATCH}`,
    [now],
  );
  if (!due.rows.length) return { status: "idle", updated: 0, added: 0 };

  try {
    const sheet = await deps.sheet.read();
    const header = (sheet[0] ?? []).map((c) => c.trim().toLowerCase());
    const col = (c: Column) => header.indexOf(c.toLowerCase()) + 1; // 1-based; 0 = missing
    const missing = COLUMNS.filter((c) => !col(c));
    if (missing.length) throw new Error(`The MasterAuth tab is missing column(s): ${missing.join(", ")}`);
    const rowOf = new Map<string, number>();
    sheet.slice(1).forEach((r, i) => {
      const id = (r[col("CoachID") - 1] ?? "").trim();
      if (/^\d{1,7}$/.test(id)) rowOf.set(id.padStart(7, "0"), i + 2);
    });
    const current = (row: number, c: Column) => sheet[row - 1]?.[col(c) - 1] ?? "";

    const cells: Cell[] = [];
    const rows: (string | boolean | null)[][] = [];
    let updated = 0;
    for (const q of due.rows) {
      const u = (await deps.pool.query<User>("select * from users where coach_id = $1", [q.coach_id])).rows[0];
      const row = rowOf.get(q.coach_id);
      if (!u) {
        // Deleted in the app: keep their row (Scenic City may use it), clear the Thunder roles.
        if (row && q.deleted) {
          const before = cells.length;
          for (const c of ["ThunderRequest", "ThunderCoach", "ThunderDirector"] as const)
            if (bool(current(row, c))) cells.push({ row, col: col(c), value: false });
          if (cells.length > before) updated++;
        }
        continue;
      }
      // The PIN: one just set in the app, or the starter PIN after the app reset it; otherwise the sheet's PIN stays.
      const pin = q.pin_enc ? deps.openPin(q.pin_enc) : q.starter_pin && u.pin_hash === null ? STARTER_PIN : null;
      if (q.pin_enc && !pin) console.warn(`[masterauth] Couldn't open the queued PIN for ${q.coach_id}; check MASTERAUTH_PIN_KEY.`);
      const want: Partial<Record<Column, string | boolean>> = {
        FirstName: safe(u.first_name),
        LastName: safe(u.last_name),
        EmailAddress: safe(u.email ?? ""),
        VerifiedEmail: safe(u.verified_email ?? ""),
        ThunderRequest: u.thunder_request,
        ThunderCoach: u.thunder_coach,
        ThunderDirector: u.thunder_director,
        ...(pin ? { PIN: pin } : {}),
      };
      if (row) {
        // Only the cells that differ.
        const before = cells.length;
        for (const [c, v] of Object.entries(want) as [Column, string | boolean][]) {
          const have = current(row, c);
          const same =
            typeof v === "boolean" ? bool(have) === v : c === "PIN" ? /^\d{1,4}$/.test(have) && have.padStart(4, "0") === v : have === v;
          if (!same) cells.push({ row, col: col(c), value: v });
        }
        if (cells.length > before) updated++;
      } else {
        const values: (string | boolean | null)[] = header.map(() => null);
        const put = (c: Column, v: string | boolean) => (values[col(c) - 1] = v);
        for (const [c, v] of Object.entries(want) as [Column, string | boolean][]) put(c, v);
        put("CoachID", q.coach_id);
        put("Active", true);
        put("CellNumber", u.cell);
        if (!pin) put("PIN", STARTER_PIN);
        rows.push(values);
      }
    }

    if (cells.length) {
      // Rows may have moved since the read (someone sorted or deleted rows): check the CoachIDs again right before writing.
      const again = await deps.sheet.read();
      for (const row of new Set(cells.map((c) => c.row))) {
        const was = sheet[row - 1]?.[col("CoachID") - 1];
        if ((again[row - 1]?.[col("CoachID") - 1] ?? "") !== (was ?? ""))
          throw new Error("The sheet changed while writing; will try again.");
      }
      await deps.sheet.writeCells(cells);
    }
    for (const values of rows) await deps.sheet.appendRow(values);

    // Done: unless the person changed again meanwhile (queued_at moved on), they leave the queue.
    for (const q of due.rows)
      await deps.pool.query("delete from masterauth_outbox where coach_id = $1 and queued_at = $2::timestamptz", [q.coach_id, q.stamp]);
    const r = { status: "done" as const, updated, added: rows.length };
    await setStatus(deps, true, `Updated ${updated}, added ${rows.length}`);
    return r;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    for (const q of due.rows)
      await deps.pool.query(
        `update masterauth_outbox set attempts = attempts + 1, last_error = $3, next_try_at = $4
         where coach_id = $1 and queued_at = $2::timestamptz`,
        [q.coach_id, q.stamp, message.slice(0, 500), new Date(now.getTime() + backoff(q.attempts) * 60_000)],
      );
    await setStatus(deps, false, message);
    return { status: "failed", updated: 0, added: 0, message };
  }
}

async function setStatus(deps: Deps, ok: boolean, message: string) {
  const now = deps.now();
  await deps.pool.query(
    `insert into sync_status (name, checked_at, changed_at, ok, message) values ($1, $2, $3, $4, $5)
     on conflict (name) do update set checked_at = excluded.checked_at,
       changed_at = coalesce(excluded.changed_at, sync_status.changed_at), ok = excluded.ok, message = excluded.message`,
    [STATUS_NAME, now, ok ? now : null, ok, message],
  );
}

// For the Users page: the last write to the sheet, and how many people are waiting to be written.
export async function pushStatus(pool: Pick<Pool, "query">) {
  const r = await pool.query<{ ok: boolean | null; message: string | null; checkedAt: Date | null; waiting: number }>(
    `select s.ok, s.message, s.checked_at as "checkedAt", (select count(*)::int from masterauth_outbox) as waiting
     from (select 1) x left join sync_status s on s.name = $1`,
    [STATUS_NAME],
  );
  return r.rows[0];
}
