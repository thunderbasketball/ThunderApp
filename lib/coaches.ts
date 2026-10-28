import "server-only";
import { db } from "./db";
import type { SessionUser } from "./auth/service";

export type VolunteerCoach = {
  registrantId: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  cell: string | null;
  email: string | null;
  role: string;
  isHead: boolean;
  playerName: string;
};

export type CoachGroup = { gender: "Boys" | "Girls"; grade: string; coaches: VolunteerCoach[] };

// Director only. Parents who answered "interested in coaching" at registration,
// grouped by their player's Gender, then Grade; Head Coach before Assistant, then by last name.
export async function listVolunteerCoaches(viewer: SessionUser): Promise<CoachGroup[]> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await db.query<VolunteerCoach & { gender: "Boys" | "Girls"; grade: string }>(
    `select registrant_id as "registrantId", gender, grade,
            nullif(trim(parent1_first), '') as "firstName", nullif(trim(parent1_last), '') as "lastName",
            parent1_cell as cell, parent1_email as email,
            coaching_interest as role, coaching_interest ilike 'head%' as "isHead",
            first_name || ' ' || last_name as "playerName"
     from registrations
     where coaching_interest is not null
     order by gender, grade_sort, coaching_interest ilike 'head%' desc,
              lower(parent1_last), lower(parent1_first), lower(last_name), lower(first_name)`,
  );
  const groups: CoachGroup[] = [];
  for (const c of r.rows) {
    let g = groups.at(-1);
    if (!g || g.gender !== c.gender || g.grade !== c.grade) groups.push((g = { gender: c.gender, grade: c.grade, coaches: [] }));
    g.coaches.push(c);
  }
  return groups;
}
