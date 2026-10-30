import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { listPartners } from "@/lib/scenic-partners";
import AppHeader from "../../AppHeader";
import { Chip, PageTitle, card } from "../../ui";
import { PartnerButton } from "./PartnerEditor";

export default function PartnersPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Partners />
    </Suspense>
  );
}

// Scenic City Directors: every partner. A partner's contacts: their own. Sorted by name.
async function Partners() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  const { partners, isDirector } = await listPartners({ pool: db, now: () => new Date() }, user);
  if (!isDirector && !partners.length) redirect("/scenic");

  return (
    <>
      <AppHeader user={user} context="scenic" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link href="/scenic" className="text-sm text-zinc-500 hover:underline">
          ← Scenic City
        </Link>
        <div className="flex items-start justify-between gap-3">
          <PageTitle title="Partners" subtitle={isDirector ? "Schools and organizations, by name" : "Your schools and organizations"} />
          {isDirector && <PartnerButton />}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {partners.map((p) => (
            <li key={p.id}>
              <Link href={`/scenic/partners/${p.id}`} className={`${card} block p-4 hover:ring-scenic-navy/40`}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  {!p.approved && <Chip tone="amber">Not approved</Chip>}
                </div>
                <p className="text-sm text-zinc-500">
                  {p.kind} · {[p.hostsGames && "Hosting games", p.registersTeams && "Registering teams"].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {p.gyms} {p.gyms === 1 ? "gym" : "gyms"} · {p.courts} {p.courts === 1 ? "court" : "courts"}
                </p>
                <p className="truncate text-sm text-zinc-500">{p.contacts.length ? p.contacts.join(", ") : "No contacts yet"}</p>
              </Link>
            </li>
          ))}
        </ul>
        {!partners.length && <p className="text-zinc-500">No partners yet.</p>}
      </main>
    </>
  );
}
