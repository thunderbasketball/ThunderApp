import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { CONTEXT_COOKIE, userContexts } from "@/lib/contexts";
import { db } from "@/lib/db";

// Header chip: /switch?to=director or /switch?to=team:<id>. Only switches to a role the person holds right now.
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const to = req.nextUrl.searchParams.get("to");
  const target = (await userContexts(db, user)).find((c) => c.key === to);
  if (!target) return NextResponse.redirect(new URL("/", req.url));
  const res = NextResponse.redirect(new URL(target.href, req.url));
  res.cookies.set(CONTEXT_COOKIE, target.key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
