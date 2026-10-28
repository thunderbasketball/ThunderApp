import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { staffChoices } from "@/lib/events";
import { listGyms } from "@/lib/practice/schedule";
import AppHeader from "../../AppHeader";
import { PageTitle } from "../../ui";
import NewEventForm from "./NewEventForm";

export default function NewEventPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <NewEvent />
    </Suspense>
  );
}

async function NewEvent() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/events");
  const deps = { pool: db, now: () => new Date() };
  const [people, gyms] = await Promise.all([staffChoices(deps, user), listGyms(deps)]);
  return (
    <>
      <AppHeader user={user} tab="events" context="director" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <Link href="/events" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          ← Events
        </Link>
        <div className="mt-2">
          <PageTitle title="New event" subtitle="Players are picked from registrations by gender and grade" />
        </div>
        <NewEventForm people={people} gyms={gyms.filter((g) => g.active).map((g) => g.name)} />
      </main>
    </>
  );
}
