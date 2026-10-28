"use server";

import { currentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import * as ev from "@/lib/events";
import type { EventInput, PlayerFilter } from "@/lib/events";

const deps = { pool: db, now: () => new Date() };

// Session and role are checked again inside each lib/events function.
async function guarded<T>(fn: (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => Promise<T>) {
  const user = await currentUser();
  if (!user) return { ok: false as const, message: "Please log in again." };
  try {
    return await fn(user);
  } catch (e) {
    console.error("Event change failed:", e);
    return { ok: false as const, message: "Something went wrong. Please try again." };
  }
}

export async function countMatching(f: PlayerFilter) {
  return guarded(async (u) => ({ ok: true as const, count: await ev.countMatching(deps, u, f) }));
}
export async function createEvent(input: EventInput) {
  return guarded((u) => ev.createEvent(deps, u, input));
}
export async function setStatus(input: { eventId: unknown; registrantId: unknown; status: unknown }) {
  return guarded(async (u) => {
    const r = await ev.setStatus(deps, u, input);
    return r.ok ? { ...r, updatedAt: r.updatedAt?.toISOString() ?? null } : r;
  });
}
export async function refreshPlayers(eventId: string) {
  return guarded((u) => ev.refreshPlayers(deps, u, String(eventId)));
}
export async function deleteEvent(eventId: string) {
  return guarded((u) => ev.deleteEvent(deps, u, String(eventId)));
}
export async function addEventType(name: string) {
  return guarded((u) => ev.addEventType(deps, u, name));
}
export async function removeEventType(name: string) {
  return guarded((u) => ev.removeEventType(deps, u, name));
}
