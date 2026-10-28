import "server-only";
import { db } from "./db";
import type { SessionUser } from "./auth/service";
import { getSyncStatus, type SyncStatus } from "./teamsnap/sync";

export type PlayerListItem = {
  registrantId: string;
  firstName: string;
  lastName: string;
  gender: "Boys" | "Girls";
  grade: string;
  birthdate: string | null;
  parentName: string | null;
  parentCell: string | null;
  parentEmail: string | null;
  coachRequest: string | null;
  coachingInterest: string | null;
};

export type PlayerGroup = { gender: "Boys" | "Girls"; grade: string; players: PlayerListItem[] };

// Director only. Grouped by Gender, then Grade (K first); each group sorted by last name.
export async function listPlayerGroups(viewer: SessionUser): Promise<{ groups: PlayerGroup[]; importedAt: Date | null; importedBy: string | null; sync: SyncStatus | null }> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await db.query<PlayerListItem & { importedAt: Date; importedBy: string }>(
    `select registrant_id as "registrantId", first_name as "firstName", last_name as "lastName", gender, grade,
            to_char(birthdate, 'YYYY-MM-DD') as birthdate,
            nullif(trim(coalesce(parent1_first, '') || ' ' || coalesce(parent1_last, '')), '') as "parentName",
            parent1_cell as "parentCell", parent1_email as "parentEmail",
            coach_request as "coachRequest", coaching_interest as "coachingInterest",
            imported_at as "importedAt", imported_by as "importedBy"
     from registrations
     order by gender, grade_sort, lower(last_name), lower(first_name)`,
  );
  const groups: PlayerGroup[] = [];
  for (const p of r.rows) {
    let g = groups.at(-1);
    if (!g || g.gender !== p.gender || g.grade !== p.grade) groups.push((g = { gender: p.gender, grade: p.grade, players: [] }));
    g.players.push(p);
  }
  return { groups, importedAt: r.rows[0]?.importedAt ?? null, importedBy: r.rows[0]?.importedBy ?? null, sync: await getSyncStatus(db) };
}
