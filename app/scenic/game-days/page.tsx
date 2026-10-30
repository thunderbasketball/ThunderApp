import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { isScenicDirector } from "@/lib/scenic";
import { listGameDays } from "@/lib/scenic-partners";
import AppHeader from "../../AppHeader";
import { GroupCard, PageTitle } from "../../ui";
import { AddGameDays, RemoveGameDay } from "./GameDayTools";

export default function GameDaysPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <GameDays />
    </Suspense>
  );
}

const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const monthLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

// Scenic City game days from today on, by month. Directors add and remove them; everyone in Scenic City can see them.
async function GameDays() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  const deps = { pool: db, now: () => new Date() };
  const days = await listGameDays(deps, user);
  if (!days) redirect("/");
  const director = await isScenicDirector(db, user.coachId);
  const months = new Map<string, typeof days>();
  for (const d of days) months.set(monthLabel(d.day), [...(months.get(monthLabel(d.day)) ?? []), d]);

  return (
    <>
      <AppHeader user={user} context="scenic" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <Link href="/scenic" className="text-sm text-zinc-500 hover:underline">
          ← Scenic City
        </Link>
        <div className="flex items-start justify-between gap-3">
          <PageTitle title="Game days" subtitle={`${days.length} upcoming. Hosting partners give their courts' hours on these days.`} />
          {director && <AddGameDays />}
        </div>
        <div className="space-y-3">
          {!days.length && <p className="text-zinc-500">No game days yet.{director && " Tap “+ Add” to add some."}</p>}
          {[...months].map(([month, list]) => (
            <GroupCard key={month} title={month} count={list.length}>
              {list.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-medium tabular-nums">{dayLabel(d.day)}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{d.createdBy}</span>
                    {director && <RemoveGameDay id={d.id} label={dayLabel(d.day)} />}
                  </span>
                </li>
              ))}
            </GroupCard>
          ))}
        </div>
      </main>
    </>
  );
}
