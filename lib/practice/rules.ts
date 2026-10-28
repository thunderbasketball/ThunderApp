// Yearly blackouts: filling rules into the blackouts list, and removing them.
// A rule is filled into the blackouts list (and blocks slots) for each year that has, or may get, practice slots.
import type { PoolClient } from "pg";
import { blockScope, reopenScope, type RemovedBooking } from "./scope";

import { describeRule, ruleStart, type RuleSpec } from "./rule-dates";

export * from "./rule-dates";

const iso = (d: Date) => d.toISOString().slice(0, 10);

type RuleRow = RuleSpec & { id: string; gymId: string | null; minute: number | null; reason: string | null; createdBy: string };

const ruleCols = `id::text, kind, month, day, nth, weekday, span_days as "spanDays", gym_id::text as "gymId",
                  minute_of_day as minute, reason, created_by as "createdBy"`;

// Fills rules into the blackouts list for these years and blocks their slots. Safe to repeat.
export async function materializeRules(
  q: PoolClient,
  years: number[],
  now: Date,
  onlyRuleId?: string,
): Promise<{ slots: number; removed: RemovedBooking[] }> {
  const rules = await q.query<RuleRow>(
    `select ${ruleCols} from blackout_rules ${onlyRuleId ? "where id = $1" : ""}`,
    onlyRuleId ? [onlyRuleId] : [],
  );
  let slots = 0;
  const removed: RemovedBooking[] = [];
  for (const r of rules.rows)
    for (const year of years) {
      const start = ruleStart(r, year);
      if (!start) continue;
      const end = new Date(start.getTime() + (r.spanDays - 1) * 86_400_000);
      const res = await blockScope(
        q,
        { from: iso(start), to: iso(end), gymId: r.gymId, minute: r.minute, now },
        { reason: r.reason, by: r.createdBy, ruleId: r.id },
      );
      slots += res.slots;
      removed.push(...res.removed);
    }
  return { slots, removed };
}

// The years to fill: this year through the later of two years ahead and the last practice slot.
export async function yearsToFill(q: PoolClient, now: Date): Promise<number[]> {
  const r = await q.query<{ y: number | null }>("select extract(year from max(starts_at))::int as y from slots");
  const first = now.getUTCFullYear();
  const last = Math.max(first + 2, r.rows[0].y ?? 0);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

export async function insertRule(
  q: PoolClient,
  spec: RuleSpec,
  scope: { gymId: string | null; minute: number | null; reason: string | null; by: string },
) {
  const r = await q.query<{ id: string }>(
    `insert into blackout_rules (kind, month, day, nth, weekday, span_days, gym_id, minute_of_day, reason, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::text`,
    [
      spec.kind,
      spec.month,
      spec.day ?? null,
      spec.nth ?? null,
      spec.weekday ?? null,
      spec.spanDays,
      scope.gymId,
      scope.minute,
      scope.reason,
      scope.by,
    ],
  );
  return r.rows[0].id;
}

// Deleting a rule removes its upcoming blackout dates and reopens those slots. Past dates stay as history.
export async function removeRule(q: PoolClient, ruleId: string, now: Date): Promise<number> {
  const rows = await q.query<{ day: string; gymId: string | null; minute: number | null }>(
    `delete from blackouts where rule_id = $1 and day >= ($2 at time zone 'America/New_York')::date
     returning day::text, gym_id::text as "gymId", minute_of_day as minute`,
    [ruleId, now],
  );
  await q.query("delete from blackout_rules where id = $1", [ruleId]);
  let reopened = 0;
  for (const b of rows.rows) reopened += await reopenScope(q, { from: b.day, to: b.day, gymId: b.gymId, minute: b.minute, now });
  return reopened;
}

export type BlackoutListItem = { day: string; gym: string | null; minute: number | null; reason: string | null; ruleId: string | null };
export type RuleListItem = RuleRow & { label: string; gym: string | null };

export async function listBlackouts(
  q: Pick<PoolClient, "query">,
  now: Date,
): Promise<{ upcoming: BlackoutListItem[]; rules: RuleListItem[] }> {
  const upcoming = await q.query<BlackoutListItem>(
    `select b.day::text, g.name as gym, b.minute_of_day as minute, b.reason, b.rule_id::text as "ruleId"
     from blackouts b left join gyms g on g.id = b.gym_id
     where b.day >= ($1 at time zone 'America/New_York')::date
     order by b.day, g.name nulls first, b.minute_of_day nulls first`,
    [now],
  );
  const rules = await q.query<RuleRow & { gym: string | null }>(
    `select r.id::text, r.kind, r.month, r.day, r.nth, r.weekday, r.span_days as "spanDays", r.gym_id::text as "gymId",
            r.minute_of_day as minute, r.reason, r.created_by as "createdBy", g.name as gym
     from blackout_rules r left join gyms g on g.id = r.gym_id
     order by r.month, coalesce(r.day, r.nth * 7, 28)`,
  );
  return { upcoming: upcoming.rows, rules: rules.rows.map((r) => ({ ...r, label: describeRule(r) })) };
}
