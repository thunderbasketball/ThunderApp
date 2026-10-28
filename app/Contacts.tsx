"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Contact } from "@/lib/teams";
import { CloseButton, dialogCls } from "./client-ui";

type Role = Contact["role"];

export const ROLE_BADGE: Record<Role, { short: string; label: string; cls: string }> = {
  HeadCoach: { short: "HC", label: "Head Coach", cls: "bg-thunder-blue" },
  AsstCoach: { short: "AC", label: "Assistant Coach", cls: "bg-emerald-600" },
  Manager: { short: "TM", label: "Team Manager", cls: "bg-violet-600" },
  TeamParent: { short: "TP", label: "Team Parent", cls: "bg-thunder-orange" },
};

const pretty = (cell: string) => `(${cell.slice(0, 3)}) ${cell.slice(3, 6)}-${cell.slice(6)}`;

export function RoleDot({ role }: { role: Role }) {
  const b = ROLE_BADGE[role];
  return (
    <span
      title={b.label}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${b.cls}`}
    >
      {b.short}
    </span>
  );
}

type Person = Pick<Contact, "role" | "email"> & { first: string | null; last: string | null; cell: string | null };

// A role circle and the person's name; tapping the name opens their contact card.
// `about` is the line under their name on the card (team, or the player they registered).
// `chatKey`: an in-app chat with this person (coaches with a login).
export function ContactChip({ person, about, chatKey }: { person: Person; about: string; chatKey?: string }) {
  const cell = person.cell && /^\d{10}$/.test(person.cell) ? person.cell : null;
  const name = [person.first, person.last].filter(Boolean).join(" ") || "No name";
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const action =
    "flex flex-1 flex-col items-center gap-1 rounded-xl bg-zinc-100 px-3 py-3 text-sm font-medium text-thunder-blue hover:bg-zinc-200 dark:bg-zinc-800 dark:text-blue-400";
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
      >
        <RoleDot role={person.role} />
        <span className="underline decoration-zinc-300 underline-offset-2">{name}</span>
      </button>
      <dialog ref={dialog} className={dialogCls} onClick={(e) => e.target === dialog.current && close()}>
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <RoleDot role={person.role} />
              <div>
                <h2 className="text-lg font-semibold">{name}</h2>
                <p className="text-sm text-zinc-500">
                  {ROLE_BADGE[person.role].label} · {about}
                </p>
              </div>
            </div>
            <CloseButton onClick={close} />
          </div>
          <div className="space-y-1 text-sm">
            {cell ? <p>{pretty(cell)}</p> : <p className="text-zinc-400">No cell on file</p>}
            {person.email ? <p className="break-all">{person.email}</p> : <p className="text-zinc-400">No email on file</p>}
          </div>
          <div className="flex gap-2">
            {chatKey && (
              <Link href={`/chat/${chatKey}`} className={action}>
                💬 Chat
              </Link>
            )}
            {cell && (
              <>
                <a href={`tel:+1${cell}`} className={action}>
                  📞 Call
                </a>
                <a href={`sms:+1${cell}`} className={action}>
                  📱 Text
                </a>
              </>
            )}
            {person.email && (
              <a href={`mailto:${encodeURIComponent(person.email)}`} className={action}>
                ✉️ Email
              </a>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

// Opens the phone's Messages app with everyone in one group text. iPhones/Macs and Android phones
// expect different link formats.
export function GroupTextButton({ cells, label }: { cells: (string | null)[]; label: string }) {
  const numbers = [...new Set(cells.filter((c): c is string => !!c && /^\d{10}$/.test(c)))].map((c) => `+1${c}`);
  return (
    <button
      type="button"
      disabled={!numbers.length}
      onClick={() => {
        const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
        window.location.href = apple ? `sms://open?addresses=${numbers.join(",")}` : `sms:${numbers.join(",")}`;
      }}
      className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-thunder-blue ring-1 ring-thunder-blue/30 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
    >
      💬 {label} ({numbers.length})
    </button>
  );
}
