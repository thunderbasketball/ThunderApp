"use client";

import { useState, useTransition } from "react";
import { logout, requestAccess } from "./login/actions";

export function LogoutButton() {
  const [busy, start] = useTransition();
  return (
    <button
      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
      disabled={busy}
      onClick={() =>
        start(async () => {
          await logout();
          window.location.replace("/login");
        })
      }
    >
      Log out
    </button>
  );
}

export function RequestAccess() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (message) return <p className="rounded-lg bg-green-50 px-4 py-3 text-green-800 dark:bg-green-950 dark:text-green-200">{message}</p>;
  return (
    <div className="space-y-4">
      <p>You don&apos;t have access to Thunder Basketball yet.</p>
      <button
        className="w-full rounded-lg bg-blue-700 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const s = await requestAccess();
            setMessage(s.step === "done" || s.step === "error" ? s.message : "Request sent.");
          })
        }
      >
        Request Access
      </button>
    </div>
  );
}
