import "server-only";
import { db } from "./db";
import type { SessionUser } from "./auth/service";

export type UserListItem = {
  coachId: string;
  firstName: string;
  lastName: string;
  cell: string;
  email: string | null;
  verified: boolean;
  active: boolean;
  request: boolean;
  coach: boolean;
  director: boolean;
  teams: string[]; // e.g. "4G Epps · Manager", sorted by team name
  scenicCity: boolean; // Scenic City also uses this person
  updatedBy: string | null;
};

// Director only. Sorted by last name, then first name.
export async function listUsers(viewer: SessionUser): Promise<UserListItem[]> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await db.query<UserListItem>(
    `select coach_id as "coachId", first_name as "firstName", last_name as "lastName", cell, email,
            (email is not null and lower(trim(email)) = lower(trim(coalesce(verified_email, '')))) as verified,
            active, thunder_request as request, thunder_coach as coach, thunder_director as director,
            coalesce((select array_agg(t.name || ' · ' || case s.role when 'HeadCoach' then 'Head Coach' when 'AsstCoach' then 'Asst Coach'
                                                     when 'Manager' then 'Manager' else 'Team Parent' end order by t.name)
                      from team_staff s join teams t on t.id = s.team_id where s.coach_id = users.coach_id), '{}') as teams,
            (scenic_city_request or scenic_city_coach or scenic_city_director
             or coalesce(nullif(lower(scenic_city_associations), 'false'), '') <> '') as "scenicCity",
            updated_by as "updatedBy"
     from users
     order by lower(last_name), lower(first_name)`,
  );
  return r.rows;
}
