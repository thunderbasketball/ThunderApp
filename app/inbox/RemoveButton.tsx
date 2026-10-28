"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../client-ui";
import { deleteAnnouncement } from "./actions";

export default function RemoveButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
      {confirmDialog}
      <button
        type="button"
        disabled={busy}
        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
        onClick={async () => {
          const ok = await confirm({
            title: `Remove “${title}”?`,
            message: (
              <p>
                It disappears from everyone&apos;s inbox, and no reminder email will go out for it.{" "}
                <strong className="font-semibold text-red-600 dark:text-red-400">It can&apos;t be undone.</strong> Anyone who already read
                it or got the email has still seen it.
              </p>
            ),
            confirmLabel: "Remove",
          });
          if (!ok) return;
          start(async () => {
            const r = await deleteAnnouncement(id);
            if (!r.ok) setError(r.message);
            else router.refresh();
          });
        }}
      >
        {busy ? "Removing…" : "Remove"}
      </button>
      {error && <span className="ml-2 text-sm text-red-600">{error}</span>}
    </>
  );
}
