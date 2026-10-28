import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { formatCell } from "@/lib/phone";
import { listTeams, type TeamListItem } from "@/lib/teams";
import AppHeader from "../AppHeader";
import { Chip, GroupCard, PageTitle, PhoneLink, Stats } from "../ui";

export default function TeamsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Teams />
    </Suspense>
  );
}

const gradesLabel = (g: string[]) =>
  g.length === 1 ? (g[0] === "K" ? "Kindergarten" : `Grade ${g[0]}`) : `Grades ${g.join(", ")}`;

async function Teams() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");

  const teams = await listTeams({ pool: db, now: () => new Date() }, user);
  const groups: { gender: string; teams: TeamListItem[] }[] = [];
  for (const t of teams) {
    let g = groups.at(-1);
    if (!g || g.gender !== t.gender) groups.push((g = { gender: t.gender, teams: [] }));
    g.teams.push(t);
  }
  const count = (gender: string) => teams.filter((t) => t.gender === gender).length;

  return (
    <>
      <AppHeader user={user} tab="teams" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <PageTitle title="Teams" subtitle="Grouped by gender, sorted by grade" />
          <Link
            href="/teams/new"
            className="shrink-0 rounded-full bg-thunder-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-thunder-blue-dark"
          >
            + New team
          </Link>
        </div>
        <Stats
          items={[
            { label: "Teams", value: teams.length },
            { label: "Boys", value: count("Boys"), tone: "text-blue-600 dark:text-blue-400" },
            { label: "Girls", value: count("Girls"), tone: "text-pink-600 dark:text-pink-400" },
          ]}
        />
        {!teams.length && <p className="text-zinc-500">No teams yet. Tap “+ New team” to create one.</p>}
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard key={g.gender} title={g.gender} count={g.teams.length}>
              {g.teams.map((t) => (
                <li key={t.id} className="flex gap-3 px-4 py-3">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${
                      t.gender === "Boys" ? "bg-thunder-blue" : "bg-pink-600"
                    }`}
                  >
                    {t.name.split(" ")[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold">{t.name}</p>
                      <Chip tone={t.level === "COMP" ? "orange" : "zinc"}>{t.level}</Chip>
                    </div>
                    <div className="mt-0.5 space-y-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                      <p>{gradesLabel(t.grades)}</p>
                      {t.headCoach ? (
                        <p>
                          Head coach: {t.headCoach.first} {t.headCoach.last} ·{" "}
                          <PhoneLink cell={t.headCoach.cell} label={formatCell(t.headCoach.cell)} />
                        </p>
                      ) : (
                        <p className="text-amber-700 dark:text-amber-400">No head coach yet</p>
                      )}
                      {t.practiceLocations.length > 0 && <p>Practices: {t.practiceLocations.join(", ")}</p>}
                      <p className="text-xs">Created by {t.createdBy}</p>
                    </div>
                  </div>
                </li>
              ))}
            </GroupCard>
          ))}
        </div>
      </main>
    </>
  );
}
