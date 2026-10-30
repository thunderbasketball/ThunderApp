import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { getPartner } from "@/lib/scenic-partners";
import AppHeader from "../../../AppHeader";
import { Chip, PageTitle, card } from "../../../ui";
import { PartnerButton } from "../PartnerEditor";
import { AddCourt, GymButton, RemoveCourt } from "./GymTools";

export default function PartnerPage({ params }: PageProps<"/scenic/partners/[id]">) {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Partner params={params} />
    </Suspense>
  );
}

// One partner: details, contacts, gyms and courts. Its contacts and Scenic City Directors manage the gyms and courts.
async function Partner({ params }: { params: PageProps<"/scenic/partners/[id]">["params"] }) {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  const { id } = await params;
  const p = await getPartner({ pool: db, now: () => new Date() }, user, id);
  if (!p) notFound();

  return (
    <>
      <AppHeader user={user} context="scenic" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link href="/scenic/partners" className="text-sm text-zinc-500 hover:underline">
          ← Partners
        </Link>
        <div className="flex items-start justify-between gap-3">
          <PageTitle
            title={p.name}
            subtitle={`${p.kind} · ${[p.hostsGames && "Hosting games", p.registersTeams && "Registering teams"].filter(Boolean).join(" · ")}`}
          />
          {p.canEditPartner && <PartnerButton partner={p} />}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {!p.approved && <Chip tone="amber">Not approved</Chip>}
          <span className="text-zinc-500">Contacts:</span>
          {p.contacts.length ? p.contacts.map((c) => <Chip key={c}>{c}</Chip>) : <span className="text-zinc-500">none yet</span>}
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Gyms &amp; courts</h2>
          <GymButton partnerId={p.id} />
        </div>
        {!p.gymList.length && (
          <p className="text-zinc-500">{p.hostsGames ? "No gyms yet. Add the gyms where you can host Scenic City games." : "No gyms yet."}</p>
        )}
        <ul className="space-y-3">
          {p.gymList.map((g) => (
            <li key={g.id} className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{g.name}</h3>
                  {g.address && <p className="text-sm text-zinc-500">{g.address}</p>}
                </div>
                <GymButton partnerId={p.id} gym={g} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {g.courts.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pr-1 pl-3 text-sm dark:bg-zinc-800"
                  >
                    {c.name}
                    <RemoveCourt id={c.id} label={`${g.name} ${c.name}`} />
                  </span>
                ))}
                <AddCourt gymId={g.id} suggestion={`Court ${g.courts.length + 1}`} />
              </div>
              {!g.courts.length && <p className="mt-2 text-xs text-zinc-500">Add at least one court.</p>}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
