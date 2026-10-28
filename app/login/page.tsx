import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import LoginFlow from "./LoginFlow";
import { card } from "../ui";

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-md">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-8">
            <path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.5L13.5 2Z" />
          </svg>
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Thunder Basketball</h1>
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
