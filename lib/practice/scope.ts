// Blocking and reopening slots in a scope: Eastern dates, gym (or all), start minute (or all day).
// Shared by one-off blackouts, yearly blackout rules, and the Director's per-slot Block.
// Past slots are never changed. Callers run these inside a transaction.
import type { PoolClient } from "pg";
import { TZ } from "../time";

export type Scope = { from: string; to: string; gymId: string | null; minute: number | null; now: Date };
export type RemovedBooking = { team: string; startsAt: Date; gym: string; court: string };

const localMinute = `extract(hour from s.starts_at at time zone '${TZ}') * 60 + extract(minute from s.starts_at at time zone '${TZ}')`;

// $1 from, $2 to, $3 gym (or null), $4 minute (or null), $5 now
export const scopeSql = `
  from slots s join courts c on c.id = s.court_id join gyms g on g.id = c.gym_id
  where (s.starts_at at time zone '${TZ}')::date between $1 and $2
    and ($3::bigint is null or c.gym_id = $3)
    and ($4::int is null or ${localMinute} = $4)
    and s.starts_at > $5`;

const args = (s: Scope) => [s.from, s.to, s.gymId, s.minute, s.now];

// Records the blackout dates and blocks every slot in scope, removing team bookings. Returns what was removed.
export async function blockScope(
  q: PoolClient,
  s: Scope,
  opts: { reason: string | null; by: string; ruleId?: string | null },
): Promise<{ slots: number; removed: RemovedBooking[] }> {
  await q.query(`select s.id ${scopeSql} for update of s`, args(s));
  await q.query(
    `insert into blackouts (day, gym_id, minute_of_day, reason, created_by, rule_id)
     select d::date, $3, $4, $5, $6, $7 from generate_series($1::date, $2::date, interval '1 day') d
     on conflict (day, coalesce(gym_id, 0), coalesce(minute_of_day, -1)) do update set reason = coalesce(excluded.reason, blackouts.reason)`,
    [s.from, s.to, s.gymId, s.minute, opts.reason, opts.by, opts.ruleId ?? null],
  );
  const removed = await q.query<RemovedBooking>(
    `select t.name as team, s.starts_at as "startsAt", g.name as gym, c.name as court
     ${scopeSql.replace("from slots s", "from slots s join teams t on t.id = s.team_id")}
     order by s.starts_at, g.name, c.name`,
    args(s),
  );
  const r = await q.query(
    `update slots set blackout = true, team_id = null, note = $6, booked_by = $7, booked_at = $5
     where id in (select s.id ${scopeSql}) and not (blackout and note is not distinct from $6)`,
    [...args(s), opts.reason, opts.by],
  );
  return { slots: r.rowCount ?? 0, removed: removed.rows };
}

// Reopens blocked slots in scope that no blackout entry still covers.
export async function reopenScope(q: PoolClient, s: Scope): Promise<number> {
  const r = await q.query(
    `update slots set blackout = false, note = null, booked_by = null, booked_at = null
     where id in (select s.id ${scopeSql} and s.blackout
                    and not exists (select 1 from blackouts b
                                    where b.day = (s.starts_at at time zone '${TZ}')::date
                                      and (b.gym_id is null or b.gym_id = c.gym_id)
                                      and (b.minute_of_day is null or b.minute_of_day = ${localMinute})))`,
    args(s),
  );
  return r.rowCount ?? 0;
}
