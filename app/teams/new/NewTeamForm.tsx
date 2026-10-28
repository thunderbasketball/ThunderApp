"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GRADES, LEVELS, teamName } from "@/lib/team-names";
import type { HeadCoachOption } from "@/lib/teams";
import { createTeam } from "../actions";
import { card } from "../../ui";

const label = "mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const pill = (on: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
    on ? "bg-thunder-blue text-white shadow-sm" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300"
  }`;

export default function NewTeamForm({ users, volunteers }: { users: HeadCoachOption[]; volunteers: HeadCoachOption[] }) {
  const router = useRouter();
  const [gender, setGender] = useState<"Boys" | "Girls" | null>(null);
  const [grades, setGrades] = useState<string[]>([]);
  const [level, setLevel] = useState<string>("REC");
  const [headCoach, setHeadCoach] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const toggleGrade = (g: string) => setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  const matches = (v: HeadCoachOption) => v.gender === gender && grades.includes(v.grade ?? "");
  const forThisTeam = volunteers.filter(matches);
  const otherVolunteers = volunteers.filter((v) => !matches(v));
  const picked = [...users, ...volunteers].find((o) => o.value === headCoach);
  const preview = gender && grades.length && picked ? teamName(gender, grades, picked.lastName) : null;

  const option = (o: HeadCoachOption) => (
    <option key={o.value} value={o.value}>
      {o.lastName}, {o.firstName} — {o.detail}
    </option>
  );

  return (
    <form
      className={`${card} space-y-6 p-5`}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createTeam({ gender, grades, level, headCoach });
          if (r.ok) router.push("/teams");
          else setError(r.message);
        });
      }}
    >
      <div>
        <span className={label}>Gender</span>
        <div className="flex gap-2">
          {(["Boys", "Girls"] as const).map((g) => (
            <button key={g} type="button" className={pill(gender === g)} onClick={() => setGender(g)}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>Grades (one or more)</span>
        <div className="grid grid-cols-7 gap-2">
          {GRADES.map((g) => (
            <button key={g} type="button" aria-pressed={grades.includes(g)} className={`${pill(grades.includes(g))} px-0`} onClick={() => toggleGrade(g)}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>Level</span>
        <div className="flex gap-2">
          {LEVELS.map((l) => (
            <button key={l} type="button" className={pill(level === l)} onClick={() => setLevel(l)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={label}>Head coach</span>
        <select
          value={headCoach}
          onChange={(e) => setHeadCoach(e.target.value)}
          className="w-full rounded-xl border-0 bg-white px-3 py-3 text-base shadow-sm ring-1 ring-inset ring-zinc-950/10 outline-none focus:ring-2 focus:ring-thunder-blue dark:bg-zinc-900 dark:ring-white/15"
        >
          <option value="">Choose…</option>
          {forThisTeam.length > 0 && <optgroup label="Volunteers for this team">{forThisTeam.map(option)}</optgroup>}
          {otherVolunteers.length > 0 && <optgroup label="Other volunteers">{otherVolunteers.map(option)}</optgroup>}
          {users.length > 0 && <optgroup label="App users">{users.map(option)}</optgroup>}
        </select>
        {picked?.value.startsWith("volunteer:") && (
          <span className="mt-2 block text-sm text-zinc-500">
            {picked.firstName} will get an app login (starter PIN 1234) using their registration cell and email.
          </span>
        )}
      </label>

      <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
        <p className="text-xs font-medium text-zinc-500">Team name</p>
        <p className="text-lg font-semibold">{preview ?? "—"}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !preview}
        className="w-full rounded-xl bg-thunder-blue px-4 py-3 text-lg font-semibold text-white shadow-sm hover:bg-thunder-blue-dark disabled:opacity-40"
      >
        {busy ? "Creating…" : "Create team"}
      </button>
    </form>
  );
}
