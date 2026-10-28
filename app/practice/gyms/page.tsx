import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { listGyms } from "@/lib/practice/schedule";
import AppHeader from "../../AppHeader";
import { Chip, PageTitle, card } from "../../ui";
import PracticeNav from "../PracticeNav";
import { AddGymButton } from "../PracticeTools";

export default function GymsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Gyms />
    </Suspense>
  );
}

async function Gyms() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");
  const gyms = await listGyms({ pool: db });
  // How many teams list each gym as a practice location, and how many upcoming slots it has.
  const usage = await db.query<{ name: string; teams: number; upcoming: number }>(
    `select g.name,
            (select count(*) from teams t where exists (select 1 from unnest(t.practice_locations) l where lower(l) = lower(g.name)))::int as teams,
            (select count(*) from slots s join courts c on c.id = s.court_id where c.gym_id = g.id and s.starts_at > now())::int as upcoming
     from gyms g`,
  );
  const use = new Map(usage.rows.map((u) => [u.name, u]));

  return (
    <>
      <AppHeader user={user} tab="practice" context="director" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageTitle title="Gyms" subtitle="Practice locations and their courts" />
          <AddGymButton />
        </div>
        <PracticeNav current="gyms" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gyms.map((g) => (
            <section key={g.id} className={`${card} p-4 ${g.active ? "" : "opacity-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{g.name}</h2>
                {!g.active && <Chip tone="red">Inactive</Chip>}
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                {use.get(g.name)?.upcoming ?? 0} upcoming slots · approved for {use.get(g.name)?.teams ?? 0} team
                {use.get(g.name)?.teams === 1 ? "" : "s"}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.courts.map((c) => (
                  <Chip key={c.id} tone={c.active ? "blue" : "zinc"}>
                    {c.name}
                    {!c.active && " (inactive)"}
                  </Chip>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
