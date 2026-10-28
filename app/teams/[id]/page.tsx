import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { formatCell } from "@/lib/phone";
import { currentContexts } from "@/lib/contexts-server";
import { getTeam, personOptions, roleLabel } from "@/lib/teams";
import AppHeader from "../../AppHeader";
import { Chip, EmailLink, PersonRow, PhoneLink, card } from "../../ui";
import { AddStaffForm, RemoveStaffButton, TeamEditForm } from "./TeamEditor";

export default function TeamPage({ params }: PageProps<"/teams/[id]">) {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Team params={params} />
    </Suspense>
  );
}

const roleTone = { HeadCoach: "green", AsstCoach: "amber", Manager: "blue", TeamParent: "zinc" } as const;

async function Team({ params }: { params: PageProps<"/teams/[id]">["params"] }) {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  const { id } = await params;
  const deps = { pool: db, now: () => new Date() };
  const team = await getTeam(deps, user, id);
  if (!team) notFound();
  // Shown as the role the person switched to: a team chip shows the team as that role sees it,
  // even for the Director; otherwise the Director sees everything.
  const { active } = await currentContexts(user);
  const asDirector = user.isDirector && !(active?.key === `team:${team.id}` && team.myRoles.length > 0);
  const canEditTeam = asDirector && team.canEditTeam;
  const canEditStaff = asDirector || team.myRoles.includes("HeadCoach");
  // Only the Director picks from the full user and volunteer lists; a head coach adds people by cell number.
  const options = asDirector ? await personOptions(deps, user) : null;

  return (
    <>
      <AppHeader user={user} tab="teams" context={asDirector ? "director" : `team:${team.id}`} />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 py-6">
        {asDirector && (
          <Link href="/teams" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            ← Teams
          </Link>
        )}

        <section className={`${card} p-5`}>
          <div className="flex items-start gap-3">
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white ${
                team.gender === "Boys" ? "bg-thunder-blue" : "bg-pink-600"
              }`}
            >
              {team.name.split(" ")[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
                <Chip tone={team.level === "COMP" ? "orange" : "zinc"}>{team.level}</Chip>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {team.gender} · {team.grades.length === 1 ? "Grade" : "Grades"} {team.grades.join(", ")}
              </p>
              {team.practiceLocations.length > 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Practices: {team.practiceLocations.join(", ")}</p>
              )}
              <p className="mt-1 text-xs text-zinc-400">Created by {team.createdBy}</p>
            </div>
          </div>
          {canEditTeam && (
            <TeamEditForm
              teamId={team.id}
              initial={{ gender: team.gender, grades: team.grades, level: team.level, practiceLocations: team.practiceLocations.join(", ") }}
            />
          )}
        </section>

        <section className={`${card} overflow-hidden`}>
          <h2 className="px-4 pt-4 pb-2 font-semibold">Staff ({team.staff.length})</h2>
          {!team.staff.length && <p className="px-4 pb-4 text-sm text-zinc-500">No staff yet.</p>}
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-white/5 dark:border-white/5">
            {team.staff.map((s) => (
              <PersonRow
                key={`${s.coachId}-${s.role}`}
                first={s.firstName}
                last={s.lastName}
                avatarTone={roleTone[s.role]}
                chips={<Chip tone={roleTone[s.role]}>{roleLabel(s.role)}</Chip>}
              >
                <p>
                  <PhoneLink cell={s.cell} label={formatCell(s.cell)} />
                </p>
                {s.email && (
                  <p className="truncate">
                    <EmailLink email={s.email} />
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs">Added by {s.addedBy}</p>
                  {canEditStaff && (s.role !== "HeadCoach" || asDirector) && (
                    <RemoveStaffButton teamId={team.id} coachId={s.coachId} role={s.role} label={`${s.firstName} ${s.lastName}`} />
                  )}
                </div>
              </PersonRow>
            ))}
          </ul>
        </section>

        {canEditStaff && (
          <AddStaffForm
            teamId={team.id}
            gender={team.gender}
            grades={team.grades}
            canSetHead={asDirector}
            hasHead={team.staff.some((s) => s.role === "HeadCoach")}
            users={options?.users ?? []}
            volunteers={options?.volunteers ?? []}
          />
        )}
      </main>
    </>
  );
}
