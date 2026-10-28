import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listCurrentStaff, listVolunteerCoaches } from "@/lib/coaches";
import { gradeLabel } from "@/lib/grades";
import type { Role } from "@/lib/teams";
import AppHeader from "../AppHeader";
import { ContactChip, GroupTextButton } from "../Contacts";
import NotifyButton from "../NotifyButton";
import { GroupCard, PageTitle, Stats } from "../ui";

export default function CoachesPage({ searchParams }: PageProps<"/coaches">) {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Coaches searchParams={searchParams} />
    </Suspense>
  );
}

const SECTIONS: { key: "volunteers" | Role; label: string; title: string }[] = [
  { key: "volunteers", label: "Volunteers", title: "Volunteer coaches" },
  { key: "HeadCoach", label: "Head", title: "Current Head Coaches" },
  { key: "AsstCoach", label: "Assistants", title: "Current Assistant Coaches" },
  { key: "Manager", label: "Managers", title: "Current Team Managers" },
  { key: "TeamParent", label: "Team Parents", title: "Current Team Parents" },
];

async function Coaches({ searchParams }: { searchParams: PageProps<"/coaches">["searchParams"] }) {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");
  const sp = await searchParams;
  const section = SECTIONS.find((x) => x.key === sp.view) ?? SECTIONS[0];

  const [groups, staff] = await Promise.all([listVolunteerCoaches(user), listCurrentStaff(user)]);
  const all = groups.flatMap((g) => g.coaches);
  const heads = all.filter((c) => c.isHead).length;
  const count = (key: string) => (key === "volunteers" ? all.length : (staff.find((g) => g.role === key)?.people.length ?? 0));
  const people = staff.find((g) => g.role === section.key)?.people ?? [];

  return (
    <>
      <AppHeader user={user} tab="coaches" context="director" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <PageTitle title="Coaches" subtitle="Volunteers from registration, and who holds each role on a team now" />
        <nav className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1 [scrollbar-width:none] dark:bg-zinc-900">
          {SECTIONS.map((x) => (
            <Link
              key={x.key}
              href={x.key === "volunteers" ? "/coaches" : `/coaches?view=${x.key}`}
              aria-current={x.key === section.key ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                x.key === section.key
                  ? "bg-thunder-blue text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {x.label} <span className="tabular-nums opacity-70">{count(x.key)}</span>
            </Link>
          ))}
        </nav>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">{section.title}</h2>
          <GroupTextButton cells={section.key === "volunteers" ? all.map((c) => c.cell) : people.map((p) => p.cell)} label="Text all" />
          <NotifyButton
            audience={section.key === "volunteers" ? { volunteers: true } : { roles: [section.key] }}
            to={section.title.replace("Current ", "all ").replace("Volunteer coaches", "all volunteer coaches")}
            size="md"
          />
        </div>

        {section.key === "volunteers" ? (
          <>
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
          </>
        ) : people.length ? (
          <GroupCard title={section.title} count={people.length}>
            {people.map((p) => (
              <li key={p.coachId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5">
                <ContactChip
                  person={{ role: section.key as Role, ...p }}
                  about={p.teams.join(", ")}
                  chatKey={section.key === "HeadCoach" || section.key === "AsstCoach" ? `coach-${p.coachId}` : undefined}
                />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{p.teams.join(", ")}</span>
              </li>
            ))}
          </GroupCard>
        ) : (
          <p className="text-zinc-500">Nobody holds this role on a team yet.</p>
        )}
      </main>
    </>
  );
}
