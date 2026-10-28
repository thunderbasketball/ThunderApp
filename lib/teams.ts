// Teams: list, view, create and edit, and team staff.
// The Director edits everything; a team's head coach can add and remove its other staff.
import type { Pool, PoolClient } from "pg";
import type { SessionUser } from "./auth/service";
import { cleanEmail, cleanName } from "./auth/validate";
import { coachIdFromCell, normalizeCell } from "./phone";
import { withTx } from "./sql";
import { GRADES, LEVELS, gradeSort, teamName } from "./team-names";

export { GRADES, LEVELS, teamName } from "./team-names";

export const ROLES = ["HeadCoach", "AsstCoach", "Manager", "TeamParent"] as const;
export type Role = (typeof ROLES)[number];
const COACH_ROLES: Role[] = ["HeadCoach", "AsstCoach"];

type Deps = { pool: Pool; now: () => Date };
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

// A problem to show the user; rolls the transaction back.
class UserError extends Error {}

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    throw e;
  }
}

const byOf = (v: SessionUser) => `${v.firstName} ${v.lastName}`;

// ---- Reading ----

export type TeamListItem = {
  id: string;
  name: string;
  gender: "Boys" | "Girls";
  grades: string[];
  level: string;
  createdBy: string;
  practiceLocations: string[];
  headCoach: { first: string; last: string; cell: string } | null;
};

// Director only. Grouped by Gender, then top grade; sorted by name.
export async function listTeams(deps: Deps, viewer: SessionUser): Promise<TeamListItem[]> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await deps.pool.query<TeamListItem & { hFirst: string | null; hLast: string; hCell: string }>(
    `select t.id::text, t.name, t.gender, t.grades, t.level, t.created_by as "createdBy", t.practice_locations as "practiceLocations",
            u.first_name as "hFirst", u.last_name as "hLast", u.cell as "hCell"
     from teams t
     left join team_staff s on s.team_id = t.id and s.role = 'HeadCoach'
     left join users u on u.coach_id = s.coach_id
     order by t.gender, t.grade_sort, lower(t.name)`,
  );
  return r.rows.map(({ hFirst, hLast, hCell, ...t }) => ({
    ...t,
    grades: sortGrades(t.grades),
    headCoach: hFirst === null ? null : { first: hFirst, last: hLast, cell: hCell },
  }));
}

const sortGrades = (g: string[]) => [...g].sort((a, b) => gradeSort(a) - gradeSort(b));

export type StaffMember = {
  coachId: string;
  role: Role;
  firstName: string;
  lastName: string;
  cell: string;
  email: string | null;
  addedBy: string;
};

export type TeamDetail = Omit<TeamListItem, "headCoach"> & {
  staff: StaffMember[];
  canEditTeam: boolean;
  canEditStaff: boolean;
};

const roleOrder = `array_position(array['HeadCoach','AsstCoach','Manager','TeamParent'], s.role)`;

// The Director, or this team's head coach. Null if the viewer can't see the team.
export async function getTeam(deps: Deps, viewer: SessionUser, id: string): Promise<TeamDetail | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const t = await deps.pool.query<Omit<TeamListItem, "headCoach">>(
    `select id::text, name, gender, grades, level, created_by as "createdBy", practice_locations as "practiceLocations"
     from teams where id = $1`,
    [id],
  );
  if (!t.rows[0]) return null;
  const staff = await deps.pool.query<StaffMember>(
    `select s.coach_id as "coachId", s.role, u.first_name as "firstName", u.last_name as "lastName", u.cell, u.email,
            s.added_by as "addedBy"
     from team_staff s join users u on u.coach_id = s.coach_id
     where s.team_id = $1
     order by ${roleOrder}, lower(u.last_name), lower(u.first_name)`,
    [id],
  );
  const isHead = staff.rows.some((s) => s.role === "HeadCoach" && s.coachId === viewer.coachId);
  if (!viewer.isDirector && !isHead) return null;
  return {
    ...t.rows[0],
    grades: sortGrades(t.rows[0].grades),
    staff: staff.rows,
    canEditTeam: viewer.isDirector,
    canEditStaff: viewer.isDirector || isHead,
  };
}

export type PersonOption = {
  value: string; // "user:<coachId>" or "volunteer:<registrantId>"
  firstName: string;
  lastName: string;
  detail: string;
  gender?: "Boys" | "Girls";
  grade?: string;
};

// Director only. Active app users, plus registration volunteers who don't have a login yet (matched by cell).
export async function personOptions(deps: Deps, viewer: SessionUser): Promise<{ users: PersonOption[]; volunteers: PersonOption[] }> {
  if (!viewer.isDirector) throw new Error("Director only");
  const users = await deps.pool.query<PersonOption>(
    `select 'user:' || coach_id as value, first_name as "firstName", last_name as "lastName",
            case when thunder_director then 'Director' when thunder_coach then 'Coach' else 'User' end as detail
     from users where active order by lower(last_name), lower(first_name)`,
  );
  const volunteers = await deps.pool.query<PersonOption>(
    `select distinct on (r.parent1_cell) 'volunteer:' || r.registrant_id as value,
            trim(r.parent1_first) as "firstName", trim(r.parent1_last) as "lastName",
            r.coaching_interest || ' · parent of ' || r.first_name as detail, r.gender, r.grade
     from registrations r
     where r.coaching_interest is not null and r.parent1_cell ~ '^\\d{10}$'
       and nullif(trim(r.parent1_first), '') is not null and nullif(trim(r.parent1_last), '') is not null
       and not exists (select 1 from users u where u.cell = r.parent1_cell)
     order by r.parent1_cell, r.coaching_interest ilike 'head%' desc, r.grade_sort`,
  );
  const byName = (a: PersonOption, b: PersonOption) =>
    a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" }) ||
    a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" });
  return { users: users.rows, volunteers: volunteers.rows.sort(byName) };
}

// ---- People ----

// Who to put on a team: an app user, a registration volunteer, or a new person typed in.
// Volunteers and new people get a login (starter PIN 1234). Coach roles also get the Coach flag.
export type PersonInput = unknown;
type NewPerson = { first: unknown; last: unknown; cell: unknown; email: unknown };

async function resolvePerson(
  q: PoolClient,
  person: PersonInput,
  isCoach: boolean,
  now: Date,
): Promise<{ coachId: string; lastName: string; who: string; newLogin: boolean }> {
  let found: { coachId: string; lastName: string; who: string; newLogin: boolean };
  const m = typeof person === "string" ? person.match(/^(user|volunteer):(\d{1,20})$/) : null;

  if (m?.[1] === "user") {
    const u = await q.query<{ coach_id: string; first_name: string; last_name: string }>(
      "select coach_id, first_name, last_name from users where coach_id = $1 and active for update",
      [m[2]],
    );
    if (!u.rows[0]) throw new UserError("That person isn't an active user.");
    const x = u.rows[0];
    found = { coachId: x.coach_id, lastName: x.last_name, who: `${x.first_name} ${x.last_name}`, newLogin: false };
  } else if (m?.[1] === "volunteer") {
    const r = await q.query<{ first: string; last: string; cell: string; email: string | null }>(
      `select trim(parent1_first) as first, trim(parent1_last) as last, parent1_cell as cell, parent1_email as email
       from registrations where registrant_id = $1 and coaching_interest is not null`,
      [m[2]],
    );
    const v = r.rows[0];
    const first = cleanName(v?.first);
    const last = cleanName(v?.last);
    if (!v || !first || !last || !/^\d{10}$/.test(v.cell ?? ""))
      throw new UserError("That volunteer needs a name and a 10-digit cell before they can be added.");
    found = await createOrMatchUser(q, { first, last, cell: v.cell, email: cleanEmail(v.email) }, isCoach, now);
  } else if (person && typeof person === "object") {
    const p = person as NewPerson;
    const first = cleanName(p.first);
    const last = cleanName(p.last);
    const cell = typeof p.cell === "string" ? normalizeCell(p.cell) : null;
    const emailText = typeof p.email === "string" ? p.email.trim() : "";
    const email = emailText ? cleanEmail(emailText) : null;
    if (!first || !last) throw new UserError("Enter a first and last name (letters only).");
    if (!cell) throw new UserError("Enter a 10-digit cell number.");
    if (emailText && !email) throw new UserError("That email doesn't look right.");
    found = await createOrMatchUser(q, { first, last, cell, email }, isCoach, now);
  } else {
    throw new UserError("Pick a person.");
  }

  if (isCoach)
    await q.query("update users set thunder_coach = true, thunder_request = false, updated_at = $2 where coach_id = $1 and not thunder_coach", [
      found.coachId,
      now,
    ]);
  return found;
}

// Uses the existing user with this cell, or creates one. Refuses a cell whose last 7 digits belong to someone else.
async function createOrMatchUser(
  q: PoolClient,
  p: { first: string; last: string; cell: string; email: string | null },
  isCoach: boolean,
  now: Date,
): Promise<{ coachId: string; lastName: string; who: string; newLogin: boolean }> {
  const coachId = coachIdFromCell(p.cell);
  await q.query("select pg_advisory_xact_lock(hashtext('user:' || $1))", [coachId]);
  const existing = await q.query<{ cell: string; first_name: string; last_name: string; active: boolean }>(
    "select cell, first_name, last_name, active from users where coach_id = $1",
    [coachId],
  );
  const e = existing.rows[0];
  if (e && e.cell !== p.cell)
    throw new UserError(`${p.first} ${p.last}'s cell ends in the same 7 digits as ${e.first_name} ${e.last_name}'s. Please contact support.`);
  if (e && !e.active) throw new UserError(`${e.first_name} ${e.last_name} has a deactivated account.`);
  if (e) return { coachId, lastName: e.last_name, who: `${e.first_name} ${e.last_name}`, newLogin: false };
  await q.query(
    `insert into users (coach_id, first_name, last_name, cell, email, thunder_coach, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [coachId, p.first, p.last, p.cell, p.email, isCoach, now],
  );
  return { coachId, lastName: p.last, who: `${p.first} ${p.last}`, newLogin: true };
}

// ---- Team fields ----

function cleanTeamFields(input: { gender: unknown; grades: unknown; level: unknown }) {
  const gender: "Boys" | "Girls" | null = input.gender === "Boys" || input.gender === "Girls" ? input.gender : null;
  if (!gender) throw new UserError("Pick Boys or Girls.");
  const grades = Array.isArray(input.grades) ? [...new Set(input.grades)] : [];
  if (!grades.length || !grades.every((g) => (GRADES as readonly unknown[]).includes(g))) throw new UserError("Pick at least one grade.");
  const level = (LEVELS as readonly unknown[]).includes(input.level) ? (input.level as string) : null;
  if (!level) throw new UserError("Pick REC or COMP.");
  return { gender, grades: grades as string[], level, gradeSort: Math.max(...(grades as string[]).map(gradeSort)) };
}

// Gym names: start with a letter or digit, then letters, digits, spaces and . ' & -.
function cleanLocations(v: unknown): string[] {
  const list = typeof v === "string" ? v.split(",") : Array.isArray(v) ? v : [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const s = raw.trim().replace(/\s+/g, " ");
    if (!s) continue;
    if (!/^[\p{L}\d][\p{L}\d .'&-]{0,59}$/u.test(s)) throw new UserError(`"${s}" isn't a valid gym name.`);
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  if (out.length > 20) throw new UserError("That's too many practice locations.");
  return out;
}

// Re-applies the naming rule after a change. With no head coach, the current last name is kept.
async function rename(q: PoolClient, teamId: string): Promise<string> {
  const t = await q.query<{ name: string; gender: "Boys" | "Girls"; grades: string[]; head_last: string | null }>(
    `select t.name, t.gender, t.grades, u.last_name as head_last
     from teams t
     left join team_staff s on s.team_id = t.id and s.role = 'HeadCoach'
     left join users u on u.coach_id = s.coach_id
     where t.id = $1`,
    [teamId],
  );
  const r = t.rows[0];
  const name = teamName(r.gender, r.grades, r.head_last ?? (r.name.replace(/^\S+\s*/, "") || "Team"));
  if (name === r.name) return name;
  const clash = await q.query("select 1 from teams where lower(name) = lower($1) and id <> $2", [name, teamId]);
  if (clash.rows[0]) throw new UserError(`That would rename the team to "${name}", but that name is taken.`);
  await q.query("update teams set name = $2 where id = $1", [teamId, name]);
  return name;
}

export type CreateTeamInput = { gender: unknown; grades: unknown; level: unknown; headCoach: unknown };
export type CreateTeamResult = Result<{ id: string; name: string }>;

export async function createTeam(deps: Deps, viewer: SessionUser, input: CreateTeamInput): Promise<CreateTeamResult> {
  if (!viewer.isDirector) return { ok: false, message: "Only the Director can create teams." };
  const now = deps.now();
  const by = byOf(viewer);
  return run(async () => {
    const f = cleanTeamFields(input);
    if (typeof input.headCoach !== "string" || !input.headCoach) throw new UserError("Pick a head coach.");
    if (!/^(user|volunteer):\d{1,20}$/.test(input.headCoach)) throw new UserError("Pick a head coach.");
    return withTx(deps.pool, async (q) => {
      const head = await resolvePerson(q, input.headCoach, true, now);
      const name = teamName(f.gender, f.grades, head.lastName);
      const t = await q.query<{ id: string }>(
        `insert into teams (name, gender, grades, grade_sort, level, created_at, created_by)
         values ($1, $2, $3, $4, $5, $6, $7) on conflict (name) do nothing returning id::text`,
        [name, f.gender, f.grades, f.gradeSort, f.level, now, by],
      );
      if (!t.rows[0]) throw new UserError(`There's already a team named "${name}".`);
      await q.query("insert into team_staff (team_id, coach_id, role, added_at, added_by) values ($1, $2, 'HeadCoach', $3, $4)", [
        t.rows[0].id,
        head.coachId,
        now,
        by,
      ]);
      return { id: t.rows[0].id, name };
    });
  });
}

export type UpdateTeamInput = { gender: unknown; grades: unknown; level: unknown; practiceLocations: unknown };

// Director only. The name follows the new grades/gender.
export async function updateTeam(deps: Deps, viewer: SessionUser, id: string, input: UpdateTeamInput): Promise<Result<{ name: string }>> {
  if (!viewer.isDirector) return { ok: false, message: "Only the Director can edit a team." };
  return run(async () => {
    const f = cleanTeamFields(input);
    const locations = cleanLocations(input.practiceLocations);
    return withTx(deps.pool, async (q) => {
      const r = await q.query("update teams set gender = $2, grades = $3, grade_sort = $4, level = $5, practice_locations = $6 where id = $1", [
        id,
        f.gender,
        f.grades,
        f.gradeSort,
        f.level,
        locations,
      ]);
      if (!r.rowCount) throw new UserError("That team no longer exists.");
      return { name: await rename(q, id) };
    });
  });
}

// ---- Staff ----

async function lockTeamForStaff(q: PoolClient, viewer: SessionUser, teamId: string, role: Role) {
  const t = await q.query("select 1 from teams where id = $1 for update", [teamId]);
  if (!t.rows[0]) throw new UserError("That team no longer exists.");
  if (viewer.isDirector) return;
  // A head coach can manage their own team's other staff, but not the head coach spot.
  const head = await q.query("select 1 from team_staff where team_id = $1 and role = 'HeadCoach' and coach_id = $2", [teamId, viewer.coachId]);
  if (!head.rows[0]) throw new UserError("Only the Director or this team's head coach can change staff.");
  if (role === "HeadCoach") throw new UserError("Only the Director can change the head coach.");
}

export type AddStaffResult = Result<{ who: string; newLogin: boolean; name: string }>;

// Adding a head coach replaces the current one and renames the team.
export async function addStaff(deps: Deps, viewer: SessionUser, teamId: string, input: { role: unknown; person: unknown }): Promise<AddStaffResult> {
  const role = (ROLES as readonly unknown[]).includes(input.role) ? (input.role as Role) : null;
  if (!role) return { ok: false, message: "Pick a role." };
  if (!/^\d{1,18}$/.test(teamId)) return { ok: false, message: "That team no longer exists." };
  const now = deps.now();
  const by = byOf(viewer);
  return run(() =>
    withTx(deps.pool, async (q) => {
      await lockTeamForStaff(q, viewer, teamId, role);
      const p = await resolvePerson(q, input.person, COACH_ROLES.includes(role), now);
      if (role === "HeadCoach") await q.query("delete from team_staff where team_id = $1 and role = 'HeadCoach'", [teamId]);
      const r = await q.query(
        "insert into team_staff (team_id, coach_id, role, added_at, added_by) values ($1, $2, $3, $4, $5) on conflict do nothing",
        [teamId, p.coachId, role, now, by],
      );
      if (!r.rowCount) throw new UserError(`${p.who} is already ${roleLabel(role)} on this team.`);
      return { who: p.who, newLogin: p.newLogin, name: role === "HeadCoach" ? await rename(q, teamId) : "" };
    }),
  );
}

export async function removeStaff(
  deps: Deps,
  viewer: SessionUser,
  teamId: string,
  input: { coachId: unknown; role: unknown },
): Promise<Result> {
  const role = (ROLES as readonly unknown[]).includes(input.role) ? (input.role as Role) : null;
  if (!role || typeof input.coachId !== "string" || !/^\d{7}$/.test(input.coachId)) return { ok: false, message: "Pick a staff member." };
  if (!/^\d{1,18}$/.test(teamId)) return { ok: false, message: "That team no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      await lockTeamForStaff(q, viewer, teamId, role);
      await q.query("delete from team_staff where team_id = $1 and coach_id = $2 and role = $3", [teamId, input.coachId, role]);
      return {};
    }),
  );
}

export function roleLabel(role: Role): string {
  return { HeadCoach: "Head Coach", AsstCoach: "Assistant Coach", Manager: "Manager", TeamParent: "Team Parent" }[role];
}
