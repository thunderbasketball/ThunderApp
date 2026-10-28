// Director tools for practices: add a gym, add slots, blackout dates (block / restore).
// Slots are matched by Gym + Court + Time, and times are Eastern.
import type { Pool, PoolClient } from "pg";
import type { SessionUser } from "../auth/service";
import { withTx } from "../sql";
import { TZ, zonedTime } from "../time";

type Deps = { pool: Pool; now: () => Date };
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
class UserError extends Error {}

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
}
const directorOnly = { ok: false as const, message: "Only the Director can change gyms and practice slots." };
const by = (v: SessionUser) => `${v.firstName} ${v.lastName}`;

export const SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // 8 AM – 9 PM starts
const MAX_DAYS = 400;

// Gym and court names: start with a letter or digit; letters, digits, spaces, . ' & - after.
function cleanPlaceName(v: unknown, what: string): string {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!/^[\p{L}\d][\p{L}\d .'&-]{0,59}$/u.test(s)) throw new UserError(`Enter a valid ${what} (letters and numbers).`);
  return s;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^\d{1,18}$/.test(v);

function cleanRange(from: unknown, to: unknown): { from: string; to: string; days: { y: number; m: number; d: number; weekday: number; iso: string }[] } {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = typeof from === "string" ? from.match(re) : null;
  const b = typeof to === "string" ? to.match(re) : null;
  if (!a || !b) throw new UserError("Pick a From and To date.");
  const start = Date.UTC(+a[1], +a[2] - 1, +a[3]);
  const end = Date.UTC(+b[1], +b[2] - 1, +b[3]);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) throw new UserError("The To date must be on or after the From date.");
  if ((end - start) / 86_400_000 > MAX_DAYS) throw new UserError("Pick a range of about a year or less.");
  const days = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    days.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), weekday: d.getUTCDay(), iso: d.toISOString().slice(0, 10) });
  }
  return { from: from as string, to: to as string, days };
}

// ---- Gyms ----

export async function addGym(deps: Deps, viewer: SessionUser, input: { name: unknown; courts: unknown }): Promise<Result<{ id: string }>> {
  if (!viewer.isDirector) return directorOnly;
  return run(async () => {
    const name = cleanPlaceName(input.name, "gym name");
    const list = Array.isArray(input.courts) ? input.courts : [];
    if (list.length < 1 || list.length > 12) throw new UserError("A gym needs 1 to 12 courts.");
    const courts = list.map((c) => cleanPlaceName(c, "court name"));
    if (new Set(courts.map((c) => c.toLowerCase())).size !== courts.length) throw new UserError("Each court needs a different name.");
    return withTx(deps.pool, async (q) => {
      const g = await q.query<{ id: string }>("insert into gyms (name) values ($1) on conflict (name) do nothing returning id::text", [name]);
      if (!g.rows[0]) throw new UserError(`There's already a gym named "${name}".`);
      await q.query("insert into courts (gym_id, name) select $1, unnest($2::text[])", [g.rows[0].id, courts]);
      return { id: g.rows[0].id };
    });
  });
}

// ---- Slots ----

// Is this Eastern date/time blacked out for this gym? Returns the reason ("" if none given) or null.
async function blackoutFor(q: PoolClient, gymId: string, isoDay: string, minuteOfDay: number): Promise<string | null> {
  const r = await q.query<{ reason: string | null }>(
    `select reason from blackouts where day = $1 and (gym_id is null or gym_id = $2) and (minute_of_day is null or minute_of_day = $3)
     order by gym_id nulls last, minute_of_day nulls last limit 1`,
    [isoDay, gymId, minuteOfDay],
  );
  return r.rows[0] ? (r.rows[0].reason ?? "") : null;
}

export type AddSlotsInput = { gymId: unknown; courtId: unknown; from: unknown; to: unknown; days: unknown; hours: unknown };

// Creates a 60-minute slot for each court × chosen day × start time. Existing ones are skipped;
// slots on blacked-out dates come in blocked.
export async function addSlots(deps: Deps, viewer: SessionUser, input: AddSlotsInput): Promise<Result<{ added: number; skipped: number; blocked: number }>> {
  if (!viewer.isDirector) return directorOnly;
  return run(async () => {
    if (!isId(input.gymId)) throw new UserError("Pick a gym.");
    const range = cleanRange(input.from, input.to);
    const days = Array.isArray(input.days) ? input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    if (!days.length) throw new UserError("Pick at least one day.");
    const hours = Array.isArray(input.hours) ? input.hours.filter((h) => SLOT_HOURS.includes(h as number)) : [];
    if (!hours.length) throw new UserError("Pick at least one start time.");
    const gymId = input.gymId;
    return withTx(deps.pool, async (q) => {
      const courts = await q.query<{ id: string }>(
        input.courtId === "all"
          ? "select id::text from courts where gym_id = $1 and active order by name"
          : "select id::text from courts where gym_id = $1 and id = $2",
        input.courtId === "all" ? [gymId] : [gymId, isId(input.courtId) ? input.courtId : "0"],
      );
      if (!courts.rows.length) throw new UserError("Pick a court at that gym.");
      let added = 0;
      let skipped = 0;
      let blocked = 0;
      for (const day of range.days.filter((d) => days.includes(d.weekday)))
        for (const hour of hours as number[]) {
          const reason = await blackoutFor(q, gymId, day.iso, hour * 60);
          const startsAt = zonedTime(day.y, day.m, day.d, hour);
          for (const c of courts.rows) {
            const r = await q.query(
              `insert into slots (court_id, starts_at, blackout, note, booked_by, booked_at, created_by)
               values ($1, $2, $3, $4, $5, $6, $5) on conflict (court_id, starts_at) do nothing`,
              [c.id, startsAt, reason !== null, reason || null, by(viewer), reason !== null ? deps.now() : null],
            );
            if (!r.rowCount) skipped++;
            else {
              added++;
              if (reason !== null) blocked++;
            }
          }
        }
      return { added, skipped, blocked };
    });
  });
}

// ---- Blackouts ----

export type BlackoutInput = { mode: unknown; gymId: unknown; from: unknown; to: unknown; hour: unknown; reason: unknown };
export type RemovedBooking = { team: string; startsAt: Date; gym: string; court: string };

// Slots in scope: Eastern date in range, gym (or all), start hour (or all day). Past slots are never changed.
const scopeSql = `
  from slots s join courts c on c.id = s.court_id join gyms g on g.id = c.gym_id
  where (s.starts_at at time zone '${TZ}')::date between $1 and $2
    and ($3::bigint is null or c.gym_id = $3)
    and ($4::int is null or extract(hour from s.starts_at at time zone '${TZ}') * 60 + extract(minute from s.starts_at at time zone '${TZ}') = $4)
    and s.starts_at > $5`;

export async function blackoutDates(
  deps: Deps,
  viewer: SessionUser,
  input: BlackoutInput,
): Promise<Result<{ slots: number; removed: RemovedBooking[] }>> {
  if (!viewer.isDirector) return directorOnly;
  return run(async () => {
    const mode = input.mode === "block" || input.mode === "restore" ? input.mode : null;
    if (!mode) throw new UserError("Choose Block or Restore.");
    const range = cleanRange(input.from, input.to);
    const gymId = input.gymId === "all" ? null : isId(input.gymId) ? input.gymId : undefined;
    if (gymId === undefined) throw new UserError("Pick a gym.");
    const minute = input.hour === "all" ? null : SLOT_HOURS.includes(input.hour as number) ? (input.hour as number) * 60 : undefined;
    if (minute === undefined) throw new UserError("Pick a time.");
    const reasonText = typeof input.reason === "string" ? input.reason.trim().replace(/\s+/g, " ") : "";
    if (reasonText && !/^[\p{L}\d][\p{L}\d .,'&()/-]{0,79}$/u.test(reasonText)) throw new UserError("Keep the reason to letters, numbers and simple punctuation.");
    const reason = reasonText || null;
    const now = deps.now();
    const args = [range.from, range.to, gymId, minute, now];

    return withTx(deps.pool, async (q) => {
      if (gymId) {
        const g = await q.query("select 1 from gyms where id = $1", [gymId]);
        if (!g.rows[0]) throw new UserError("That gym no longer exists.");
      }
      // Bookings are changed below; lock the affected slots first.
      await q.query(`select s.id ${scopeSql} for update of s`, args);

      if (mode === "block") {
        await q.query(
          `insert into blackouts (day, gym_id, minute_of_day, reason, created_by)
           select d::date, $3, $4, $5, $6 from generate_series($1::date, $2::date, interval '1 day') d
           on conflict (day, coalesce(gym_id, 0), coalesce(minute_of_day, -1)) do update set reason = excluded.reason`,
          [range.from, range.to, gymId, minute, reason, by(viewer)],
        );
        const removed = await q.query<RemovedBooking>(
          `select t.name as team, s.starts_at as "startsAt", g.name as gym, c.name as court ${scopeSql.replace("from slots s", "from slots s join teams t on t.id = s.team_id")}
           order by s.starts_at, g.name, c.name`,
          args,
        );
        const r = await q.query(
          `update slots set blackout = true, team_id = null, note = $6, booked_by = $7, booked_at = $5
           where id in (select s.id ${scopeSql})`,
          [...args, reason, by(viewer)],
        );
        return { slots: r.rowCount ?? 0, removed: removed.rows };
      }

      // Restore. Restoring part of a wider blackout (one gym of "All Gyms", one time of "All Day") first splits it,
      // so the rest stays blacked out. Then remove the entries in scope and reopen slots no blackout still covers.
      if (gymId)
        await q.query(
          `insert into blackouts (day, gym_id, minute_of_day, reason, created_by)
           select b.day, g.id, b.minute_of_day, b.reason, b.created_by from blackouts b cross join gyms g
           where b.gym_id is null and g.id <> $3 and b.day between $1 and $2 and ($4::int is null or b.minute_of_day = $4 or b.minute_of_day is null)
           on conflict (day, coalesce(gym_id, 0), coalesce(minute_of_day, -1)) do nothing`,
          [range.from, range.to, gymId, minute],
        );
      if (minute !== null)
        await q.query(
          `insert into blackouts (day, gym_id, minute_of_day, reason, created_by)
           select b.day, b.gym_id, h * 60, b.reason, b.created_by from blackouts b cross join unnest($5::int[]) h
           where b.minute_of_day is null and h * 60 <> $4 and b.day between $1 and $2 and ($3::bigint is null or b.gym_id is null or b.gym_id = $3)
           on conflict (day, coalesce(gym_id, 0), coalesce(minute_of_day, -1)) do nothing`,
          [range.from, range.to, gymId, minute, SLOT_HOURS],
        );
      await q.query(
        `delete from blackouts where day between $1 and $2 and ($3::bigint is null or gym_id = $3 or gym_id is null)
           and ($4::int is null or minute_of_day = $4 or minute_of_day is null)`,
        [range.from, range.to, gymId, minute],
      );
      const r = await q.query(
        `update slots set blackout = false, note = null, booked_by = null, booked_at = null
         where id in (select s.id ${scopeSql} and s.blackout
                        and not exists (select 1 from blackouts b
                                        where b.day = (s.starts_at at time zone '${TZ}')::date
                                          and (b.gym_id is null or b.gym_id = c.gym_id)
                                          and (b.minute_of_day is null or b.minute_of_day =
                                               extract(hour from s.starts_at at time zone '${TZ}') * 60 + extract(minute from s.starts_at at time zone '${TZ}'))))`,
        args,
      );
      return { slots: r.rowCount ?? 0, removed: [] };
    });
  });
}
