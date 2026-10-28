import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { audienceChoices } from "@/lib/announcements";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import AppHeader from "../../AppHeader";
import { PageTitle } from "../../ui";
import ComposeForm from "./ComposeForm";

export default function NewAnnouncementPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <NewAnnouncement />
    </Suspense>
  );
}

async function NewAnnouncement() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/inbox");
  const choices = await audienceChoices({ pool: db, now: () => new Date() }, user);
  return (
    <>
      <AppHeader user={user} context="director" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <Link href="/inbox?view=sent" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          ← Announcements
        </Link>
        <div className="mt-2">
          <PageTitle title="New announcement" subtitle="Shows in their inbox right away. Unread after 8 hours? They get it by email." />
        </div>
        <ComposeForm choices={choices} />
      </main>
    </>
  );
}
