"use server";

import { currentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { createTeam as create, type CreateTeamInput, type CreateTeamResult } from "@/lib/teams";

export async function createTeam(input: CreateTeamInput): Promise<CreateTeamResult> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "Please log in again." };
  try {
    return await create({ pool: db, now: () => new Date() }, user, input);
  } catch (e) {
    console.error("Create team failed:", e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
