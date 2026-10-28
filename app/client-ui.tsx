"use client";
// Small client-side pieces shared by the pop-up forms.
import { useEffect, useState, type ReactNode } from "react";

export const dialogCls =
  "m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-sm dark:bg-zinc-900 dark:text-zinc-100";

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="-mr-2 rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="size-5">
        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
      </svg>
    </button>
  );
}

export function Alert({ tone, children }: { tone: "red" | "green"; children: ReactNode }) {
  const cls =
    tone === "red"
      ? "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300"
      : "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  return (
    <p role={tone === "red" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${cls}`}>
      {children}
    </p>
  );
}

// A short confirmation at the bottom of the screen; fades out after 5 seconds.
export function Toast({ message }: { message: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-md rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-white dark:text-zinc-900"
    >
      {message}
    </p>
  );
}
