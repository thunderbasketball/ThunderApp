"use client";

import { useRef, useState, useTransition } from "react";
import type { AudienceInput } from "@/lib/announcements";
import { Alert, CloseButton, Toast, dialogCls, useConfirm } from "./client-ui";
import { previewAudience, sendAnnouncement } from "./inbox/actions";
import { fieldLabel as label, inputCls, primaryBtn } from "./ui";

type Preview = { names: string[]; emailOnly: number } | null;

const reach = (p: NonNullable<Preview>) => {
  const parts = [`${p.names.length} ${p.names.length === 1 ? "person" : "people"}`];
  if (p.emailOnly) parts.push(`${p.emailOnly} by email (no app login)`);
  return parts.join(" + ");
};

// Director: a bell that sends an announcement to one group (a team, a practice day, a role, everyone…).
export default function NotifyButton({ audience, to, size = "sm" }: { audience: AudienceInput; to: string; size?: "sm" | "md" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<Preview>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const nobody = preview !== null && !preview.names.length && !preview.emailOnly;

  return (
    <>
      <button
        type="button"
        aria-label={`Notify ${to}`}
        title={`Notify ${to}`}
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setError(null);
          setPreview(null);
          dialog.current?.showModal();
          const r = await previewAudience(audience);
          if (r.ok) setPreview({ names: r.names, emailOnly: r.emailOnly });
          else setError(r.message);
        }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full text-thunder-orange ring-1 ring-thunder-orange/40 hover:bg-orange-50 dark:hover:bg-orange-500/10 ${
          size === "md" ? "size-9" : "size-7"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
          className={size === "md" ? "size-5" : "size-4"}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
      </button>
      {done && <Toast key={done} message={done} />}
      {confirmDialog}
      <dialog ref={dialog} className={dialogCls} onClick={(e) => e.target === dialog.current && close()}>
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!preview) return;
            const ok = await confirm({
              title: `Send to ${reach(preview)}?`,
              message: (
                <p>
                  &ldquo;{title.trim()}&rdquo; goes out now. It can be removed later from Announcements → Sent, but emails can&apos;t be
                  taken back.
                </p>
              ),
              confirmLabel: "Send",
              tone: "warning",
            });
            if (!ok) return;
            start(async () => {
              setError(null);
              const r = await sendAnnouncement({ ...audience, title, body });
              if (!r.ok) return setError(r.message);
              close();
              setTitle("");
              setBody("");
              setDone(`Sent to ${r.count} ${r.count === 1 ? "person" : "people"}${r.emailed ? ` and emailed ${r.emailed}` : ""}.`);
            });
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Notify {to}</h2>
              <p className="text-sm text-zinc-500">{preview ? `Goes to ${reach(preview)}` : "Finding who this reaches…"}</p>
            </div>
            <CloseButton onClick={close} />
          </div>
          {preview && preview.names.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500">Who</summary>
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">{preview.names.join(", ")}</p>
            </details>
          )}
          {nobody && <Alert tone="red">Nobody to notify here yet.</Alert>}
          <label className="block">
            <span className={label}>Title</span>
            <input className={inputCls} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Message</span>
            <textarea className={`${inputCls} min-h-32`} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} />
          </label>
          {error && <Alert tone="red">{error}</Alert>}
          <button type="submit" disabled={busy || !preview || nobody || !title.trim() || !body.trim()} className={primaryBtn}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      </dialog>
    </>
  );
}
