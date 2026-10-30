"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PartnerOption } from "@/lib/scenic";
import { requestJoin } from "../../scenic/actions";
import { Alert } from "../../client-ui";
import { card, fieldLabel, inputCls, pillCls, primaryBtn } from "../../ui";

const NEW = "new";

// Partner (pick a school/organization or add one) or Solo. Sent as a request for a Scenic City Director to approve.
export default function JoinForm({ firstName, partners }: { firstName: string; partners: PartnerOption[] }) {
  const router = useRouter();
  const [wants, setWants] = useState<"Partner" | "Solo" | null>(null);
  const [partnerId, setPartnerId] = useState(partners.length ? "" : NEW);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"School" | "Organization" | null>(null);
  const [hosts, setHosts] = useState(false);
  const [registers, setRegisters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await requestJoin(
        wants === "Partner" && partnerId === NEW
          ? { wants, newPartner: { name, kind, hostsGames: hosts, registersTeams: registers } }
          : { wants, partnerId },
      );
      if (r.ok) router.refresh();
      else setError(r.message);
    });

  return (
    <form
      className={`${card} space-y-5 p-5`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm">
        Welcome, <span className="font-semibold">{firstName}</span>. How are you joining?
      </p>
      <div className="grid gap-2">
        {(
          [
            ["Partner", "A school or organization: hosting games, registering teams, or both."],
            ["Solo", "On your own: register and manage your own team or teams."],
          ] as const
        ).map(([v, about]) => (
          <button
            key={v}
            type="button"
            aria-pressed={wants === v}
            onClick={() => setWants(v)}
            className={`rounded-xl p-3 text-left ring-1 ring-inset transition-colors ${
              wants === v ? "bg-scenic-navy text-white ring-scenic-navy" : "ring-zinc-950/10 hover:bg-zinc-50 dark:ring-white/15 dark:hover:bg-zinc-800"
            }`}
          >
            <span className="block font-semibold">{v}</span>
            <span className={`block text-sm ${wants === v ? "text-white/80" : "text-zinc-500 dark:text-zinc-400"}`}>{about}</span>
          </button>
        ))}
      </div>

      {wants === "Partner" && (
        <div className="space-y-4">
          <label className="block">
            <span className={fieldLabel}>Your school or organization</span>
            <select className={inputCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              {partners.length > 0 && (
                <option value="" disabled>
                  Pick one…
                </option>
              )}
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.kind})
                </option>
              ))}
              <option value={NEW}>+ Add a new one</option>
            </select>
          </label>
          {partnerId === NEW && (
            <div className="space-y-4 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <label className="block">
                <span className={fieldLabel}>Name</span>
                <input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </label>
              <div>
                <span className={fieldLabel}>Type</span>
                <div className="flex gap-2">
                  {(["School", "Organization"] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={kind === k} className={pillCls(kind === k)} onClick={() => setKind(k)}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className={fieldLabel}>You&apos;ll be</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={hosts} className={pillCls(hosts)} onClick={() => setHosts(!hosts)}>
                    Hosting games
                  </button>
                  <button type="button" aria-pressed={registers} className={pillCls(registers)} onClick={() => setRegisters(!registers)}>
                    Registering teams
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-500">Pick one or both.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <Alert tone="red">{error}</Alert>}
      <button type="submit" className={primaryBtn} disabled={busy || !wants}>
        {busy ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
