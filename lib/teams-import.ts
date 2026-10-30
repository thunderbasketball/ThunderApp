// One-time import of the sheet's Teams tab. Safe to run again: existing teams (by name) are kept,
// and only staff they're missing are added (e.g. once more users exist).
import type { Pool, PoolClient } from "pg";
import { GRADES, gradeSort } from "./team-names";
import { withTx } from "./sql";
import { gradeLabel } from "./grades";

const ROLES = { CoachID: "HeadCoach", AsstID: "AsstCoach", ManagerID: "Manager", ParentID: "TeamParent" } as const;
type Role = (typeof ROLES)[keyof typeof ROLES];
const COACH_ROLES: Role[] = ["HeadCoach", "AsstCoach"];

export type SheetTeam = {
  row: number;
  name: string;
  gender: "Boys" | "Girls";
  grades: string[];
  level: "REC" | "COMP";
  staff: { role: Role; coachId: string }[];
  practiceLocations: string[];
};
export type TeamsProblem = { row: number; team?: string; message: string };

export function parseTeamsTab(rows: string[][]): { teams: SheetTeam[]; errors: TeamsProblem[]; warnings: TeamsProblem[] } {
  const errors: TeamsProblem[] = [];
  const warnings: TeamsProblem[] = [];
  const teams: SheetTeam[] = [];
  const h = (rows[0] ?? []).map((c) => c.trim().toLowerCase());
  const col = (name: string) => h.indexOf(name.toLowerCase());
  const missing = ["Grade", "Gender", "TeamID", "Level", "CoachID"].filter((c) => col(c) < 0);
  if (missing.length) return { teams, errors: [{ row: 1, message: `Missing column(s): ${missing.join(", ")}` }], warnings };

  const names = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const get = (c: string) => (col(c) < 0 ? "" : (r[col(c)] ?? "").trim());
    if (!r.some((c) => c.trim())) return;
    const name = get("TeamID").replace(/\s+/g, " ");
    const fail = (message: string) => errors.push({ row, team: name || undefined, message });
    if (!name) return fail("Missing TeamID (team name).");
    if (/^[=+\-@]/.test(name)) return fail("Team name can't start with = + - @.");
    if (names.has(name.toLowerCase())) return fail(`"${name}" appears twice.`);
    names.add(name.toLowerCase());

    const gender = /^b/i.test(get("Gender")) ? "Boys" : /^g/i.test(get("Gender")) ? "Girls" : null;
    if (!gender) return fail(`Can't read gender "${get("Gender")}".`);
    const gm = get("Grade").match(/^(k|kindergarten|\d{1,2})(st|nd|rd|th)?$/i);
    const grade = gm ? (/^k/i.test(gm[1]) ? "K" : String(Number(gm[1]))) : null;
    if (!grade || !(GRADES as readonly string[]).includes(grade)) return fail(`Can't read grade "${get("Grade")}".`);
    const level = get("Level").toUpperCase();
    if (level !== "REC" && level !== "COMP") return fail(`Level must be REC or COMP, not "${get("Level")}".`);

    const staff: SheetTeam["staff"] = [];
    for (const [c, role] of Object.entries(ROLES)) {
      for (const id of get(c)
        .split(/[\s,;/]+/)
        .filter(Boolean)) {
        if (!/^\d{7}$/.test(id)) warnings.push({ row, team: name, message: `${c} "${id}" isn't a 7-digit CoachID; skipped.` });
        else if (!staff.some((s) => s.coachId === id && s.role === role)) staff.push({ role, coachId: id });
      }
    }
    if (!staff.some((s) => s.role === "HeadCoach")) warnings.push({ row, team: name, message: "No head coach (CoachID)." });

    const prefix = name.match(/^(K|\d{1,2})([BG])\b/i);
    if (prefix && (prefix[1].toUpperCase() !== grade || prefix[2].toUpperCase() !== gender[0]))
      warnings.push({
        row,
        team: name,
        message: `Name says ${prefix[1]}${prefix[2].toUpperCase()} but the row says ${gradeLabel(grade)} ${gender}. Imported as ${gradeLabel(grade)}.`,
      });

    teams.push({
      row,
      name,
      gender,
      grades: [grade],
      level,
      staff,
      practiceLocations: get("Practice Locations")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  });
  return { teams, errors, warnings };
}

export type StaffOutcome = { role: Role; coachId: string; status: "user" | "newLogin" | "already" | "unmatched"; who?: string };
export type TeamOutcome = { name: string; status: "created" | "exists"; staff: StaffOutcome[] };

class DryRun extends Error {
  constructor(public result: TeamOutcome[]) {
    super("dry run");
  }
}

export async function importTeams(
  pool: Pool,
  parsed: ReturnType<typeof parseTeamsTab>,
  opts: { by: string; now: Date; dryRun: boolean },
): Promise<TeamOutcome[]> {
  if (parsed.errors.length) throw new Error(`The Teams tab has ${parsed.errors.length} error(s); nothing was changed.`);
  try {
    // A dry run does all the work, then rolls it back.
    return await withTx(pool, async (q) => {
      const out: TeamOutcome[] = [];
      for (const t of parsed.teams) out.push(await importOne(q, t, opts));
      if (opts.dryRun) throw new DryRun(out);
      return out;
    });
  } catch (e) {
    if (e instanceof DryRun) return e.result;
    throw e;
  }
}

async function importOne(q: PoolClient, t: SheetTeam, { by, now }: { by: string; now: Date }): Promise<TeamOutcome> {
  const ins = await q.query<{ id: string }>(
    `insert into teams (name, gender, grades, grade_sort, level, practice_locations, created_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (name) do nothing returning id::text`,
    [t.name, t.gender, t.grades, Math.max(...t.grades.map(gradeSort)), t.level, t.practiceLocations, now, by],
  );
  const created = !!ins.rows[0];
  const teamId = ins.rows[0]?.id ?? (await q.query<{ id: string }>("select id::text from teams where name = $1", [t.name])).rows[0].id;

  const staff: StaffOutcome[] = [];
  for (const s of t.staff) {
    const found = await findOrCreateUser(q, s.coachId, COACH_ROLES.includes(s.role), now);
    if (!found) {
      staff.push({ ...s, status: "unmatched" });
      continue;
    }
    // One person per role: a team keeps whoever already holds it.
    const r = await q.query(
      `insert into team_staff (team_id, coach_id, role, added_at, added_by)
       select $1, $2, $3, $4, $5
       where not exists (select 1 from team_staff where team_id = $1 and role = $3)
       on conflict do nothing`,
      [teamId, s.coachId, s.role, now, by],
    );
    staff.push({ ...s, status: r.rowCount ? found.status : "already", who: found.who });
  }
  return { name: t.name, status: created ? "created" : "exists", staff };
}

// An app user with that CoachID, or else a registration parent whose cell ends in it (gets a login, starter PIN 1234).
async function findOrCreateUser(
  q: PoolClient,
  coachId: string,
  isCoach: boolean,
  now: Date,
): Promise<{ status: "user" | "newLogin"; who: string } | null> {
  await q.query("select pg_advisory_xact_lock(hashtext('user:' || $1))", [coachId]);
  const u = await q.query<{ who: string }>("select first_name || ' ' || last_name as who from users where coach_id = $1", [coachId]);
  if (u.rows[0]) {
    if (isCoach) await q.query("select set_role($1, 'thunder', 'Coach', true, null), set_role($1, 'thunder', 'Request', false, null)", [coachId]);
    return { status: "user", who: u.rows[0].who };
  }
  const p = await q.query<{ first: string; last: string; cell: string; email: string | null }>(
    `select first, last, cell, email from (
       select trim(parent1_first) as first, trim(parent1_last) as last, parent1_cell as cell, parent1_email as email, 1 as pref
       from registrations where right(parent1_cell, 7) = $1
       union all
       select trim(parent2_first), trim(parent2_last), parent2_cell, parent2_email, 2
       from registrations where right(parent2_cell, 7) = $1
     ) x
     where cell ~ '^\\d{10}$' and nullif(first, '') is not null and nullif(last, '') is not null
     order by pref, email is null limit 1`,
    [coachId],
  );
  const v = p.rows[0];
  if (!v) return null;
  await q.query(
    `insert into users (coach_id, first_name, last_name, cell, email, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $6)`,
    [coachId, v.first, v.last, v.cell, v.email?.toLowerCase() ?? null, now],
  );
  if (isCoach) await q.query("select set_role($1, 'thunder', 'Coach', true, null), set_role($1, 'thunder', 'Request', false, null)", [coachId]);
  return { status: "newLogin", who: `${v.first} ${v.last}` };
}
