"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@/lib/chat";
import { TZ } from "@/lib/time";
import { postMessage } from "../actions";

const REFRESH_SECONDS = 5;

const stamp = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

// Messages oldest to newest, newest at the bottom; checks for new ones every few seconds while open.
// `reload` fetches new messages (the page refreshes itself by default); `popup` lays it out for a pop-up.
export default function ChatThread({
  chatKey,
  me,
  messages,
  reload,
  popup = false,
}: {
  chatKey: string;
  me: string;
  messages: ChatMessage[];
  reload?: () => void;
  popup?: boolean;
}) {
  const router = useRouter();
  const refresh = reload ?? router.refresh;
  const [, startRefresh] = useTransition();
  const [sending, startSend] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") startRefresh(() => refresh());
    }, REFRESH_SECONDS * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  function send() {
    const body = text.trim();
    if (!body || sending) return;
    startSend(async () => {
      setError(null);
      const r = await postMessage(chatKey, body);
      if (!r.ok) return setError(r.message);
      setText("");
      refresh();
    });
  }

  return (
    <div className={`flex flex-1 flex-col ${popup ? "min-h-0" : ""}`}>
      <div className={`flex-1 space-y-2 py-4 ${popup ? "min-h-48 overflow-y-auto" : ""}`}>
        {!messages.length && <p className="py-8 text-center text-sm text-zinc-500">No messages yet. Say hello.</p>}
        {messages.map((m, i) => {
          const mine = m.senderId === me;
          const showName = !mine && messages[i - 1]?.senderId !== m.senderId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {showName && <span className="mb-0.5 px-1 text-xs font-medium text-zinc-500">{m.sender}</span>}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] whitespace-pre-wrap break-words ${
                  mine
                    ? "rounded-br-md bg-thunder-blue text-white"
                    : "rounded-bl-md bg-white ring-1 ring-zinc-950/5 dark:bg-zinc-800 dark:ring-white/10"
                }`}
              >
                {m.body}
              </div>
              <span className="mt-0.5 px-1 text-[11px] text-zinc-400">{stamp(m.at)}</span>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form
        className={
          popup
            ? "border-t border-zinc-950/5 pt-3 dark:border-white/10"
            : "chat-composer sticky bottom-0 -mx-4 border-t border-zinc-950/5 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-zinc-950/95"
        }
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends on a keyboard; Shift+Enter adds a line. Phones use the Send button.
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-zinc-100 px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-thunder-blue dark:bg-zinc-800 [field-sizing:content]"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="h-11 shrink-0 rounded-full bg-thunder-blue px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
