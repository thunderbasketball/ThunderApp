import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listVolunteerCoaches } from "@/lib/coaches";
import { gradeLabel } from "@/lib/grades";
import AppHeader from "../AppHeader";
import { ContactChip, GroupTextButton } from "../Contacts";
import { GroupCard, PageTitle, Stats } from "../ui";

export default function CoachesPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Coaches />
    </Suspense>
  );
}

async function Coaches() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");

  const groups = await listVolunteerCoaches(user);
  const all = groups.flatMap((g) => g.coaches);
  const heads = all.filter((c) => c.isHead).length;

  return (
    <>
      <AppHeader user={user} tab="coaches" context="director" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <PageTitle title="Volunteer coaches" subtitle="Parents who offered to coach at registration" />
        <div className="mb-4">
          <GroupTextButton cells={all.map((c) => c.cell)} label="Text all volunteers" />
        </div>
        <Stats
          items={[
            { label: "Volunteers", value: all.length },
            { label: "Head", value: heads, tone: "text-emerald-600 dark:text-emerald-400" },
            { label: "Assistant", value: all.length - heads, tone: "text-amber-600 dark:text-amber-400" },
          ]}
        />
        {!all.length && <p className="text-zinc-500">No volunteers yet.</p>}
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard key={`${g.gender}-${g.grade}`} title={`${g.gender} · ${gradeLabel(g.grade)}`} count={g.coaches.length}>
              {g.coaches.map((c) => (
                <li key={c.registrantId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5">
                  <ContactChip
                    person={{
                      role: c.isHead ? "HeadCoach" : "AsstCoach",
                      first: c.firstName,
                      last: c.lastName,
                      cell: c.cell,
                      email: c.email,
                    }}
                    about={`Parent of ${c.playerName}`}
                  />
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Player: {c.playerName}</span>
                </li>
              ))}
            </GroupCard>
          ))}
        </div>
      </main>
    </>
  );
}
