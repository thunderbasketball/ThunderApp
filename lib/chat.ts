// Chat (SPEC.md section 11). Conversations are fixed keys whose members follow the current roles:
//   directors        Directors
//   everyone         Directors + all coaches
//   coaches          coaches (Directors can read and post, but aren't counted as members: no unread, no email)
//   team-<id>        that team's staff + Directors
//   teamcoaches-<id> that team's Head and Assistant Coaches + Directors
//   coach-<id>       one coach + the Directors
// A "coach" has the Coach role or is a Head or Assistant Coach on a team. Directors can open every chat.
import type { Pool } from "pg";
import type { SessionUser } from "./auth/service";
import { withTx } from "./sql";
import { TZ } from "./time";

type Q = Pick<Pool, "query">;
type Deps = { pool: Pool; now: () => Date };
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export const EMAIL_AFTER_HOURS = 8;
const HOUR = 3_600_000;
const MAX_BODY = 2000;

type Ctx = { coachId: string; director: boolean; coach: boolean; teams: { id: string; name: string; coach: boolean }[] };

// Roles fresh from the database (for the viewer, or anyone when working out who gets an email).
async function contextFor(q: Q, coachId: string): Promise<Ctx | null> {
  const u = await q.query<{ director: boolean; coach: boolean }>(
    "select thunder_director as director, thunder_coach as coach from users where coach_id = $1 and active",
    [coachId],
  );
  if (!u.rows[0]) return null;
  const t = await q.query<{ id: string; name: string; coach: boolean }>(
    `select t.id::text, t.name, bool_or(s.role in ('HeadCoach', 'AsstCoach')) as coach
     from team_staff s join teams t on t.id = s.team_id where s.coach_id = $1 group by t.id order by t.grade_sort, lower(t.name)`,
    [coachId],
  );
  return { coachId, director: u.rows[0].director, coach: u.rows[0].coach || t.rows.some((x) => x.coach), teams: t.rows };
}

type Key = { kind: "directors" | "everyone" | "coaches" } | { kind: "team" | "teamcoaches"; id: string } | { kind: "coach"; id: string };

export function parseKey(key: unknown): Key | null {
  if (typeof key !== "string") return null;
  if (key === "directors" || key === "everyone" || key === "coaches") return { kind: key };
  const m = key.match(/^(team|teamcoaches)-(\d{1,18})$/);
  if (m) return { kind: m[1] as "team" | "teamcoaches", id: m[2] };
  const c = key.match(/^coach-(\d{7})$/);
  return c ? { kind: "coach", id: c[1] } : null;
}

// member: in the chat (unread counts, emails). seen: can read and post (members, plus Directors everywhere).
function access(ctx: Ctx, key: Key): { member: boolean; seen: boolean } {
  const member = (() => {
    switch (key.kind) {
      case "directors":
        return ctx.director;
      case "everyone":
        return ctx.director || ctx.coach;
      case "coaches":
        return ctx.coach;
      case "team":
        return ctx.director || ctx.teams.some((t) => t.id === key.id);
      case "teamcoaches":
        return ctx.director || ctx.teams.some((t) => t.id === key.id && t.coach);
      case "coach":
        return ctx.director || (ctx.coach && key.id === ctx.coachId);
    }
  })();
  return { member, seen: member || ctx.director };
}

const keyText = (k: Key) => ("id" in k ? `${k.kind}-${k.id}` : k.kind);

// The chat's name as this person sees it, or null when the team or coach no longer exists.
async function titleOf(q: Q, ctx: Ctx, k: Key): Promise<string | null> {
  switch (k.kind) {
    case "directors":
      return "Directors";
    case "everyone":
      return "Directors & all coaches";
    case "coaches":
      return "Coaches";
    case "team":
    case "teamcoaches": {
      const t = await q.query<{ name: string }>("select name from teams where id = $1", [k.id]);
      return t.rows[0] ? `${t.rows[0].name} · ${k.kind === "team" ? "Team" : "Coaches"}` : null;
    }
    case "coach": {
      if (!ctx.director) return "Directors";
      const u = await q.query<{ name: string }>("select first_name || ' ' || last_name as name from users where coach_id = $1", [k.id]);
      return u.rows[0] ? `${u.rows[0].name} · Directors` : null;
    }
  }
}

// ---- Starting a chat ----

export type ChatOption = { key: string; title: string; group: string };

// The chats this person can start (or open, if they already have messages).
export async function newChatOptions(deps: Deps, viewer: SessionUser): Promise<ChatOption[]> {
  const ctx = await contextFor(deps.pool, viewer.coachId);
  if (!ctx) return [];
  const out: ChatOption[] = [];
  if (ctx.director) {
    out.push({ key: "directors", title: "Directors", group: "Groups" });
    out.push({ key: "everyone", title: "Directors & all coaches", group: "Groups" });
    out.push({ key: "coaches", title: "Coaches (coaches' own chat)", group: "Groups" });
    const coaches = await deps.pool.query<{ id: string; name: string }>(
      `select u.coach_id as id, u.first_name || ' ' || u.last_name as name from users u
       where u.active and u.coach_id <> $1 and (u.thunder_coach or exists (select 1 from team_staff s where s.coach_id = u.coach_id and s.role in ('HeadCoach', 'AsstCoach')))
       order by lower(u.last_name), lower(u.first_name)`,
      [ctx.coachId],
    );
    out.push(...coaches.rows.map((c) => ({ key: `coach-${c.id}`, title: c.name, group: "A single coach" })));
    const teams = await deps.pool.query<{ id: string; name: string }>(
      "select id::text, name from teams order by level = 'COMP' desc, gender, grade_sort, lower(name)",
    );
    out.push(...teams.rows.map((t) => ({ key: `teamcoaches-${t.id}`, title: `${t.name} coaches`, group: "One team's coaches" })));
    out.push(...teams.rows.map((t) => ({ key: `team-${t.id}`, title: `${t.name} team chat`, group: "Team chats" })));
    return out;
  }
  if (ctx.coach) {
    out.push({ key: `coach-${ctx.coachId}`, title: "Directors", group: "Groups" });
    out.push({ key: "everyone", title: "Directors & all coaches", group: "Groups" });
    out.push({ key: "coaches", title: "Coaches", group: "Groups" });
  }
  out.push(...ctx.teams.map((t) => ({ key: `team-${t.id}`, title: `${t.name} team chat`, group: "Team chats" })));
  out.push(
    ...ctx.teams
      .filter((t) => t.coach)
      .map((t) => ({ key: `teamcoaches-${t.id}`, title: `${t.name} coaches + Directors`, group: "Team chats" })),
  );
  return out;
}

// ---- The chat list ----

export type ChatSummary = { key: string; title: string; last: { body: string; sender: string; at: Date } | null; unread: number };

async function allConvs(q: Q): Promise<string[]> {
  const r = await q.query<{ conv: string }>("select distinct conv from chat_messages");
  return r.rows.map((x) => x.conv);
}

// Chats with messages the viewer can see, newest activity first.
export async function listChats(deps: Deps, viewer: SessionUser): Promise<ChatSummary[]> {
  const ctx = await contextFor(deps.pool, viewer.coachId);
  if (!ctx) return [];
  const visible: { key: string; k: Key; member: boolean }[] = [];
  for (const key of await allConvs(deps.pool)) {
    const k = parseKey(key);
    if (!k) continue;
    const a = access(ctx, k);
    if (a.seen) visible.push({ key, k, member: a.member });
  }
  if (!visible.length) return [];
  const r = await deps.pool.query<{ conv: string; body: string; sender: string; at: Date; unread: number }>(
    `select distinct on (m.conv) m.conv, m.body, m.sender_name as sender, m.created_at as at,
            (select count(*)::int from chat_messages x where x.conv = m.conv and x.sender_id <> $2
               and x.created_at > coalesce((select last_read_at from chat_reads r where r.conv = m.conv and r.coach_id = $2), '-infinity')) as unread
     from chat_messages m where m.conv = any($1) order by m.conv, m.id desc`,
    [visible.map((v) => v.key), viewer.coachId],
  );
  const out: ChatSummary[] = [];
  for (const row of r.rows) {
    const v = visible.find((x) => x.key === row.conv)!;
    const title = await titleOf(deps.pool, ctx, v.k);
    if (!title) continue;
    out.push({ key: row.conv, title, last: { body: row.body, sender: row.sender, at: row.at }, unread: v.member ? row.unread : 0 });
  }
  return out.sort((a, b) => b.last!.at.getTime() - a.last!.at.getTime());
}

// Unread messages across the chats the viewer is a member of (the header badge).
export async function chatUnreadCount(deps: Deps, viewer: SessionUser): Promise<number> {
  const ctx = await contextFor(deps.pool, viewer.coachId);
  if (!ctx) return 0;
  const keys = (await allConvs(deps.pool)).filter((key) => {
    const k = parseKey(key);
    return k && access(ctx, k).member;
  });
  if (!keys.length) return 0;
  const r = await deps.pool.query<{ n: number }>(
    `select count(*)::int as n from chat_messages m
     where m.conv = any($1) and m.sender_id <> $2
       and m.created_at > coalesce((select last_read_at from chat_reads r where r.conv = m.conv and r.coach_id = $2), '-infinity')`,
    [keys, viewer.coachId],
  );
  return r.rows[0].n;
}

// ---- One chat ----

export type ChatMessage = { id: string; senderId: string; sender: string; body: string; at: Date };
export type ChatThread = { key: string; title: string; members: string[]; messages: ChatMessage[] };

const MEMBERS: Record<Key["kind"], string> = {
  directors: "u.thunder_director",
  everyone: "u.thunder_director or {coach}",
  coaches: "{coach}",
  team: "u.thunder_director or exists (select 1 from team_staff s where s.coach_id = u.coach_id and s.team_id = $1)",
  teamcoaches:
    "u.thunder_director or exists (select 1 from team_staff s where s.coach_id = u.coach_id and s.team_id = $1 and s.role in ('HeadCoach', 'AsstCoach'))",
  coach: "u.thunder_director or u.coach_id = $1",
};
const IS_COACH =
  "(u.thunder_coach or exists (select 1 from team_staff s where s.coach_id = u.coach_id and s.role in ('HeadCoach', 'AsstCoach')))";

async function memberNames(q: Q, k: Key): Promise<string[]> {
  const where = MEMBERS[k.kind].replace("{coach}", IS_COACH);
  const r = await q.query<{ name: string }>(
    `select u.first_name || ' ' || u.last_name as name from users u where u.active and (${where}) order by lower(u.last_name), lower(u.first_name)`,
    "id" in k ? [k.id] : [],
  );
  return r.rows.map((x) => x.name);
}

// Null when the viewer can't see this chat. Newest 200 messages, oldest first.
export async function getChat(deps: Deps, viewer: SessionUser, key: string): Promise<ChatThread | null> {
  const k = parseKey(key);
  const ctx = await contextFor(deps.pool, viewer.coachId);
  if (!k || !ctx || !access(ctx, k).seen) return null;
  if (k.kind === "coach" && ctx.director) {
    const c = await deps.pool.query(`select 1 from users u where u.coach_id = $1 and ${IS_COACH}`, [k.id]);
    if (!c.rows[0]) return null;
  }
  const title = await titleOf(deps.pool, ctx, k);
  if (!title) return null;
  const m = await deps.pool.query<ChatMessage>(
    `select * from (select id::text, sender_id as "senderId", sender_name as sender, body, created_at as at
                    from chat_messages where conv = $1 order by id desc limit 200) x order by x.id::bigint`,
    [keyText(k)],
  );
  return { key: keyText(k), title, members: await memberNames(deps.pool, k), messages: m.rows };
}

export async function postMessage(deps: Deps, viewer: SessionUser, key: unknown, bodyInput: unknown): Promise<Result<{ id: string }>> {
  const k = parseKey(key);
  const body = typeof bodyInput === "string" ? bodyInput.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { ok: false, message: "Type a message." };
  if (body.length > MAX_BODY) return { ok: false, message: `Keep it to ${MAX_BODY.toLocaleString()} characters.` };
  const ctx = k && (await contextFor(deps.pool, viewer.coachId));
  if (!k || !ctx || !access(ctx, k).seen) return { ok: false, message: "You can't post in this chat." };
  if (k.kind === "coach" && ctx.director) {
    const c = await deps.pool.query(`select 1 from users u where u.coach_id = $1 and u.active and ${IS_COACH}`, [k.id]);
    if (!c.rows[0]) return { ok: false, message: "That person isn't an active coach." };
  }
  const now = deps.now();
  return withTx(deps.pool, async (q) => {
    const r = await q.query<{ id: string }>(
      "insert into chat_messages (conv, sender_id, sender_name, body, created_at) values ($1, $2, $3, $4, $5) returning id::text",
      [keyText(k), viewer.coachId, `${viewer.firstName} ${viewer.lastName}`, body, now],
    );
    await setRead(q, keyText(k), viewer.coachId, now);
    return { ok: true as const, id: r.rows[0].id };
  });
}

async function setRead(q: Q, conv: string, coachId: string, at: Date) {
  await q.query(
    `insert into chat_reads (conv, coach_id, last_read_at) values ($1, $2, $3)
     on conflict (conv, coach_id) do update set last_read_at = greatest(chat_reads.last_read_at, excluded.last_read_at)`,
    [conv, coachId, at],
  );
}

// Opening a chat marks it read.
export async function markChatRead(deps: Deps, viewer: SessionUser, key: string): Promise<void> {
  const k = parseKey(key);
  const ctx = k && (await contextFor(deps.pool, viewer.coachId));
  if (!k || !ctx || !access(ctx, k).seen) return;
  await setRead(deps.pool, keyText(k), viewer.coachId, deps.now());
}

// ---- Unread summary emails ----

type DigestDeps = Deps & { sendEmail: (to: string, subject: string, text: string) => Promise<void>; appUrl: string };

const when = (d: Date) => d.toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });

// Chat messages unread for 8+ hours go out in one email per person (each message once), at most every 8 hours.
export async function sendUnreadChatEmails(deps: DigestDeps): Promise<number> {
  const now = deps.now();
  const cutoff = new Date(now.getTime() - EMAIL_AFTER_HOURS * HOUR);
  const convs = await deps.pool.query<{ conv: string }>("select distinct conv from chat_messages where created_at <= $1", [cutoff]);
  if (!convs.rows.length) return 0;
  const people = await deps.pool.query<{ coach_id: string; email: string; first_name: string }>(
    `select u.coach_id, u.email, u.first_name from users u left join notify_state n on n.coach_id = u.coach_id
     where u.active and u.email is not null and (n.last_chat_email_at is null or n.last_chat_email_at <= $1)`,
    [cutoff],
  );
  let sent = 0;
  for (const p of people.rows) {
    const done = await withTx(deps.pool, async (q) => {
      await q.query("select pg_advisory_xact_lock(hashtext('chatnotify:' || $1))", [p.coach_id]);
      const st = await q.query<{ last_chat_email_at: Date | null }>("select last_chat_email_at from notify_state where coach_id = $1", [
        p.coach_id,
      ]);
      if (st.rows[0]?.last_chat_email_at && st.rows[0].last_chat_email_at > cutoff) return false;
      const ctx = await contextFor(q, p.coach_id);
      if (!ctx) return false;
      const sections: string[] = [];
      const covered: string[] = [];
      let total = 0;
      for (const { conv } of convs.rows) {
        const k = parseKey(conv);
        if (!k || !access(ctx, k).member) continue;
        const m = await q.query<{ sender_name: string; body: string; created_at: Date }>(
          `select m.sender_name, m.body, m.created_at from chat_messages m
           left join chat_reads r on r.conv = m.conv and r.coach_id = $2
           where m.conv = $1 and m.sender_id <> $2 and m.created_at <= $3
             and m.created_at > greatest(coalesce(r.last_read_at, '-infinity'), coalesce(r.emailed_until, '-infinity'))
           order by m.id`,
          [conv, p.coach_id, cutoff],
        );
        if (!m.rows.length) continue;
        const title = await titleOf(q, ctx, k);
        if (!title) continue;
        total += m.rows.length;
        covered.push(conv);
        const shown = m.rows.slice(-5);
        sections.push(
          [
            "",
            `■ ${title} (${m.rows.length} unread)`,
            ...(m.rows.length > shown.length ? ["  …"] : []),
            ...shown.map((x) => `  ${x.sender_name}, ${when(x.created_at)}: ${x.body.replace(/\n/g, " ")}`),
          ].join("\n"),
        );
      }
      if (!total) return false;
      const text = [
        `Hi ${p.first_name},`,
        "",
        `You have ${total} unread chat message${total === 1 ? "" : "s"} in the Thunder Basketball app:`,
        ...sections,
        "",
        `Open the app: ${deps.appUrl}/chat`,
        "",
        "This is an automatic email. Replies aren't read; answer in the app.",
      ].join("\n");
      await deps.sendEmail(p.email, `Thunder Basketball: ${total} unread chat message${total === 1 ? "" : "s"}`, text);
      for (const conv of covered) {
        await q.query(
          `insert into chat_reads (conv, coach_id, emailed_until) values ($1, $2, $3)
           on conflict (conv, coach_id) do update set emailed_until = excluded.emailed_until`,
          [conv, p.coach_id, cutoff],
        );
      }
      await q.query(
        `insert into notify_state (coach_id, last_chat_email_at) values ($1, $2)
         on conflict (coach_id) do update set last_chat_email_at = excluded.last_chat_email_at`,
        [p.coach_id, now],
      );
      return true;
    });
    if (done) sent++;
  }
  return sent;
}
