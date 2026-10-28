// Teams: list, head coach choices, and creating a team (Director only).
import type { Pool } from "pg";
import type { SessionUser } from "./auth/service";
import { coachIdFromCell } from "./phone";
import { withTx } from "./sql";
import { GRADES, LEVELS, gradeSort, teamName } from "./team-names";

export { GRADES, LEVELS, teamName } from "./team-names";

type Deps = { pool: Pool; now: () => Date };

export type TeamListItem = {
  id: string;
  name: string;
  gender: "Boys" | "Girls";
  grades: string[];
  level: string;
  createdBy: string;
  headCoach: { first: string; last: string; cell: string } | null;
};

// Director only. Grouped by Gender, then top grade; sorted by name.
export async function listTeams(deps: Deps, viewer: SessionUser): Promise<TeamListItem[]> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await deps.pool.query<TeamListItem & { hFirst: string | null; hLast: string; hCell: string }>(
    `select t.id::text, t.name, t.gender, t.grades, t.level, t.created_by as "createdBy",
            u.first_name as "hFirst", u.last_name as "hLast", u.cell as "hCell"
     from teams t
     left join team_staff s on s.team_id = t.id and s.role = 'HeadCoach'
     left join users u on u.coach_id = s.coach_id
     order by t.gender, t.grade_sort, lower(t.name)`,
  );
  return r.rows.map(({ hFirst, hLast, hCell, ...t }) => ({
    ...t,
    grades: [...t.grades].sort((a, b) => gradeSort(a) - gradeSort(b)),
    headCoach: hFirst === null ? null : { first: hFirst, last: hLast, cell: hCell },
  }));
}

export type HeadCoachOption = {
  value: string; // "user:<coachId>" or "volunteer:<registrantId>"
  firstName: string;
  lastName: string;
  detail: string;
  gender?: "Boys" | "Girls";
  grade?: string;
};

// Director only. Active app users, plus registration volunteers who don't have a login yet (matched by cell).
export async function headCoachOptions(deps: Deps, viewer: SessionUser): Promise<{ users: HeadCoachOption[]; volunteers: HeadCoachOption[] }> {
  if (!viewer.isDirector) throw new Error("Director only");
  const users = await deps.pool.query<HeadCoachOption>(
    `select 'user:' || coach_id as value, first_name as "firstName", last_name as "lastName",
            case when thunder_director then 'Director' when thunder_coach then 'Coach' else 'User' end as detail
     from users where active order by lower(last_name), lower(first_name)`,
  );
  const volunteers = await deps.pool.query<HeadCoachOption>(
    `select distinct on (r.parent1_cell) 'volunteer:' || r.registrant_id as value,
            trim(r.parent1_first) as "firstName", trim(r.parent1_last) as "lastName",
            r.coaching_interest || ' · parent of ' || r.first_name as detail, r.gender, r.grade
     from registrations r
     where r.coaching_interest is not null and r.parent1_cell ~ '^\\d{10}$'
       and nullif(trim(r.parent1_first), '') is not null and nullif(trim(r.parent1_last), '') is not null
       and not exists (select 1 from users u where u.cell = r.parent1_cell)
     order by r.parent1_cell, r.coaching_interest ilike 'head%' desc, r.grade_sort`,
  );
  const byName = (a: HeadCoachOption, b: HeadCoachOption) =>
    a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" }) ||
    a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" });
  return { users: users.rows, volunteers: volunteers.rows.sort(byName) };
}

export type CreateTeamInput = { gender: unknown; grades: unknown; level: unknown; headCoach: unknown };
export type CreateTeamResult = { ok: true; id: string; name: string } | { ok: false; message: string };

export async function createTeam(deps: Deps, viewer: SessionUser, input: CreateTeamInput): Promise<CreateTeamResult> {
  if (!viewer.isDirector) return { ok: false, message: "Only the Director can create teams." };

  const gender = input.gender === "Boys" || input.gender === "Girls" ? input.gender : null;
  if (!gender) return { ok: false, message: "Pick Boys or Girls." };
  const grades = Array.isArray(input.grades) ? [...new Set(input.grades)] : [];
  if (!grades.length || !grades.every((g) => (GRADES as readonly unknown[]).includes(g)))
    return { ok: false, message: "Pick at least one grade." };
  const level = (LEVELS as readonly unknown[]).includes(input.level) ? (input.level as string) : null;
  if (!level) return { ok: false, message: "Pick REC or COMP." };
  const m = typeof input.headCoach === "string" ? input.headCoach.match(/^(user|volunteer):(\d{1,20})$/) : null;
  if (!m) return { ok: false, message: "Pick a head coach." };

  const by = `${viewer.firstName} ${viewer.lastName}`;
  const now = deps.now();
  try {
    return await withTx(deps.pool, async (q) => {
      let coachId: string;
      let lastName: string;
      if (m[1] === "user") {
        const u = await q.query<{ coach_id: string; last_name: string }>(
          "select coach_id, last_name from users where coach_id = $1 and active for update",
          [m[2]],
        );
        if (!u.rows[0]) throw new UserError("That coach isn't an active user.");
        coachId = u.rows[0].coach_id;
        lastName = u.rows[0].last_name;
      } else {
        // A volunteer from registration: create their login (starter PIN 1234, Coach role).
        const r = await q.query<{ first: string; last: string; cell: string; email: string | null }>(
          `select trim(parent1_first) as first, trim(parent1_last) as last, parent1_cell as cell, parent1_email as email
           from registrations where registrant_id = $1 and coaching_interest is not null`,
          [m[2]],
        );
        const v = r.rows[0];
        if (!v || !v.first || !v.last || !/^\d{10}$/.test(v.cell ?? ""))
          throw new UserError("That volunteer needs a name and a 10-digit cell before they can coach.");
        coachId = coachIdFromCell(v.cell);
        await q.query("select pg_advisory_xact_lock(hashtext('user:' || $1))", [coachId]);
        const clash = await q.query<{ cell: string; first_name: string; last_name: string }>(
          "select cell, first_name, last_name from users where coach_id = $1",
          [coachId],
        );
        if (clash.rows[0] && clash.rows[0].cell !== v.cell)
          throw new UserError(
            `${v.first} ${v.last}'s cell ends in the same 7 digits as ${clash.rows[0].first_name} ${clash.rows[0].last_name}'s. Add them as a user by hand.`,
          );
        if (!clash.rows[0])
          await q.query(
            `insert into users (coach_id, first_name, last_name, cell, email, thunder_coach) values ($1, $2, $3, $4, $5, true)`,
            [coachId, v.first, v.last, v.cell, v.email?.toLowerCase() ?? null],
          );
        lastName = v.last;
      }
      await q.query("update users set thunder_coach = true, thunder_request = false, updated_at = $2 where coach_id = $1 and not thunder_coach", [
        coachId,
        now,
      ]);

      const name = teamName(gender, grades as string[], lastName);
      const t = await q.query<{ id: string }>(
        `insert into teams (name, gender, grades, grade_sort, level, created_at, created_by)
         values ($1, $2, $3, $4, $5, $6, $7) on conflict (name) do nothing returning id::text`,
        [name, gender, grades, Math.max(...(grades as string[]).map(gradeSort)), level, now, by],
      );
      if (!t.rows[0]) throw new UserError(`There's already a team named "${name}".`);
      await q.query("insert into team_staff (team_id, coach_id, role, added_at, added_by) values ($1, $2, 'HeadCoach', $3, $4)", [
        t.rows[0].id,
        coachId,
        now,
        by,
      ]);
      return { ok: true as const, id: t.rows[0].id, name };
    });
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
}

// A problem to show the Director; rolls the transaction back.
class UserError extends Error {}
