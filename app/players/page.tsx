import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listPlayerGroups } from "@/lib/players";
import { formatCell } from "@/lib/phone";
import AppHeader from "../AppHeader";

export default function PlayersPage() {
  return (
    <Suspense fallback={<p className="p-4">Loading…</p>}>
      <Players />
    </Suspense>
  );
}

const gradeLabel = (g: string) => (g === "K" ? "Kindergarten" : `${g}${["", "st", "nd", "rd"][Number(g)] ?? "th"} grade`);

async function Players() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");

  const { groups, importedAt, importedBy } = await listPlayerGroups(user);
  const total = groups.reduce((n, g) => n + g.players.length, 0);

  return (
    <>
      <AppHeader user={user} tab="players" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Registered players ({total})</h2>
          {importedAt && (
            <p className="text-sm text-zinc-500">
              From TeamSnap, imported {importedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} by {importedBy}
            </p>
          )}
        </div>
        {!total && <p className="text-zinc-600">No registrations yet.</p>}
        <div className="space-y-3">
          {groups.map((g) => (
            <details key={`${g.gender}-${g.grade}`} className="rounded-lg border border-zinc-200 dark:border-zinc-800" open>
              <summary className="cursor-pointer select-none px-4 py-3 font-semibold">
                {g.gender} · {gradeLabel(g.grade)} <span className="font-normal text-zinc-500">({g.players.length})</span>
              </summary>
              <ul className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {g.players.map((p) => (
                  <li key={p.registrantId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">
                        {p.firstName} {p.lastName}
                      </p>
                      {p.coachingInterest && (
                        <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
                          Parent: {p.coachingInterest}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {p.parentName}
                      {p.parentCell && p.parentCell.length === 10 && (
                        <>
                          {" · "}
                          <a href={`tel:${p.parentCell}`} className="text-blue-700 dark:text-blue-400">
                            {formatCell(p.parentCell)}
                          </a>
                        </>
                      )}
                    </p>
                    {p.coachRequest && <p className="text-sm text-zinc-500">Coach request: {p.coachRequest}</p>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </main>
    </>
  );
}
