"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast, useConfirm } from "../../client-ui";
import { deleteEvent, refreshPlayers } from "../actions";

// Director: add newly registered players, or delete the event.
export default function EventTools({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const btn =
    "rounded-full px-3 py-1.5 text-sm font-medium ring-1 disabled:opacity-50 text-zinc-600 ring-zinc-950/10 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-zinc-800";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {confirmDialog}
      {done && <Toast key={done} message={done} />}
      <button
        type="button"
        disabled={busy}
        className={btn}
        onClick={() =>
          start(async () => {
            const r = await refreshPlayers(id);
            setDone(
              r.ok
                ? r.added
                  ? `Added ${r.added} newly registered player${r.added === 1 ? "" : "s"}.`
                  : "No new players to add."
                : r.message,
            );
            router.refresh();
          })
        }
      >
        ↻ Update player list
      </button>
      <button
        type="button"
        disabled={busy}
        className={`${btn} text-red-600 ring-red-600/30 dark:text-red-400`}
        onClick={async () => {
          const ok = await confirm({
            title: `Delete “${name}”?`,
            message: (
              <p>
                The event and all its check-ins are removed.{" "}
                <strong className="font-semibold text-red-600 dark:text-red-400">It can&apos;t be undone.</strong>
              </p>
            ),
            confirmLabel: "Delete event",
          });
          if (!ok) return;
          start(async () => {
            const r = await deleteEvent(id);
            if (r.ok) router.push("/events");
            else setDone(r.message);
          });
        }}
      >
        Delete event
      </button>
    </div>
  );
}
