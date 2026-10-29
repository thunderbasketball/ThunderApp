import { phoneUser } from "@/lib/auth/server";

// The phone app's logged-in person, or 401 when the token is missing, expired or the user was deactivated.
export async function GET(request: Request) {
  const user = await phoneUser(request);
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });
  return Response.json({ user });
}
