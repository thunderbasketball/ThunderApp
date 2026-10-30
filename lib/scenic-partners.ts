// Scenic City partners, their gyms and courts, and the game days (SPEC.md section 13, step 5a).
// Scenic City Directors manage everything; a partner's contacts manage their own partner's gyms and courts.
import type { Pool } from "pg";
import type { SessionUser } from "./auth/service";
import { cleanPartnerName, isScenicDirector, type PartnerKind } from "./scenic";
import { withTx, type Queryable } from "./sql";

type Deps = { pool: Pool; now: () => Date };
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
class PartnerError extends Error {}

const by = (v: SessionUser) => `${v.firstName} ${v.lastName}`;
const isId = (v: unknown): v is string => typeof v === "string" && /^\d{1,18}$/.test(v);
const directorOnly = "Only a Scenic City Director can do that.";

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof PartnerError) return { ok: false, message: e.message };
    if ((e as { code?: string }).code === "23505") return { ok: false, message: "That name is already used here." };
    throw e;
  }
}

// A gym or court name: letters, numbers, spaces and . ' & - , ( ) # /, starting with a letter or number (never = + - @).
export function cleanPlaceName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return /^[A-Za-z0-9][A-Za-z0-9 .'&\-,()#/]{0,59}$/.test(s) ? s : null;
}

// An address is optional; when given, 5–200 characters that don't start like a formula.
function cleanAddress(v: unknown): string | null | undefined {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s.length >= 5 && s.length <= 200 && !/^[=+\-@]/.test(s) ? s : undefined;
}

// Scenic City Director, or one of this partner's contacts.
async function canManage(q: Queryable, viewer: SessionUser, partnerId: string): Promise<boolean> {
  const r = await q.query<{ ok: boolean }>(
    `select has_role($1, 'scenic-city', 'Director')
            or (has_role($1, 'scenic-city', 'Partner') and exists (select 1 from partner_contacts where partner_id = $2 and coach_id = $1)) as ok`,
    [viewer.coachId, partnerId],
  );
  return r.rows[0].ok;
}

// ---- Partners ----

export type PartnerSummary = {
  id: string;
  name: string;
  kind: PartnerKind;
  hostsGames: boolean;
  registersTeams: boolean;
  approved: boolean;
  contacts: string[];
  gyms: number;
  courts: number;
};

// Directors: every partner. Partner contacts: their own. Sorted by name.
export async function listPartners(deps: Deps, viewer: SessionUser): Promise<{ partners: PartnerSummary[]; isDirector: boolean }> {
  const isDirector = await isScenicDirector(deps.pool, viewer.coachId);
  const r = await deps.pool.query<PartnerSummary>(
    `select p.id::text, p.name, p.kind, p.hosts_games as "hostsGames", p.registers_teams as "registersTeams", p.approved,
            array(select u.first_name || ' ' || u.last_name from partner_contacts c join users u on u.coach_id = c.coach_id
                  where c.partner_id = p.id order by lower(u.last_name), lower(u.first_name)) as contacts,
            (select count(*)::int from partner_gyms g where g.partner_id = p.id) as gyms,
            (select count(*)::int from partner_courts c join partner_gyms g on g.id = c.gym_id where g.partner_id = p.id) as courts
     from partners p
     where $2 or (has_role($1, 'scenic-city', 'Partner') and exists (select 1 from partner_contacts c where c.partner_id = p.id and c.coach_id = $1))
     order by lower(p.name)`,
    [viewer.coachId, isDirector],
  );
  return { partners: r.rows, isDirector };
}

export type Court = { id: string; name: string };
export type Gym = { id: string; name: string; address: string | null; courts: Court[] };
export type PartnerDetail = PartnerSummary & { gymList: Gym[]; canEditPartner: boolean; createdBy: string };

// One partner with its gyms and courts (gyms by name, courts in number order). Null if the viewer can't see it.
export async function getPartner(deps: Deps, viewer: SessionUser, id: unknown): Promise<PartnerDetail | null> {
  if (!isId(id) || !(await canManage(deps.pool, viewer, id))) return null;
  const { partners } = await listPartners(deps, viewer);
  const p = partners.find((x) => x.id === id);
  if (!p) return null;
  const g = await deps.pool.query<Gym>(
    `select g.id::text, g.name, g.address,
            coalesce((select json_agg(json_build_object('id', c.id::text, 'name', c.name)
                        order by length(c.name), lower(c.name)) from partner_courts c where c.gym_id = g.id), '[]') as courts
     from partner_gyms g where g.partner_id = $1 order by lower(g.name)`,
    [id],
  );
  const extra = await deps.pool.query<{ created_by: string }>("select created_by from partners where id = $1", [id]);
  return { ...p, gymList: g.rows, canEditPartner: await isScenicDirector(deps.pool, viewer.coachId), createdBy: extra.rows[0].created_by };
}

export type PartnerInput = { name: unknown; kind: unknown; hostsGames: unknown; registersTeams: unknown; approved: unknown };

// Directors: add a partner (id null) or edit one.
export async function savePartner(deps: Deps, viewer: SessionUser, id: unknown, input: PartnerInput): Promise<Result<{ id: string }>> {
  const name = cleanPartnerName(input.name);
  if (!name) return { ok: false, message: "Enter a name (letters, numbers, spaces)." };
  if (input.kind !== "School" && input.kind !== "Organization") return { ok: false, message: "Choose School or Organization." };
  const hosts = input.hostsGames === true;
  const registers = input.registersTeams === true;
  if (!hosts && !registers) return { ok: false, message: "Choose Hosting games, Registering teams, or both." };
  if (id !== null && !isId(id)) return { ok: false, message: "That partner no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      if (!(await isScenicDirector(q, viewer.coachId))) throw new PartnerError(directorOnly);
      const clash = await q.query("select 1 from partners where lower(name) = lower($1) and id is distinct from $2::bigint", [name, id]);
      if (clash.rows[0]) throw new PartnerError(`There's already a partner named ${name}.`);
      if (id === null) {
        const r = await q.query<{ id: string }>(
          `insert into partners (name, kind, hosts_games, registers_teams, approved, created_by) values ($1, $2, $3, $4, $5, $6) returning id::text`,
          [name, input.kind, hosts, registers, input.approved !== false, by(viewer)],
        );
        return { id: r.rows[0].id };
      }
      const r = await q.query("update partners set name = $2, kind = $3, hosts_games = $4, registers_teams = $5, approved = $6 where id = $1", [
        id,
        name,
        input.kind,
        hosts,
        registers,
        input.approved === true,
      ]);
      if (!r.rowCount) throw new PartnerError("That partner no longer exists.");
      return { id };
    }),
  );
}

// ---- Gyms and courts (the partner's contacts or a Director) ----

async function gymPartner(q: Queryable, gymId: string): Promise<string | null> {
  return (await q.query<{ p: string }>("select partner_id::text as p from partner_gyms where id = $1", [gymId])).rows[0]?.p ?? null;
}

export async function saveGym(
  deps: Deps,
  viewer: SessionUser,
  partnerId: unknown,
  gymId: unknown,
  input: { name: unknown; address: unknown },
): Promise<Result<{ id: string }>> {
  const name = cleanPlaceName(input.name);
  if (!name) return { ok: false, message: "Enter the gym's name (letters, numbers, spaces)." };
  const address = cleanAddress(input.address);
  if (address === undefined) return { ok: false, message: "That address doesn't look right." };
  if (!isId(partnerId) || (gymId !== null && !isId(gymId))) return { ok: false, message: "That gym no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      if (!(await canManage(q, viewer, partnerId))) throw new PartnerError("You can't change this partner's gyms.");
      if (gymId === null) {
        const r = await q.query<{ id: string }>(
          "insert into partner_gyms (partner_id, name, address, created_by) values ($1, $2, $3, $4) returning id::text",
          [partnerId, name, address, by(viewer)],
        );
        return { id: r.rows[0].id };
      }
      const r = await q.query("update partner_gyms set name = $3, address = $4 where id = $1 and partner_id = $2", [gymId, partnerId, name, address]);
      if (!r.rowCount) throw new PartnerError("That gym no longer exists.");
      return { id: gymId };
    }),
  );
}

export async function deleteGym(deps: Deps, viewer: SessionUser, gymId: unknown): Promise<Result> {
  if (!isId(gymId)) return { ok: false, message: "That gym no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      const p = await gymPartner(q, gymId);
      if (!p) throw new PartnerError("That gym no longer exists.");
      if (!(await canManage(q, viewer, p))) throw new PartnerError("You can't change this partner's gyms.");
      await q.query("delete from partner_gyms where id = $1", [gymId]);
      return {};
    }),
  );
}

export async function addCourt(deps: Deps, viewer: SessionUser, gymId: unknown, name: unknown): Promise<Result> {
  const n = cleanPlaceName(name);
  if (!n) return { ok: false, message: "Enter the court's name, e.g. Court 1." };
  if (!isId(gymId)) return { ok: false, message: "That gym no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      const p = await gymPartner(q, gymId);
      if (!p) throw new PartnerError("That gym no longer exists.");
      if (!(await canManage(q, viewer, p))) throw new PartnerError("You can't change this partner's gyms.");
      await q.query("insert into partner_courts (gym_id, name, created_by) values ($1, $2, $3)", [gymId, n, by(viewer)]);
      return {};
    }),
  );
}

export async function deleteCourt(deps: Deps, viewer: SessionUser, courtId: unknown): Promise<Result> {
  if (!isId(courtId)) return { ok: false, message: "That court no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      const r = await q.query<{ p: string }>(
        "select g.partner_id::text as p from partner_courts c join partner_gyms g on g.id = c.gym_id where c.id = $1",
        [courtId],
      );
      if (!r.rows[0]) throw new PartnerError("That court no longer exists.");
      if (!(await canManage(q, viewer, r.rows[0].p))) throw new PartnerError("You can't change this partner's gyms.");
      await q.query("delete from partner_courts where id = $1", [courtId]);
      return {};
    }),
  );
}

// ---- Game days ----

export type GameDay = { id: string; day: string; createdBy: string }; // day as YYYY-MM-DD

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

// Anyone with a Scenic City role. From `from` (YYYY-MM-DD, Eastern today by default) on, by date.
export async function listGameDays(deps: Deps, viewer: SessionUser, from?: string): Promise<GameDay[] | null> {
  const member = await deps.pool.query<{ ok: boolean }>(
    "select exists (select 1 from org_roles where coach_id = $1 and org = 'scenic-city' and role <> 'Request') as ok",
    [viewer.coachId],
  );
  if (!member.rows[0].ok) return null;
  const r = await deps.pool.query<GameDay>(
    `select id::text, to_char(day, 'YYYY-MM-DD') as day, created_by as "createdBy" from game_days
     where day >= coalesce($1::date, ($2::timestamptz at time zone 'America/New_York')::date) order by day`,
    [isDate(from) ? from : null, deps.now()],
  );
  return r.rows;
}

// Directors: add one date (from only) or every matching weekday (0 = Sunday) from `from` to `to` (up to a year). Existing days stay.
export async function addGameDays(
  deps: Deps,
  viewer: SessionUser,
  input: { from: unknown; to?: unknown; weekdays?: unknown },
): Promise<Result<{ added: number }>> {
  if (!isDate(input.from)) return { ok: false, message: "Pick a date." };
  const to = input.to === undefined || input.to === "" ? input.from : input.to;
  if (!isDate(to)) return { ok: false, message: "Pick an end date." };
  if (to < input.from) return { ok: false, message: "The end date is before the start date." };
  if ((Date.parse(to) - Date.parse(input.from)) / 86_400_000 > 366) return { ok: false, message: "Pick a range of a year or less." };
  const repeat = to !== input.from;
  const weekdays = Array.isArray(input.weekdays) ? input.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  if (repeat && !weekdays.length) return { ok: false, message: "Pick the days of the week." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      if (!(await isScenicDirector(q, viewer.coachId))) throw new PartnerError(directorOnly);
      const r = await q.query(
        `insert into game_days (day, created_by)
         select d::date, $4 from generate_series($1::date, $2::date, interval '1 day') d
         where not $5 or extract(dow from d)::int = any($3::int[])
         on conflict (day) do nothing`,
        [input.from, to, weekdays, by(viewer), repeat],
      );
      return { added: r.rowCount ?? 0 };
    }),
  );
}

export async function deleteGameDay(deps: Deps, viewer: SessionUser, id: unknown): Promise<Result> {
  if (!isId(id)) return { ok: false, message: "That game day no longer exists." };
  return run(() =>
    withTx(deps.pool, async (q) => {
      if (!(await isScenicDirector(q, viewer.coachId))) throw new PartnerError(directorOnly);
      await q.query("delete from game_days where id = $1", [id]);
      return {};
    }),
  );
}
