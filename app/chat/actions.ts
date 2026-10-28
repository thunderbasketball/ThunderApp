"use server";

import { VIEW_ONLY, currentUser } from "@/lib/auth/server";
import * as chat from "@/lib/chat";
import { db } from "@/lib/db";

const deps = { pool: db, now: () => new Date() };

// Session and chat membership are checked again inside lib/chat.
export async function postMessage(key: string, body: string) {
  const user = await currentUser();
  if (!user) return { ok: false as const, message: "Please log in again." };
  if (user.actingBy) return { ok: false as const, message: VIEW_ONLY };
  try {
    return await chat.postMessage(deps, user, String(key), body);
  } catch (e) {
    console.error("Chat message failed:", e);
    return { ok: false as const, message: "Something went wrong. Please try again." };
  }
}
