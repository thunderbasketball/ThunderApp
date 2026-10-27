import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listUsers } from "@/lib/users";
import { RequestAccess } from "./HomeActions";
import AppHeader from "./AppHeader";
import UserList from "./UserList";

// Placeholder home until Phase 3 (roles & dashboards).
export default function Home() {
  return (
    <Suspense fallback={<p className="p-4">Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");

  return (
    <>
      <AppHeader user={user} tab="users" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {user.isDirector ? (
          <UserList users={await listUsers(user)} />
        ) : user.hasThunderRole ? (
          <p className="text-zinc-600 dark:text-zinc-400">You&apos;re logged in. Team dashboards arrive in Phase 3.</p>
        ) : user.requestPending ? (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-green-800 dark:bg-green-950 dark:text-green-200">
            Request pending. The Director will review it.
          </p>
        ) : (
          <RequestAccess />
        )}
      </main>
    </>
  );
}
