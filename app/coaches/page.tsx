import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listVolunteerCoaches } from "@/lib/coaches";
import { formatCell } from "@/lib/phone";
import { gradeLabel } from "@/lib/grades";
import AppHeader from "../AppHeader";

export default function CoachesPage() {
  return (
    <Suspense fallback={<p className="p-4">Loading…</p>}>
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
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Volunteer coaches ({all.length})</h2>
          <p className="text-sm text-zinc-500">
            {heads} Head · {all.length - heads} Assistant · parents who offered to coach at registration
          </p>
        </div>
        {!all.length && <p className="text-zinc-600">No volunteers yet.</p>}
        <div className="space-y-3">
          {groups.map((g) => (
            <details key={`${g.gender}-${g.grade}`} className="rounded-lg border border-zinc-200 dark:border-zinc-800" open>
              <summary className="cursor-pointer select-none px-4 py-3 font-semibold">
                {g.gender} · {gradeLabel(g.grade)} <span className="font-normal text-zinc-500">({g.coaches.length})</span>
              </summary>
              <ul className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {g.coaches.map((c) => (
                  <li key={c.registrantId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p>
                        {c.firstName} <span className="font-bold">{c.lastName}</span>
                        {!c.firstName && !c.lastName && <span className="text-zinc-500">No parent name</span>}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.isHead
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        }`}
                      >
                        {c.role}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {c.cell && c.cell.length === 10 && (
                        <a href={`tel:${c.cell}`} className="text-blue-700 dark:text-blue-400">
                          {formatCell(c.cell)}
                        </a>
                      )}
                      {c.cell && c.cell.length === 10 && c.email && " · "}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="break-all text-blue-700 dark:text-blue-400">
                          {c.email}
                        </a>
                      )}
                    </p>
                    <p className="text-sm text-zinc-500">Player: {c.playerName}</p>
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
