import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import LoginFlow from "./LoginFlow";
import { card } from "../ui";

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image src="/brand/courtcaptain.png" alt="CourtCaptain" width={768} height={512} priority className="h-auto w-60" />
        <h1 className="sr-only">CourtCaptain</h1>
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Thunder Basketball · Scenic City Basketball</p>
      </div>
      {devBypass && (
        <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200">
          Testing mode: enter your cell, then code 123456. New numbers become Directors. No emails sent.{" "}
          <a href="/dev-login" className="font-semibold underline">
            Skip login →
          </a>
        </p>
      )}
      <Suspense>
        <AlreadyLoggedIn />
      </Suspense>
      <div className={`${card} p-5`}>
        <LoginFlow />
      </div>
    </main>
  );
}

async function AlreadyLoggedIn() {
  if (await currentUser()) redirect("/");
  return null;
}
