"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GRADES } from "@/lib/team-names";
import { Alert } from "../../client-ui";
import { card, fieldLabel as label, inputCls, pillCls as pill, primaryBtn } from "../../ui";
import { countMatching, createEvent } from "../actions";

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function NewEventForm({ people, gyms }: { people: { id: string; name: string }[]; gyms: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [genders, setGenders] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [staff, setStaff] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [matching, setMatching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // How many registered players the gender + grade picks match, worked out on the server.
  const filterKey = JSON.stringify({ genders, grades });
  useEffect(() => {
    let stale = false;
    const t = setTimeout(async () => {
      const r = await countMatching(JSON.parse(filterKey));
      if (!stale) setMatching(r.ok ? r.count : null);
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [filterKey]);

  const q = search.trim().toLowerCase();
  const matches = q ? people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const picked = people.filter((p) => staff.includes(p.id));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await createEvent({ name, date, time, location, notes, genders, grades, staff });
          if (!r.ok) return setError(r.message);
          router.push(`/events/${r.id}`);
        });
      }}
    >
      <label className="block">
        <span className={label}>Event name</span>
        <input
          className={inputCls}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Girls 4th–5th tryouts"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Date</span>
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Start time</span>
          <input className={inputCls} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className={label}>Location (optional)</span>
        <input className={inputCls} list="event-gyms" value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} />
        <datalist id="event-gyms">
          {gyms.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>

      <section className={`${card} space-y-4 p-4`}>
        <h2 className="font-semibold">Players expected</h2>
        <div className="flex gap-2">
          {["Boys", "Girls"].map((g) => (
            <button key={g} type="button" className={pill(genders.includes(g))} onClick={() => setGenders(toggle(genders, g))}>
              {g}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {GRADES.map((g) => (
            <button key={g} type="button" className={pill(grades.includes(g))} onClick={() => setGrades(toggle(grades, g))}>
              {g}
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {matching === null ? "Counting…" : `${matching} registered player${matching === 1 ? "" : "s"} match`}
        </p>
      </section>

      <section className={`${card} space-y-3 p-4`}>
        <div>
          <h2 className="font-semibold">Who runs check-in</h2>
          <p className="text-sm text-zinc-500">They&apos;ll see a ✓ Check-in button at the top of the app. You can always run it too.</p>
        </div>
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {picked.map((p) => (
              <button key={p.id} type="button" className={pill(true)} onClick={() => setStaff(toggle(staff, p.id))}>
                {p.name} ✕
              </button>
            ))}
          </div>
        )}
        <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type a name…" />
        {matches.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-950/10 dark:divide-white/5 dark:ring-white/15">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-white/5"
                  onClick={() => {
                    setStaff(toggle(staff, p.id));
                    setSearch("");
                  }}
                >
                  {p.name}
                  {staff.includes(p.id) && <span className="text-thunder-blue">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className="block">
        <span className={label}>Notes (optional)</span>
        <textarea className={`${inputCls} min-h-20`} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && <Alert tone="red">{error}</Alert>}
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
