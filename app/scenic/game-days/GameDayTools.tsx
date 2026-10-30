"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGameDays, deleteGameDay } from "../actions";
import { Alert, CloseButton, Toast, dialogCls, useConfirm } from "../../client-ui";
import { fieldLabel, inputCls, pillCls, primaryBtn } from "../../ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Directors: one date, or a weekly repeat (weekdays between two dates).
export function AddGameDays() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const [repeat, setRepeat] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([6]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const r = await addGameDays(repeat ? { from, to, weekdays } : { from });
      if (r.ok) {
        close();
        setDone(r.added === 1 ? "1 game day added." : `${r.added} game days added.`);
        router.refresh();
      } else setError(r.message);
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
        className="shrink-0 rounded-full bg-scenic-navy px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-scenic-navy"
      >
        + Add
      </button>
      {done && <Toast key={done} message={done} />}
      <dialog ref={dialog} className={dialogCls} onClick={(e) => e.target === dialog.current && close()}>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add game days</h2>
            <CloseButton onClick={close} />
          </div>
          <div className="flex gap-2">
            <button type="button" aria-pressed={!repeat} className={pillCls(!repeat)} onClick={() => setRepeat(false)}>
              One date
            </button>
            <button type="button" aria-pressed={repeat} className={pillCls(repeat)} onClick={() => setRepeat(true)}>
              Weekly repeat
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={fieldLabel}>{repeat ? "From" : "Date"}</span>
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            {repeat && (
              <label className="block">
                <span className={fieldLabel}>To</span>
                <input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
              </label>
            )}
          </div>
          {repeat && (
            <div>
              <span className={fieldLabel}>Every</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((w, i) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={weekdays.includes(i)}
                    className={pillCls(weekdays.includes(i))}
                    onClick={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i])}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <Alert tone="red">{error}</Alert>}
          <button type="submit" className={primaryBtn} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
      </dialog>
    </>
  );
}

export function RemoveGameDay({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={`Remove ${label}`}
        className="rounded-full px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-red-600/20 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
        onClick={async () => {
          if (
            await confirm({
              title: `Remove ${label}?`,
              message: "It's no longer a game day. Any court hours partners gave for it are removed too.",
              confirmLabel: "Remove",
            })
          )
            start(async () => {
              await deleteGameDay(id);
              router.refresh();
            });
        }}
      >
        Remove
      </button>
      {confirmDialog}
    </>
  );
}
