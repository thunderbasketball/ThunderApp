"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ChatOption } from "@/lib/chat";
import { CloseButton, dialogCls } from "../client-ui";

// Pick who to chat with. Opening a chat that already has messages just goes to it.
export default function NewChatButton({ options }: { options: ChatOption[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = options.filter((o) => !q || o.title.toLowerCase().includes(q));
  const groups = [...new Set(shown.map((o) => o.group))];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSearch("");
          dialog.current?.showModal();
        }}
        className="shrink-0 rounded-full bg-thunder-blue px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm hover:bg-thunder-blue-dark"
      >
        + New chat
      </button>
      <dialog ref={dialog} className={dialogCls} onClick={(e) => e.target === dialog.current && close()}>
        <div className="flex max-h-[85vh] flex-col p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">New chat</h2>
            <CloseButton onClick={close} />
          </div>
          {options.length > 8 && (
            <input
              className="mt-3 w-full rounded-xl border-0 bg-white px-3 py-2.5 text-base ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-thunder-blue dark:bg-zinc-900 dark:ring-white/15"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a coach or team…"
            />
          )}
          <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto">
            {groups.map((g) => (
              <section key={g}>
                <h3 className="mb-1 text-xs font-bold tracking-wide text-zinc-500 uppercase">{g}</h3>
                <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-950/10 dark:divide-white/5 dark:ring-white/15">
                  {shown
                    .filter((o) => o.group === g)
                    .map((o) => (
                      <li key={o.key}>
                        <Link
                          href={`/chat/${o.key}`}
                          onClick={close}
                          className="block px-3 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-white/5"
                        >
                          {o.title}
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
            {!shown.length && <p className="text-sm text-zinc-500">No matches.</p>}
          </div>
        </div>
      </dialog>
    </>
  );
}
