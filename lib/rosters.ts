// Team rosters (SPEC.md section 3): the Director puts registered players on a team. The team's staff can see them
// (and take practice attendance from the list). Who rostered each player is recorded.
import type { Pool } from "pg";
import type { SessionUser } from "./auth/service";
import { withTx } from "./sql";

type Deps = { pool: Pool; now: () => Date };
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const directorOnly = { ok: false as const, message: "Only the Director can change rosters." };
const isId = (v: unknown): v is string => typeof v === "string" && /^\d{1,18}$/.test(v);
const isRegistrant = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,40}$/.test(v);

export async function canSeeRoster(q: Pick<Pool, "query">, viewer: SessionUser, teamId: string): Promise<boolean> {
  if (viewer.isDirector) return true;
  const r = await q.query("select 1 from team_staff where team_id = $1 and coach_id = $2", [teamId, viewer.coachId]);
  return r.rows.length > 0;
}

export type RosterPlayer = {
  registrantId: string;
  firstName: string;
  lastName: string;
  gender: string;
  grade: string;
  rosteredBy: string;
  rosteredAt: Date;
  registered: boolean; // still in the current registrations
};

// Sorted by last name. Null when the viewer can't see this team.
export async function listRoster(deps: Deps, viewer: SessionUser, teamId: string): Promise<RosterPlayer[] | null> {
  if (!isId(teamId) || !(await canSeeRoster(deps.pool, viewer, teamId))) return null;
  const r = await deps.pool.query<RosterPlayer>(
    `select p.registrant_id as "registrantId", p.first_name as "firstName", p.last_name as "lastName", p.gender, p.grade,
            p.rostered_by as "rosteredBy", p.rostered_at as "rosteredAt",
            exists (select 1 from registrations g where g.registrant_id = p.registrant_id) as registered
     from team_players p where p.team_id = $1
     order by lower(p.last_name), lower(p.first_name)`,
    [teamId],
  );
  return r.rows;
}

export type RosterCandidate = {
  registrantId: string;
  firstName: string;
  lastName: string;
  gender: string;
  grade: string;
  fits: boolean; // the team's gender and one of its grades
  otherTeams: string[];
};

// Director: registered players not on this team yet. Those who fit the team come first.
export async function rosterCandidates(deps: Deps, viewer: SessionUser, teamId: string): Promise<RosterCandidate[]> {
  if (!viewer.isDirector || !isId(teamId)) return [];
  const r = await deps.pool.query<RosterCandidate>(
    `select g.registrant_id as "registrantId", g.first_name as "firstName", g.last_name as "lastName", g.gender, g.grade,
            (g.gender = t.gender and g.grade = any(t.grades)) as fits,
            array(select t2.name from team_players p2 join teams t2 on t2.id = p2.team_id
                  where p2.registrant_id = g.registrant_id order by t2.name) as "otherTeams"
     from registrations g cross join teams t
     where t.id = $1 and not exists (select 1 from team_players p where p.team_id = t.id and p.registrant_id = g.registrant_id)
     order by (g.gender = t.gender and g.grade = any(t.grades)) desc, g.grade_sort, lower(g.last_name), lower(g.first_name)`,
    [teamId],
  );
  return r.rows;
}

export async function addPlayers(deps: Deps, viewer: SessionUser, teamId: unknown, ids: unknown): Promise<Result<{ added: number }>> {
  if (!viewer.isDirector) return directorOnly;
  if (!isId(teamId)) return { ok: false, message: "That team no longer exists." };
  const list = Array.isArray(ids) ? [...new Set(ids.filter(isRegistrant))].slice(0, 200) : [];
  if (!list.length) return { ok: false, message: "Pick at least one player." };
  return withTx(deps.pool, async (q) => {
    await q.query("select pg_advisory_xact_lock(hashtext('roster:' || $1))", [teamId]);
    const t = await q.query("select 1 from teams where id = $1", [teamId]);
    if (!t.rows[0]) return { ok: false as const, message: "That team no longer exists." };
    const r = await q.query(
      `insert into team_players (team_id, registrant_id, first_name, last_name, gender, grade, grade_sort, rostered_by, rostered_at)
       select $1, registrant_id, first_name, last_name, gender, grade, grade_sort, $3, $4 from registrations where registrant_id = any($2)
       on conflict do nothing`,
      [teamId, list, `${viewer.firstName} ${viewer.lastName}`, deps.now()],
    );
    return { ok: true as const, added: r.rowCount ?? 0 };
  });
}

export async function removePlayer(deps: Deps, viewer: SessionUser, teamId: unknown, registrantId: unknown): Promise<Result> {
  if (!viewer.isDirector) return directorOnly;
  if (!isId(teamId) || !isRegistrant(registrantId)) return { ok: false, message: "That player isn't on this team." };
  const r = await deps.pool.query("delete from team_players where team_id = $1 and registrant_id = $2", [teamId, registrantId]);
  return r.rowCount ? { ok: true } : { ok: false, message: "That player isn't on this team." };
}
