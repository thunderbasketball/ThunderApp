import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listPlayerGroups } from "@/lib/players";
import { formatCell } from "@/lib/phone";
import { gradeLabel } from "@/lib/grades";
import AppHeader from "../AppHeader";
import { Chip, GroupCard, Notice, PageTitle, PersonRow, PhoneLink, Stats } from "../ui";

export default function PlayersPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Players />
    </Suspense>
  );
}

// Thunder is in Eastern time, wherever the server runs.
const when = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function Players() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");

  const { groups, importedAt, importedBy, sync } = await listPlayerGroups(user);
  const count = (gender: string) => groups.filter((g) => g.gender === gender).reduce((n, g) => n + g.players.length, 0);
  const total = count("Boys") + count("Girls");

  return (
    <>
      <AppHeader user={user} tab="players" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <PageTitle
          title="Registered players"
          subtitle={
            importedAt && (
              <>
                From TeamSnap, updated {when(importedAt)} by {importedBy}
                {sync?.checkedAt && sync.ok && <> · sheet checked {when(sync.checkedAt)}</>}
              </>
            )
          }
        />
        <Stats
          items={[
            { label: "Players", value: total },
            { label: "Boys", value: count("Boys"), tone: "text-blue-600 dark:text-blue-400" },
            { label: "Girls", value: count("Girls"), tone: "text-pink-600 dark:text-pink-400" },
          ]}
        />
        {sync && !sync.ok && (
          <Notice tone="red">
            Couldn&apos;t update from the Google Sheet{sync.checkedAt && <> ({when(sync.checkedAt)})</>}: {sync.message}
          </Notice>
        )}
        {!total && <p className="text-zinc-500">No registrations yet.</p>}
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard key={`${g.gender}-${g.grade}`} title={`${g.gender} · ${gradeLabel(g.grade)}`} count={g.players.length}>
              {g.players.map((p) => (
                <PersonRow
                  key={p.registrantId}
                  first={p.firstName}
                  last={p.lastName}
                  avatarTone={p.gender === "Boys" ? "blue" : "pink"}
                  chips={p.coachingInterest && <Chip tone="green">Parent: {p.coachingInterest}</Chip>}
                >
                  <p>
                    {p.parentName}
                    {p.parentCell && p.parentCell.length === 10 && (
                      <>
                        {" · "}
                        <PhoneLink cell={p.parentCell} label={formatCell(p.parentCell)} />
                      </>
                    )}
                  </p>
                  {p.coachRequest && <p>Coach request: {p.coachRequest}</p>}
                </PersonRow>
              ))}
            </GroupCard>
          ))}
        </div>
      </main>
    </>
  );
}
