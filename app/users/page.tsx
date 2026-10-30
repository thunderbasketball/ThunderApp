import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { listUsers } from "@/lib/users";
import AppHeader from "../AppHeader";
import UserList from "../UserList";

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="p-4 text-zinc-500">Loading…</p>}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const user = await currentUser();
  if (!user) redirect(devBypass ? "/dev-login" : "/login");
  if (!user.isDirector) redirect("/");

  return (
    <>
      <AppHeader user={user} tab="users" context="director" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <UserList users={await listUsers(user)} viewer={user} />
      </main>
    </>
  );
}
