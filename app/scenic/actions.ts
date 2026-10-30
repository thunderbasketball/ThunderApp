"use server";

import { VIEW_ONLY, currentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import * as scenic from "@/lib/scenic";
import * as partners from "@/lib/scenic-partners";
import type { JoinInput } from "@/lib/scenic";

const deps = { pool: db, now: () => new Date() };

// Session (and, inside lib/scenic, the Scenic City role) checked on the server for every change.
async function guarded<T>(fn: (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => Promise<T>) {
  const user = await currentUser();
  if (!user) return { ok: false as const, message: "Please log in again." };
  if (user.actingBy) return { ok: false as const, message: VIEW_ONLY };
  try {
    return await fn(user);
  } catch (e) {
    console.error("Scenic City change failed:", e);
    return { ok: false as const, message: "Something went wrong. Please try again." };
  }
}

export async function requestJoin(input: JoinInput) {
  return guarded((u) => scenic.requestJoin(deps, u, input));
}
export async function approveRequest(coachId: string, as: string) {
  return guarded((u) => scenic.approveRequest(deps, u, coachId, as));
}
export async function denyRequest(coachId: string) {
  return guarded((u) => scenic.denyRequest(deps, u, coachId));
}
export async function setScenicRoles(coachId: string, roles: string[]) {
  return guarded((u) => scenic.setScenicRoles(deps, u, coachId, roles));
}

// ---- Partners, gyms, courts, game days (rules and role checks in lib/scenic-partners) ----

export async function savePartner(id: string | null, input: partners.PartnerInput) {
  return guarded((u) => partners.savePartner(deps, u, id, input));
}
export async function saveGym(partnerId: string, gymId: string | null, input: { name: string; address: string }) {
  return guarded((u) => partners.saveGym(deps, u, partnerId, gymId, input));
}
export async function deleteGym(gymId: string) {
  return guarded((u) => partners.deleteGym(deps, u, gymId));
}
export async function addCourt(gymId: string, name: string) {
  return guarded((u) => partners.addCourt(deps, u, gymId, name));
}
export async function deleteCourt(courtId: string) {
  return guarded((u) => partners.deleteCourt(deps, u, courtId));
}
export async function addGameDays(input: { from: string; to?: string; weekdays?: number[] }) {
  return guarded((u) => partners.addGameDays(deps, u, input));
}
export async function deleteGameDay(id: string) {
  return guarded((u) => partners.deleteGameDay(deps, u, id));
}
