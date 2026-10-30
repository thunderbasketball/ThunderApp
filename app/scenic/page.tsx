import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { currentContexts } from "@/lib/contexts-server";
import { db } from "@/lib/db";
import AppHeader from "../AppHeader";
import { card, PageTitle } from "../ui";

export default function ScenicPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Scenic />
    </Suspense>
  );
}

// What Scenic City will offer, by role (SPEC.md section 13). Each part arrives in a later build step.
const PARTS: { title: string; about: string; who: string[]; href?: string }[] = [
  { title: "Programs", about: "Circuit, League and Tournament: divisions, dates and registered teams.", who: ["Director"] },
  { title: "Game days", about: "The dates Scenic City plays.", who: ["Director", "Partner", "Solo", "Coach"], href: "/scenic/game-days" },
  {
    title: "Partners",
    about: "Schools and organizations that host games, register teams, or both: their gyms and courts.",
    who: ["Director", "Partner"],
    href: "/scenic/partners",
  },
  { title: "Court availability", about: "Gyms, courts and open times from hosting partners.", who: ["Director", "Partner"] },
  { title: "Teams", about: "Register teams into programs.", who: ["Director", "Partner", "Solo", "Coach"] },
  { title: "Users", about: "Approve Partner and Solo requests; manage Scenic City roles.", who: ["Director"], href: "/scenic/users" },
];

// Scenic City home: only for people who hold a Scenic City role (checked on the server).
async function Scenic() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  const { contexts } = await currentContexts(user);
  const scenic = contexts.find((c) => c.key === "scenic");
  if (!scenic || scenic.key !== "scenic") redirect("/");
  const parts = PARTS.filter((p) => p.who.includes(scenic.role));
  const requests =
    scenic.role === "Director"
      ? (await db.query<{ n: number }>("select count(*)::int as n from access_requests where org = 'scenic-city'")).rows[0].n
      : 0;

  return (
    <>
      <AppHeader user={user} context="scenic" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <PageTitle title="Scenic City Basketball" subtitle={`Welcome, ${user.firstName} · ${scenic.role}`} />
        <div className="grid gap-3 sm:grid-cols-2">
          {parts.map((p) => {
            const body = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{p.title}</h2>
                  {p.href ? (
                    p.title === "Users" &&
                    requests > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                        {requests} waiting
                      </span>
                    )
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{p.about}</p>
              </>
            );
            return p.href ? (
              <Link key={p.title} href={p.href} className={`${card} block p-4 hover:ring-scenic-navy/40`}>
                {body}
              </Link>
            ) : (
              <div key={p.title} className={`${card} p-4`}>
                {body}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
