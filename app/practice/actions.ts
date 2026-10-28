"use server";

import { currentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import * as admin from "@/lib/practice/admin";
import type { AddSlotsInput, BlackoutInput } from "@/lib/practice/admin";

const deps = { pool: db, now: () => new Date() };

// Session and Director role are checked again inside each lib/practice/admin function.
async function guarded<T>(fn: (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => Promise<T>) {
  const user = await currentUser();
  if (!user) return { ok: false as const, message: "Please log in again." };
  try {
    return await fn(user);
  } catch (e) {
    console.error("Practice change failed:", e);
    return { ok: false as const, message: "Something went wrong. Please try again." };
  }
}

export async function addGym(input: { name: unknown; courts: unknown }) {
  return guarded((u) => admin.addGym(deps, u, input));
}
export async function addSlots(input: AddSlotsInput) {
  return guarded((u) => admin.addSlots(deps, u, input));
}
export async function blackoutDates(input: BlackoutInput) {
  return guarded(async (u) => {
    const r = await admin.blackoutDates(deps, u, input);
    // Dates cross the wire as text.
    return r.ok ? { ...r, removed: r.removed.map((x) => ({ ...x, startsAt: x.startsAt.toISOString() })) } : r;
  });
}
