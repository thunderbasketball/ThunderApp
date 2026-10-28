import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { currentContexts } from "@/lib/contexts-server";
import { db } from "@/lib/db";
import { listEvents, type EventSummary } from "@/lib/events";
import { localParts, zonedTime } from "@/lib/time";
import AppHeader from "../AppHeader";
import { PageTitle, card } from "../ui";
import { eventWhen } from "./format";

export default function EventsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Events />
    </Suspense>
  );
}

async function Events() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  const events = await listEvents({ pool: db, now: () => new Date() }, user);
  if (!user.isDirector && !events.length) redirect("/");
  const { active } = await currentContexts(user);

  // Today's and later events first (soonest first); earlier ones below, newest first.
  const t = localParts(new Date());
  const today = zonedTime(t.year, t.month, t.day);
  const upcoming = events.filter((e) => e.startsAt >= today);
  const past = events.filter((e) => e.startsAt < today).reverse();

  return (
    <>
      <AppHeader user={user} tab="events" context={user.isDirector ? "director" : active?.key} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <PageTitle
            title="Events"
            subtitle={user.isDirector ? "Tryouts, evaluations and clinics with player check-in" : "Events you run check-in for"}
          />
          {user.isDirector && (
            <Link
              href="/events/new"
              className="shrink-0 rounded-full bg-thunder-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-thunder-blue-dark"
            >
              + New event
            </Link>
          )}
        </div>
        {!events.length && <p className="text-zinc-500">No events yet. Tap “+ New event” to create one.</p>}
        <div className="space-y-3">
          {upcoming.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
        {past.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer font-semibold text-zinc-500">Past events ({past.length})</summary>
            <div className="mt-3 space-y-3">
              {past.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </div>
          </details>
        )}
      </main>
    </>
  );
}

function EventCard({ e }: { e: EventSummary }) {
  const unknown = e.total - e.here - e.absent;
  return (
    <Link href={`/events/${e.id}`} className={`${card} block p-4 hover:bg-zinc-50 dark:hover:bg-white/5`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold">{e.name}</h2>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          <span className="text-emerald-600">✓ {e.here}</span> · <span className="text-red-600">✗ {e.absent}</span> ·{" "}
          <span className="text-zinc-500">? {unknown}</span>
        </span>
      </div>
      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
        {eventWhen(e.startsAt)}
        {e.location && ` · ${e.location}`} · {e.total} players
      </p>
      {e.staff.length > 0 && <p className="mt-0.5 text-xs text-zinc-400">Check-in: {e.staff.join(", ")}</p>}
    </Link>
  );
}
