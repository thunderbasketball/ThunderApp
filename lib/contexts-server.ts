import "server-only";
import { cookies } from "next/headers";
import type { SessionUser } from "./auth/service";
import { CONTEXT_COOKIE, pickContext, userContexts, type RoleContext } from "./contexts";
import { db } from "./db";

// The viewer's roles, and which one they used last (falls back to their first).
export async function currentContexts(user: SessionUser): Promise<{ contexts: RoleContext[]; active: RoleContext | null }> {
  const contexts = await userContexts(db, user);
  const remembered = (await cookies()).get(CONTEXT_COOKIE)?.value;
  return { contexts, active: pickContext(contexts, remembered) };
}
