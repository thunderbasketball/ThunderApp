import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listUsers } from "@/lib/users";
import { LogoutButton, RequestAccess } from "./HomeActions";
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

  const roles = [user.isDirector && "Director", user.isCoach && "Coach"].filter(Boolean) as string[];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/95">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {user.firstName} {user.lastName}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {roles.map((r) => (
                <span key={r} className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  {r}
                </span>
              ))}
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>
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
