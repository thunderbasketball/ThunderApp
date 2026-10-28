"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TZ } from "@/lib/time";
import { dialogCls } from "./client-ui";
import { acknowledge } from "./inbox/actions";

type Item = { id: string; title: string; body: string; sentBy: string; createdAt: Date };

// New announcements (under 24 hours old) pop up until the person taps Got it. It can't be closed any other way.
export default function AnnouncementPopup({ items }: { items: Item[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const key = items.map((i) => i.id).join(",");

  useEffect(() => {
    if (key && !dialog.current?.open) dialog.current?.showModal();
  }, [key]);

  if (!items.length) return null;
  return (
    <dialog ref={dialog} className={dialogCls} onCancel={(e) => e.preventDefault()}>
      <div className="flex max-h-[85vh] flex-col p-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            📣
          </span>
          <h2 className="text-lg font-semibold">{items.length === 1 ? "New announcement" : `${items.length} new announcements`}</h2>
        </div>
        <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
          {items.map((a) => (
            <article key={a.id} className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5 dark:bg-zinc-800 dark:ring-white/10">
              <h3 className="font-semibold">{a.title}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {a.sentBy} ·{" "}
                {new Date(a.createdAt).toLocaleString("en-US", {
                  timeZone: TZ,
                  weekday: "short",
                  month: "numeric",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-2 text-sm whitespace-pre-wrap">{a.body}</p>
            </article>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-thunder-blue px-4 py-3 text-lg font-semibold text-white shadow-sm hover:bg-thunder-blue-dark disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const r = await acknowledge(items.map((i) => i.id));
              if (!r.ok) return setError(r.message);
              dialog.current?.close();
              router.refresh();
            })
          }
        >
          {busy ? "…" : "Got it"}
        </button>
      </div>
    </dialog>
  );
}
