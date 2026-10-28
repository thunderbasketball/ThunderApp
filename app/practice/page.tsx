import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { listGyms, pickWeek, weekSchedule } from "@/lib/practice/schedule";
import { TZ } from "@/lib/time";
import AppHeader from "../AppHeader";
import { Chip, PageTitle, card } from "../ui";
import { AddGymButton, AddSlotsButton, BlackoutButton } from "./PracticeTools";

export default function PracticePage({ searchParams }: PageProps<"/practice">) {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Practice searchParams={searchParams} />
    </Suspense>
  );
}

const time = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

async function Practice({ searchParams }: { searchParams: PageProps<"/practice">["searchParams"] }) {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");
  const deps = { pool: db, now: () => new Date() };
  const week = (await searchParams).week;
  const start = await pickWeek(deps, typeof week === "string" ? week : undefined);
  const [schedule, gyms] = await Promise.all([weekSchedule(deps, user, start), listGyms(deps)]);
  const now = new Date();
  const counts = schedule.days
    .flatMap((d) => d.gyms.flatMap((g) => g.slots))
    .reduce(
      (n, s) => ({
        open: n.open + (!s.team && !s.blackout ? 1 : 0),
        booked: n.booked + (s.team ? 1 : 0),
        blocked: n.blocked + (s.blackout ? 1 : 0),
      }),
      { open: 0, booked: 0, blocked: 0 },
    );

  return (
    <>
      <AppHeader user={user} tab="practice" context="director" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <PageTitle title="Practice" subtitle="Grouped by date, then gym, sorted by time" />
        <div className="mb-5 flex flex-wrap gap-2">
          <AddSlotsButton gyms={gyms} />
          <BlackoutButton gyms={gyms} />
          <AddGymButton />
        </div>

        <div className={`${card} mb-4 flex items-center justify-between gap-2 px-2 py-2`}>
          <Link
            href={`/practice?week=${schedule.prev}`}
            className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← Prev
          </Link>
          <div className="text-center">
            <p className="font-semibold">{schedule.label}</p>
            <p className="text-xs text-zinc-500">
              {counts.open} open · {counts.booked} booked · {counts.blocked} blocked
            </p>
          </div>
          <Link
            href={`/practice?week=${schedule.next}`}
            className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Next →
          </Link>
        </div>

        {!schedule.days.length && <p className="text-zinc-500">No practice slots this week. Use “+ Add slots” to create some.</p>}
        <div className="space-y-3">
          {schedule.days.map((d) => (
            <section key={d.iso} className={`${card} overflow-hidden`}>
              <h2 className="border-b border-zinc-100 px-4 py-3 font-semibold dark:border-white/5">{d.label}</h2>
              {d.gyms.map((g) => (
                <div key={g.gym}>
                  <h3 className="bg-zinc-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:bg-white/5">
                    {g.gym}
                  </h3>
                  <ul className="divide-y divide-zinc-100 dark:divide-white/5">
                    {g.slots.map((s) => (
                      <li key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${s.startsAt < now ? "opacity-50" : ""}`}>
                        <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{time(s.startsAt)}</span>
                        <span className="w-16 shrink-0 text-sm text-zinc-500">{s.court}</span>
                        <span className="min-w-0 flex-1 text-sm">
                          {s.blackout ? (
                            <Chip tone="red">Blackout{s.note ? `: ${s.note}` : ""}</Chip>
                          ) : s.team ? (
                            <span className="flex flex-wrap items-center gap-x-2">
                              <span className="font-semibold">{s.team}</span>
                              <span className="text-xs text-zinc-500">by {s.bookedBy}</span>
                            </span>
                          ) : (
                            <Chip tone="green">Open</Chip>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
