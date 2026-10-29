"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatThread as Thread } from "@/lib/chat";
import ChatThread from "./chat/[key]/ChatThread";
import { loadChat } from "./chat/actions";
import { Alert, CloseButton, dialogCls } from "./client-ui";

// A button that opens one chat in a pop-up (who can see it is checked on the server).
// `children` is the button's look; `allChats` adds a link to the full chat list.
export default function ChatPopup({
  chatKey,
  label,
  className,
  children,
  allChats = false,
}: {
  chatKey: string;
  label: string;
  className: string;
  children: ReactNode;
  allChats?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [chat, setChat] = useState<{ thread: Thread; me: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await loadChat(chatKey);
    if (!r.ok) return setError(r.message);
    setError(null);
    setChat({ thread: r.thread, me: r.me });
  }, [chatKey]);

  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setError(null);
          dialog.current?.showModal();
          reload();
        }}
        className={className}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        className={dialogCls}
        // Closing stops checking for messages and updates the unread badges.
        onClose={() => {
          setChat(null);
          router.refresh();
        }}
        onClick={(e) => e.target === dialog.current && close()}
      >
        <div className="flex h-[80dvh] flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{chat?.thread.title ?? label}</h2>
              {chat && (
                <details className="text-xs text-zinc-500">
                  <summary className="cursor-pointer">{chat.thread.members.length} people</summary>
                  <p className="mt-1">{chat.thread.members.join(", ")}</p>
                </details>
              )}
            </div>
            <CloseButton onClick={close} />
          </div>
          {allChats && (
            <Link href="/chat" onClick={close} className="mt-1 text-sm font-medium text-thunder-blue dark:text-blue-400">
              All chats →
            </Link>
          )}
          {error && (
            <div className="mt-3">
              <Alert tone="red">{error}</Alert>
            </div>
          )}
          {!chat && !error && <p className="mt-6 text-center text-sm text-zinc-500">Loading…</p>}
          {chat && <ChatThread chatKey={chat.thread.key} me={chat.me} messages={chat.thread.messages} reload={reload} popup />}
        </div>
      </dialog>
    </>
  );
}
