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
};

// Director only. Sorted by last name, then first name.
export async function listUsers(viewer: SessionUser): Promise<UserListItem[]> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await db.query<UserListItem>(
    `select coach_id as "coachId", first_name as "firstName", last_name as "lastName", cell, email,
            (email is not null and lower(trim(email)) = lower(trim(coalesce(verified_email, '')))) as verified,
            active, thunder_request as request, thunder_coach as coach, thunder_director as director
     from users
     order by lower(last_name), lower(first_name)`,
  );
  return r.rows;
}
