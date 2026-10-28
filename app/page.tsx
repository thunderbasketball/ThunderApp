import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listUsers } from "@/lib/users";
import { RequestAccess } from "./HomeActions";
import AppHeader from "./AppHeader";
import UserList from "./UserList";
import { Notice } from "./ui";

// Placeholder home until Phase 3 (roles & dashboards).
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

  return (
    <>
      <AppHeader user={user} tab="users" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {user.isDirector ? (
          <UserList users={await listUsers(user)} />
        ) : user.hasThunderRole ? (
          <p className="text-zinc-500 dark:text-zinc-400">You&apos;re logged in. Team dashboards arrive in Phase 3.</p>
        ) : user.requestPending ? (
          <Notice tone="green">Request pending. The Director will review it.</Notice>
        ) : (
          <RequestAccess />
        )}
      </main>
    </>
  );
}
