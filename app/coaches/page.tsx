import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listVolunteerCoaches } from "@/lib/coaches";
import { formatCell } from "@/lib/phone";
import { gradeLabel } from "@/lib/grades";
import AppHeader from "../AppHeader";
import { Chip, EmailLink, GroupCard, PageTitle, PersonRow, PhoneLink, Stats } from "../ui";

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
      <AppHeader user={user} tab="coaches" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <PageTitle title="Volunteer coaches" subtitle="Parents who offered to coach at registration" />
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
                <PersonRow
                  key={c.registrantId}
                  first={c.firstName ?? "No parent name"}
                  last={c.lastName}
                  avatarTone={c.isHead ? "green" : "amber"}
                  chips={<Chip tone={c.isHead ? "green" : "amber"}>{c.role}</Chip>}
                >
                  {c.cell && c.cell.length === 10 && (
                    <p>
                      <PhoneLink cell={c.cell} label={formatCell(c.cell)} />
                    </p>
                  )}
                  {c.email && (
                    <p className="truncate">
                      <EmailLink email={c.email} />
                    </p>
                  )}
                  <p>Player: {c.playerName}</p>
                </PersonRow>
              ))}
            </GroupCard>
          ))}
        </div>
      </main>
    </>
  );
}
