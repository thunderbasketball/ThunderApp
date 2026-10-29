// Imports the Google Sheet's Evaluations tab (Player, Grade, Gender, Team, Coach, Position, Height, Speed,
// EvaluationScore, EvaluationText, Pickup). Safe to run again: cards already in the app are left alone.
import type { Pool } from "pg";
import { HEIGHTS, NOTES_MAX, POSITIONS, SPEEDS } from "./evaluation-fields";
import { withTx } from "./sql";

export type EvalRow = {
  row: number;
  player: string;
  team: string;
  coach: string;
  position: string | null;
  height: string | null;
  speed: string | null;
  score: number | null;
  notes: string;
  interested: boolean;
};
export type EvalProblem = { row: number; message: string };

const REQUIRED = ["Player", "Team"];

export function parseEvaluationsTab(rows: string[][]): { items: EvalRow[]; errors: EvalProblem[]; warnings: EvalProblem[] } {
  const errors: EvalProblem[] = [];
  const warnings: EvalProblem[] = [];
  const items: EvalRow[] = [];
  const head = (rows[0] ?? []).map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !head.includes(h));
  if (missing.length) return { items, errors: [{ row: 1, message: `Missing column(s): ${missing.join(", ")}` }], warnings };
  const col = (r: string[], name: string) => (r[head.indexOf(name)] ?? "").trim();
  // Matches a listed choice regardless of case; anything else is dropped with a warning.
  const choice = (n: number, name: string, v: string, list: readonly string[]) => {
    if (!v) return null;
    const hit = list.find((x) => x.toLowerCase() === v.toLowerCase());
    if (!hit) warnings.push({ row: n, message: `${name} "${v}" isn't one of ${list.join(", ")}; left blank` });
    return hit ?? null;
  };

  rows.slice(1).forEach((r, i) => {
    const n = i + 2;
    const player = col(r, "Player");
    const team = col(r, "Team");
    if (!player && !team) return;
    if (!player || !team) return void errors.push({ row: n, message: "Needs both Player and Team." });
    const s = col(r, "EvaluationScore");
    const score = /^[1-5]$/.test(s) ? Number(s) : null;
    if (s && score === null) warnings.push({ row: n, message: `Score "${s}" isn't 1–5; left blank` });
    let notes = col(r, "EvaluationText");
    if (notes.length > NOTES_MAX) {
      warnings.push({ row: n, message: `Notes cut to ${NOTES_MAX} characters` });
      notes = notes.slice(0, NOTES_MAX);
    }
    items.push({
      row: n,
      player,
      team,
      coach: col(r, "Coach"),
      position: choice(n, "Position", col(r, "Position"), POSITIONS),
      height: choice(n, "Height", col(r, "Height"), HEIGHTS),
      speed: choice(n, "Speed", col(r, "Speed"), SPEEDS),
      score,
      notes,
      interested: col(r, "Pickup").toUpperCase() === "TRUE",
    });
  });
  return { items, errors, warnings };
}

export type EvalImportResult = { row: number; player: string; team: string; status: "added" | "already" | "noTeam" | "noPlayer" };

class DryRun extends Error {
  constructor(public result: EvalImportResult[]) {
    super("dry run");
  }
}

// Matches the team by name and the player by full name in the current registrations (must be exactly one).
// A dry run does all the work, then rolls it back.
export async function importEvaluations(
  pool: Pool,
  items: EvalRow[],
  opts: { now: Date; dryRun: boolean; by: string },
): Promise<EvalImportResult[]> {
  try {
    return await withTx(pool, async (q) => {
      const out: EvalImportResult[] = [];
      for (const e of items) {
        const base = { row: e.row, player: e.player, team: e.team };
        const t = await q.query<{ id: string }>("select id::text from teams where lower(name) = lower($1)", [e.team]);
        if (!t.rows[0]) {
          out.push({ ...base, status: "noTeam" });
          continue;
        }
        const p = await q.query(
          "select * from registrations where lower(first_name || ' ' || last_name) = lower($1) order by registrant_id",
          [e.player.replace(/\s+/g, " ")],
        );
        if (p.rows.length !== 1) {
          out.push({ ...base, status: "noPlayer" });
          continue;
        }
        const g = p.rows[0];
        const r = await q.query(
          `insert into evaluations (team_id, registrant_id, first_name, last_name, gender, grade, grade_sort,
                                  position, height, speed, score, notes, interested, updated_by, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         on conflict do nothing`,
          [
            t.rows[0].id,
            g.registrant_id,
            g.first_name,
            g.last_name,
            g.gender,
            g.grade,
            g.grade_sort,
            e.position,
            e.height,
            e.speed,
            e.score,
            e.notes,
            e.interested,
            e.coach || opts.by,
            opts.now,
          ],
        );
        out.push({ ...base, status: r.rowCount ? "added" : "already" });
      }
      if (opts.dryRun) throw new DryRun(out);
      return out;
    });
  } catch (e) {
    if (e instanceof DryRun) return e.result;
    throw e;
  }
}
