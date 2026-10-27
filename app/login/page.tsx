import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, devBypass } from "@/lib/auth/server";
import LoginFlow from "./LoginFlow";

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
      <h1 className="mb-8 text-center text-3xl font-bold tracking-tight">⚡ Thunder Basketball</h1>
      {devBypass && (
        <p className="mb-6 rounded-lg bg-yellow-100 px-4 py-3 text-sm text-yellow-900">
          Testing mode: enter your cell, then code 123456. New numbers become Directors. No emails sent.{" "}
          <a href="/dev-login" className="font-semibold underline">
            Skip login →
          </a>
        </p>
      )}
      <Suspense>
        <AlreadyLoggedIn />
      </Suspense>
      <LoginFlow />
    </main>
  );
}

async function AlreadyLoggedIn() {
  if (await currentUser()) redirect("/");
  return null;
}
