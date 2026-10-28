import "server-only";
import { db } from "./db";
import type { SessionUser } from "./auth/service";
import { ROLES, type Role } from "./teams";

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

export type StaffPerson = { coachId: string; first: string; last: string; cell: string; email: string | null; teams: string[] };
export type StaffGroup = { role: Role; people: StaffPerson[] };

// Director only. Everyone currently on a team, grouped by role (Head Coaches first), each with the teams they hold it on.
export async function listCurrentStaff(viewer: SessionUser): Promise<StaffGroup[]> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await db.query<StaffPerson & { role: Role }>(
    `select s.role, u.coach_id as "coachId", u.first_name as first, u.last_name as last, u.cell, u.email,
            array_agg(t.name order by t.grade_sort, lower(t.name)) as teams
     from team_staff s join users u on u.coach_id = s.coach_id join teams t on t.id = s.team_id
     group by s.role, u.coach_id
     order by lower(u.last_name), lower(u.first_name)`,
  );
  return ROLES.map((role) => ({ role, people: r.rows.filter((p) => p.role === role) }));
}
