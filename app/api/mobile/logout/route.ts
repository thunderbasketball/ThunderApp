import { logout } from "@/lib/auth/service";
import { deps, phoneToken } from "@/lib/auth/server";

// Ends the phone's session on the server; the app also forgets its stored token.
export async function POST(request: Request) {
  await logout(deps, phoneToken(request));
  return Response.json({ ok: true });
}
