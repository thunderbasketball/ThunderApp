// The roles a person can switch between: Director, plus one per team they're on.
// Read from the database on every request, so a removed role disappears at once.
import type { Pool } from "pg";
import type { SessionUser } from "./auth/service";
import type { Role } from "./teams";

export type RoleContext =
  | { key: "director"; label: string; href: string }
  | { key: `team:${string}`; label: string; href: string; teamId: string; teamName: string; role: Role };

export const CONTEXT_COOKIE = "thunder_context";

const ROLE_LABEL: Record<Role, string> = { HeadCoach: "Head Coach", AsstCoach: "Asst Coach", Manager: "Manager", TeamParent: "Team Parent" };

export async function userContexts(pool: Pick<Pool, "query">, viewer: SessionUser): Promise<RoleContext[]> {
  const out: RoleContext[] = [];
  if (viewer.isDirector) out.push({ key: "director", label: "Director", href: "/teams" });
  // One chip per team, showing the person's highest role there.
  const r = await pool.query<{ id: string; name: string; role: Role }>(
    `select distinct on (t.id) t.id::text, t.name, s.role
     from team_staff s join teams t on t.id = s.team_id
     where s.coach_id = $1
     order by t.id, array_position(array['HeadCoach','AsstCoach','Manager','TeamParent'], s.role)`,
    [viewer.coachId],
  );
  const teams = r.rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const t of teams)
    out.push({ key: `team:${t.id}`, label: `${t.name} · ${ROLE_LABEL[t.role]}`, href: `/teams/${t.id}`, teamId: t.id, teamName: t.name, role: t.role });
  return out;
}

// The remembered context if the person still holds it, otherwise their first one.
export function pickContext(contexts: RoleContext[], remembered: string | undefined): RoleContext | null {
  return contexts.find((c) => c.key === remembered) ?? contexts[0] ?? null;
}
