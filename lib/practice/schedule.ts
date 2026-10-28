// Reading the practice schedule: one Mon–Sun week at a time, grouped by date, then gym, sorted by time.
import type { Pool } from "pg";
import type { SessionUser } from "../auth/service";
import { TZ, localParts, weekOf, zonedTime } from "../time";

export type ScheduleSlot = {
  id: string;
  startsAt: Date;
  court: string;
  teamId: string | null;
  team: string | null;
  bookedBy: string | null;
  blackout: boolean;
  note: string | null;
};
export type ScheduleDay = { iso: string; label: string; gyms: { gym: string; slots: ScheduleSlot[] }[] };
export type GymWithCourts = { id: string; name: string; active: boolean; courts: { id: string; name: string; active: boolean }[] };

type Deps = { pool: Pool; now: () => Date };

const isoOf = (d: Date) => {
  const p = localParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

// The Monday (Eastern) that starts the week to show: the one asked for, else this week,
// else the week of the next upcoming slot when this week has none.
export async function pickWeek(deps: Deps, asked: string | undefined): Promise<Date> {
  const m = asked?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return weekOf(zonedTime(+m[1], +m[2], +m[3], 12)).start;
  const now = deps.now();
  const w = weekOf(now);
  const here = await deps.pool.query("select 1 from slots where starts_at >= $1 and starts_at < $2 limit 1", [w.start, w.end]);
  if (here.rows[0]) return w.start;
  const next = await deps.pool.query<{ starts_at: Date }>("select starts_at from slots where starts_at > $1 order by starts_at limit 1", [
    now,
  ]);
  return next.rows[0] ? weekOf(next.rows[0].starts_at).start : w.start;
}

// Director only for now; coach views come with booking.
export async function weekSchedule(
  deps: Deps,
  viewer: SessionUser,
  weekStart: Date,
): Promise<{ days: ScheduleDay[]; prev: string; next: string; label: string }> {
  if (!viewer.isDirector) throw new Error("Director only");
  const end = weekOf(weekStart).end;
  const r = await deps.pool.query<ScheduleSlot & { gym: string }>(
    `select s.id::text, s.starts_at as "startsAt", g.name as gym, c.name as court, s.team_id::text as "teamId", t.name as team,
            s.booked_by as "bookedBy", s.blackout, s.note
     from slots s join courts c on c.id = s.court_id join gyms g on g.id = c.gym_id left join teams t on t.id = s.team_id
     where s.starts_at >= $1 and s.starts_at < $2
     order by (s.starts_at at time zone '${TZ}')::date, g.name, s.starts_at, c.name`,
    [weekStart, end],
  );
  const days: ScheduleDay[] = [];
  for (const { gym, ...s } of r.rows) {
    const iso = isoOf(s.startsAt);
    let day = days.at(-1);
    if (!day || day.iso !== iso) {
      day = {
        iso,
        label: s.startsAt.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" }),
        gyms: [],
      };
      days.push(day);
    }
    let g = day.gyms.at(-1);
    if (!g || g.gym !== gym) day.gyms.push((g = { gym, slots: [] }));
    g.slots.push(s);
  }
  const shift = (days: number) => isoOf(new Date(weekStart.getTime() + days * 86_400_000 + 12 * 3_600_000));
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
  return { days, prev: shift(-7), next: shift(7), label: `${fmt(weekStart)} – ${fmt(new Date(end.getTime() - 86_400_000))}` };
}

export async function listGyms(deps: Deps): Promise<GymWithCourts[]> {
  const r = await deps.pool.query<{ id: string; name: string; active: boolean; courts: GymWithCourts["courts"] }>(
    `select g.id::text, g.name, g.active,
            coalesce(json_agg(json_build_object('id', c.id::text, 'name', c.name, 'active', c.active) order by c.name) filter (where c.id is not null), '[]') as courts
     from gyms g left join courts c on c.gym_id = g.id group by g.id order by g.name`,
  );
  return r.rows;
}
