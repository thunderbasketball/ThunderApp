// One-time import of existing users from the MasterAuth sheet.
// The sheet wins for names, emails, PINs and Active; Thunder roles are combined with what the app already has;
// Scenic City columns are copied as they are. Users only in the app are left alone.
import type { Pool, PoolClient } from "pg";
import { STARTER_PIN, hashPin, isStarterPin, verifyPin } from "../auth/crypto";
import { cleanEmail, cleanName } from "../auth/validate";
import { coachIdFromCell, normalizeCell } from "../phone";
import { withTx } from "../sql";

export type SheetUser = {
  row: number;
  coachId: string;
  first: string;
  last: string;
  active: boolean;
  pin: string | null; // null = starter PIN (1234) or unreadable
  cell: string;
  email: string | null;
  verifiedEmail: string | null;
  thunderRequest: boolean;
  thunderCoach: boolean;
  thunderDirector: boolean;
  scenicCityRequest: boolean;
  scenicCityCoach: boolean;
  scenicCityDirector: boolean;
  scenicCityAssociations: string | null;
};
export type Problem = { row: number; name?: string; message: string };

const REQUIRED = ["CoachID", "FirstName", "LastName", "Active", "PIN", "CellNumber", "EmailAddress", "ThunderCoach", "ThunderDirector"];
const bool = (v: string | undefined) => /^(true|yes|y|1|x)$/i.test((v ?? "").trim());

export function parseMasterAuth(rows: string[][]): { users: SheetUser[]; errors: Problem[]; warnings: Problem[] } {
  const users: SheetUser[] = [];
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const h = (rows[0] ?? []).map((c) => c.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !h.includes(c.toLowerCase()));
  if (missing.length) return { users, errors: [{ row: 1, message: `Missing column(s): ${missing.join(", ")}` }], warnings };

  const ids = new Set<string>();
  const cells = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    if (!r.some((c) => c.trim())) return;
    const get = (c: string) => (r[h.indexOf(c.toLowerCase())] ?? "").trim();
    const first = cleanName(get("FirstName"));
    const last = cleanName(get("LastName"));
    const name = `${get("FirstName")} ${get("LastName")}`.trim() || undefined;
    const fail = (message: string) => errors.push({ row, name, message });
    const warn = (message: string) => warnings.push({ row, name, message });

    if (!first || !last) return fail("First and last name must be letters.");
    const cell = normalizeCell(get("CellNumber"));
    if (!cell) return fail(`Cell "${get("CellNumber")}" isn't a 10-digit number.`);
    const coachId = get("CoachID").padStart(7, "0");
    if (!/^\d{7}$/.test(coachId)) return fail(`CoachID "${get("CoachID")}" isn't 7 digits.`);
    if (coachId !== coachIdFromCell(cell)) return fail(`CoachID ${coachId} doesn't match the last 7 digits of cell ${cell}.`);
    if (ids.has(coachId)) return fail(`CoachID ${coachId} appears twice.`);
    if (cells.has(cell)) return fail(`Cell ${cell} appears twice.`);
    ids.add(coachId);
    cells.add(cell);

    // Sheets drops leading zeros from numbers, so "607" is PIN 0607.
    const pinText = get("PIN");
    let pin: string | null = /^\d{1,4}$/.test(pinText) ? pinText.padStart(4, "0") : null;
    if (pinText && !pin) warn("PIN isn't 4 digits; they'll start with PIN 1234.");
    if (pin === STARTER_PIN) pin = null;

    const emailText = get("EmailAddress");
    const email = emailText ? cleanEmail(emailText) : null;
    if (emailText && !email) warn(`Email "${emailText}" doesn't look right; left blank.`);
    const verText = get("VerifiedEmail");
    const verifiedEmail = verText ? cleanEmail(verText) : null;

    users.push({
      row,
      coachId,
      first,
      last,
      active: bool(get("Active")),
      pin,
      cell,
      email,
      verifiedEmail,
      thunderRequest: bool(get("ThunderRequest")),
      thunderCoach: bool(get("ThunderCoach")),
      thunderDirector: bool(get("ThunderDirector")),
      scenicCityRequest: bool(get("ScenicCityRequest")),
      scenicCityCoach: bool(get("ScenicCityCoach")),
      scenicCityDirector: bool(get("ScenicCityDirector")),
      scenicCityAssociations: get("ScenicCityAssociations") || null,
    });
  });
  return { users, errors, warnings };
}

export type UserOutcome = { coachId: string; name: string; status: "new" | "updated" | "unchanged"; changes: string[] };

class DryRun extends Error {
  constructor(public result: UserOutcome[]) {
    super("dry run");
  }
}

export async function importMasterAuth(
  pool: Pool,
  parsed: ReturnType<typeof parseMasterAuth>,
  opts: { now: Date; dryRun: boolean },
): Promise<UserOutcome[]> {
  if (parsed.errors.length) throw new Error(`MasterAuth has ${parsed.errors.length} error(s); nothing was changed.`);
  // Hash outside the transaction; scrypt is slow on purpose.
  const hashes = new Map<string, string>();
  for (const u of parsed.users) if (u.pin) hashes.set(u.coachId, await hashPin(u.pin));
  try {
    return await withTx(pool, async (q) => {
      const out: UserOutcome[] = [];
      for (const u of parsed.users) out.push(await importOne(q, u, hashes.get(u.coachId) ?? null, opts.now));
      if (opts.dryRun) throw new DryRun(out);
      return out;
    });
  } catch (e) {
    if (e instanceof DryRun) return e.result;
    throw e;
  }
}

type Row = {
  coach_id: string;
  first_name: string;
  last_name: string;
  active: boolean;
  pin_hash: string | null;
  cell: string;
  email: string | null;
  verified_email: string | null;
  thunder_request: boolean;
  thunder_coach: boolean;
  thunder_director: boolean;
};

async function importOne(q: PoolClient, u: SheetUser, pinHash: string | null, now: Date): Promise<UserOutcome> {
  const name = `${u.first} ${u.last}`;
  const clash = await q.query<{ coach_id: string }>("select coach_id from users where cell = $1 and coach_id <> $2", [u.cell, u.coachId]);
  if (clash.rows[0]) throw new Error(`${name}'s cell is already used by CoachID ${clash.rows[0].coach_id} in the app.`);

  const cur = (await q.query<Row>("select * from users where coach_id = $1 for update", [u.coachId])).rows[0];
  if (!cur) {
    await q.query(
      `insert into users (coach_id, first_name, last_name, active, pin_hash, cell, email, verified_email,
                          thunder_request, thunder_coach, thunder_director,
                          scenic_city_request, scenic_city_coach, scenic_city_director, scenic_city_associations, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)`,
      [
        u.coachId, u.first, u.last, u.active, pinHash, u.cell, u.email, u.verifiedEmail,
        u.thunderRequest && !u.thunderCoach && !u.thunderDirector, u.thunderCoach, u.thunderDirector,
        u.scenicCityRequest, u.scenicCityCoach, u.scenicCityDirector, u.scenicCityAssociations, now,
      ],
    );
    return { coachId: u.coachId, name, status: "new", changes: [] };
  }

  // Same PIN: keep the stored hash. A PIN the person already chose in the app beats a starter PIN in the sheet.
  const samePin = u.pin ? await verifyPin(u.pin, cur.pin_hash) : await isStarterPin(cur.pin_hash);
  const keepAppPin = samePin || !u.pin;
  const next = {
    first_name: u.first,
    last_name: u.last,
    active: u.active,
    pin_hash: keepAppPin ? cur.pin_hash : pinHash,
    email: u.email ?? cur.email,
    verified_email: u.verifiedEmail ?? cur.verified_email,
    thunder_coach: cur.thunder_coach || u.thunderCoach,
    thunder_director: cur.thunder_director || u.thunderDirector,
  };
  const thunderRequest = (cur.thunder_request || u.thunderRequest) && !next.thunder_coach && !next.thunder_director;

  const changes: string[] = [];
  if (next.first_name !== cur.first_name || next.last_name !== cur.last_name) changes.push(`name ${cur.first_name} ${cur.last_name} → ${name}`);
  if (next.active !== cur.active) changes.push(next.active ? "activated" : "deactivated");
  if (next.pin_hash !== cur.pin_hash) changes.push("PIN from sheet");
  if (next.email !== cur.email) changes.push(`email ${cur.email ?? "(none)"} → ${next.email ?? "(none)"}`);
  if (next.verified_email !== cur.verified_email) changes.push("verified email");
  if (next.thunder_coach !== cur.thunder_coach) changes.push("+Coach");
  if (next.thunder_director !== cur.thunder_director) changes.push("+Director");

  await q.query(
    `update users set first_name = $2, last_name = $3, active = $4, pin_hash = $5, email = $6, verified_email = $7,
            thunder_request = $8, thunder_coach = $9, thunder_director = $10,
            scenic_city_request = $11, scenic_city_coach = $12, scenic_city_director = $13, scenic_city_associations = $14,
            updated_at = case when $15 then $16 else updated_at end
     where coach_id = $1`,
    [
      u.coachId, next.first_name, next.last_name, next.active, next.pin_hash, next.email, next.verified_email,
      thunderRequest, next.thunder_coach, next.thunder_director,
      u.scenicCityRequest, u.scenicCityCoach, u.scenicCityDirector, u.scenicCityAssociations, changes.length > 0, now,
    ],
  );
  return { coachId: u.coachId, name, status: changes.length ? "updated" : "unchanged", changes };
}
