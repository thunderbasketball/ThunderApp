"use server";

import { redirect } from "next/navigation";
import { setActingAs } from "@/lib/auth/server";
import { CONTEXT_COOKIE } from "@/lib/contexts";
import { cookies } from "next/headers";

// Director only (checked in lib/auth/service). Starts on the person's own home page, in their first role.
export async function actAs(coachId: string) {
  const r = await setActingAs(String(coachId));
  if (!r.ok) return r;
  (await cookies()).delete(CONTEXT_COOKIE);
  redirect("/");
}

export async function stopActing() {
  await setActingAs(null);
  (await cookies()).delete(CONTEXT_COOKIE);
  redirect("/users");
}
