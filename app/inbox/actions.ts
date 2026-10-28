"use server";

import * as ann from "@/lib/announcements";
import type { AudienceInput } from "@/lib/announcements";
import { VIEW_ONLY, currentUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const deps = { pool: db, now: () => new Date() };

// Session and Director role are checked again inside each lib/announcements function.
async function guarded<T>(fn: (user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) => Promise<T>) {
  const user = await currentUser();
  if (!user) return { ok: false as const, message: "Please log in again." };
  if (user.actingBy) return { ok: false as const, message: VIEW_ONLY };
  try {
    return await fn(user);
  } catch (e) {
    console.error("Announcement failed:", e);
    return { ok: false as const, message: "Something went wrong. Please try again." };
  }
}

export async function previewAudience(input: AudienceInput) {
  return guarded((u) => ann.previewAudience(deps, u, input));
}
export async function sendAnnouncement(input: { title: unknown; body: unknown } & AudienceInput) {
  return guarded((u) => ann.sendAnnouncement({ ...deps, sendEmail }, u, input));
}
export async function deleteAnnouncement(id: string) {
  return guarded((u) => ann.deleteAnnouncement(deps, u, String(id)));
}
// "Got it" on the new-announcement pop-up.
export async function acknowledge(ids: string[]) {
  return guarded(async (u) => {
    await ann.markRead(deps, u, Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
    return { ok: true as const };
  });
}
