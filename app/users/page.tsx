import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { syncOn } from "@/lib/masterauth/pin-box";
import { pushStatus } from "@/lib/masterauth/push";
import { TZ } from "@/lib/time";
import { listUsers } from "@/lib/users";
import AppHeader from "../AppHeader";
import UserList from "../UserList";
import { Notice } from "../ui";

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
  const sheet = syncOn() ? await pushStatus(db) : null;

  return (
    <>
      <AppHeader user={user} tab="users" context="director" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {sheet?.ok === false && (
          <Notice tone="red">
            Couldn&apos;t update the MasterAuth sheet
            {sheet.checkedAt && (
              <>
                {" "}
                (
                {sheet.checkedAt.toLocaleString("en-US", {
                  timeZone: TZ,
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                )
              </>
            )}
            : {sheet.message}. {sheet.waiting} {sheet.waiting === 1 ? "person is" : "people are"} waiting; it keeps trying.
          </Notice>
        )}
        <UserList users={await listUsers(user)} viewer={user} />
      </main>
    </>
  );
}
