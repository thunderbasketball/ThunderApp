import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import AppHeader from "../AppHeader";
import { PageTitle } from "../ui";
import DevicePreview from "./DevicePreview";

export default function PreviewPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Preview />
    </Suspense>
  );
}

async function Preview() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");

  return (
    <>
      <AppHeader user={user} context="director" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <PageTitle title="Preview" subtitle="See the app at phone, tablet and desktop size. You're logged in as yourself inside it." />
        <DevicePreview />
      </main>
    </>
  );
}
