import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { currentContexts } from "@/lib/contexts-server";
import AppHeader from "./AppHeader";
import { RequestAccess } from "./HomeActions";
import { Notice } from "./ui";

// Home: go to the role the person used last (Director → Teams, or one of their teams).
export default function Home() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  const { active } = await currentContexts(user);
  if (active) redirect(active.href);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {user.hasThunderRole ? (
          <Notice tone="green">You&apos;re not on a team yet. The Director will add you.</Notice>
        ) : user.requestPending ? (
          <Notice tone="green">Request pending. The Director will review it.</Notice>
        ) : (
          <RequestAccess />
        )}
      </main>
    </>
  );
}
