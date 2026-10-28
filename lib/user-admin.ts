// Director tools for users: add, edit (name, email, Active, Coach, Director), approve/deny requests, delete.
// Never writes the Scenic City columns.
import type { Pool } from "pg";
import type { SessionUser } from "./auth/service";
import { cleanEmail, cleanName } from "./auth/validate";
import { coachIdFromCell, normalizeCell } from "./phone";
import { withTx } from "./sql";

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

const by = (v: SessionUser) => `${v.firstName} ${v.lastName}`;
const directorOnly = { ok: false as const, message: "Only the Director can manage users." };
const bool = (v: unknown) => v === true;

function cleanFields(input: { first: unknown; last: unknown; email: unknown }) {
  const first = cleanName(input.first);
  const last = cleanName(input.last);
  if (!first || !last) throw new UserError("Enter a first and last name (letters only).");
  const emailText = typeof input.email === "string" ? input.email.trim() : "";
  const email = emailText ? cleanEmail(emailText) : null;
  if (emailText && !email) throw new UserError("That email doesn't look right.");
  return { first, last, email };
}

export type EditUserInput = { first: unknown; last: unknown; email: unknown; active: unknown; coach: unknown; director: unknown };

export async function updateUser(deps: Deps, viewer: SessionUser, coachId: string, input: EditUserInput): Promise<Result> {
  if (!viewer.isDirector) return directorOnly;
  if (!/^\d{7}$/.test(coachId)) return { ok: false, message: "That user no longer exists." };
  return run(async () => {
    const f = cleanFields(input);
    const active = bool(input.active);
    const coach = bool(input.coach);
    const director = bool(input.director);
    if (coachId === viewer.coachId && !director) throw new UserError("You can't remove your own Director role.");
    if (coachId === viewer.coachId && !active) throw new UserError("You can't deactivate yourself.");
    return withTx(deps.pool, async (q) => {
      // Granting any Thunder role clears a pending request.
      const r = await q.query(
        `update users set first_name = $2, last_name = $3, email = $4, active = $5, thunder_coach = $6, thunder_director = $7,
                thunder_request = thunder_request and not ($6 or $7), updated_at = $8, updated_by = $9
         where coach_id = $1`,
        [coachId, f.first, f.last, f.email, active, coach, director, deps.now(), by(viewer)],
      );
      if (!r.rowCount) throw new UserError("That user no longer exists.");
      return {};
    });
  });
}

// Deny an access request: clears the request without giving a role.
export async function denyRequest(deps: Deps, viewer: SessionUser, coachId: string): Promise<Result> {
  if (!viewer.isDirector) return directorOnly;
  if (!/^\d{7}$/.test(coachId)) return { ok: false, message: "That user no longer exists." };
  await deps.pool.query("update users set thunder_request = false, updated_at = $2, updated_by = $3 where coach_id = $1", [
    coachId,
    deps.now(),
    by(viewer),
  ]);
  return { ok: true };
}

export type AddUserInput = { first: unknown; last: unknown; cell: unknown; email: unknown; coach: unknown; director: unknown };

// A new login with the starter PIN (1234). Refuses a cell that's taken or whose last 7 digits belong to someone else.
export async function addUser(deps: Deps, viewer: SessionUser, input: AddUserInput): Promise<Result<{ coachId: string }>> {
  if (!viewer.isDirector) return directorOnly;
  return run(async () => {
    const f = cleanFields(input);
    const cell = typeof input.cell === "string" ? normalizeCell(input.cell) : null;
    if (!cell) throw new UserError("Enter a 10-digit cell number.");
    const coachId = coachIdFromCell(cell);
    return withTx(deps.pool, async (q) => {
      await q.query("select pg_advisory_xact_lock(hashtext('user:' || $1))", [coachId]);
      const e = await q.query<{ cell: string; who: string }>("select cell, first_name || ' ' || last_name as who from users where coach_id = $1", [
        coachId,
      ]);
      if (e.rows[0]?.cell === cell) throw new UserError(`${e.rows[0].who} already has that cell number.`);
      if (e.rows[0]) throw new UserError(`That cell ends in the same 7 digits as ${e.rows[0].who}'s. Please contact support.`);
      await q.query(
        `insert into users (coach_id, first_name, last_name, cell, email, thunder_coach, thunder_director, created_at, updated_at, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)`,
        [coachId, f.first, f.last, cell, f.email, bool(input.coach), bool(input.director), deps.now(), by(viewer)],
      );
      return { coachId };
    });
  });
}

// Why a user can't be deleted, or null if they can. Deactivate is the safe alternative.
export function deleteBlocker(u: { coachId: string; teams: unknown[]; scenicCity: boolean }, viewer: SessionUser): string | null {
  if (u.coachId === viewer.coachId) return "You can't delete yourself.";
  if (u.teams.length) return "They're on a team. Remove them from their teams first, or deactivate them.";
  if (u.scenicCity) return "Scenic City also uses this person. Deactivate them instead.";
  return null;
}

export async function deleteUser(deps: Deps, viewer: SessionUser, coachId: string): Promise<Result> {
  if (!viewer.isDirector) return directorOnly;
  if (!/^\d{7}$/.test(coachId)) return { ok: false, message: "That user no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      const r = await q.query<{ scenic: boolean; teams: string[] }>(
        `select (scenic_city_request or scenic_city_coach or scenic_city_director
                 or coalesce(nullif(lower(scenic_city_associations), 'false'), '') <> '') as scenic,
                array(select team_id::text from team_staff where coach_id = users.coach_id) as teams
         from users where coach_id = $1 for update`,
        [coachId],
      );
      if (!r.rows[0]) throw new UserError("That user no longer exists.");
      const blocker = deleteBlocker({ coachId, teams: r.rows[0].teams, scenicCity: r.rows[0].scenic }, viewer);
      if (blocker) throw new UserError(blocker);
      await q.query("delete from users where coach_id = $1", [coachId]); // sessions go with them
      return {};
    }),
  );
}
