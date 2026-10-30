// Announcements (SPEC.md section 11): the Director sends a one-way post to chosen users, roles, teams, a practice day,
// volunteer coaches, or everyone.
// Everyone reads theirs in the inbox; anything unread after 8 hours goes out in one summary email.
import type { Pool } from "pg";
import type { SessionUser } from "./auth/service";
import { cleanEmail } from "./auth/validate";
import { withTx } from "./sql";
import type { Role } from "./teams";
import { TZ, zonedTime } from "./time";

type Deps = { pool: Pool; now: () => Date };
type SendEmail = (to: string, subject: string, text: string) => Promise<void>;
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export const EMAIL_AFTER_HOURS = 8;
const HOUR = 3_600_000;

// Club roles (on the user record) and team roles (on any team's staff).
type RoleKey = "director" | "coach" | Role;
export const AUDIENCE_ROLES: { key: RoleKey; label: string }[] = [
  { key: "director", label: "Directors" },
  { key: "coach", label: "Coaches" },
  { key: "HeadCoach", label: "Head Coaches" },
  { key: "AsstCoach", label: "Assistant Coaches" },
  { key: "Manager", label: "Team Managers" },
  { key: "TeamParent", label: "Team Parents" },
];
const ROLE_KEYS = new Set<string>(AUDIENCE_ROLES.map((r) => r.key));

// practiceDate: staff of every team with a practice booked that day (YYYY-MM-DD, Eastern).
// volunteers: parents who offered to coach at registration (by app login; those without one are emailed).
export type AudienceInput = {
  everyone?: unknown;
  roles?: unknown;
  teams?: unknown;
  users?: unknown;
  practiceDate?: unknown;
  volunteers?: unknown;
};
type Audience = { everyone: boolean; roles: RoleKey[]; teams: string[]; users: string[]; practiceDate: string | null; volunteers: boolean };

function cleanAudience(input: AudienceInput): Audience {
  const list = (v: unknown, ok: (s: string) => boolean) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ok(x)))].slice(0, 500) : [];
  return {
    everyone: input.everyone === true,
    roles: list(input.roles, (s) => ROLE_KEYS.has(s)) as RoleKey[],
    teams: list(input.teams, (s) => /^\d{1,18}$/.test(s)),
    users: list(input.users, (s) => /^\d{7}$/.test(s)),
    practiceDate: typeof input.practiceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.practiceDate) ? input.practiceDate : null,
    volunteers: input.volunteers === true,
  };
}

// The Eastern-time start and end of a YYYY-MM-DD day.
function dayRange(iso: string | null): [Date | null, Date | null] {
  if (!iso) return [null, null];
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return [zonedTime(y, m, d), zonedTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())];
}

// People who can get announcements: active, with a Thunder role (Coach, Director, or on a team). Never the sender.
const RECIPIENTS = `
  select u.coach_id, u.first_name, u.last_name, u.cell, u.email from users u
  where u.active
    and (has_role(u.coach_id, 'thunder', 'Coach') or has_role(u.coach_id, 'thunder', 'Director') or exists (select 1 from team_staff s where s.coach_id = u.coach_id))
    and u.coach_id <> $1
    and ($2
      or ('director' = any($3::text[]) and has_role(u.coach_id, 'thunder', 'Director'))
      or ('coach' = any($3::text[]) and has_role(u.coach_id, 'thunder', 'Coach'))
      or exists (select 1 from team_staff s where s.coach_id = u.coach_id and (s.role = any($3::text[]) or s.team_id::text = any($4::text[])))
      or u.coach_id = any($5::text[])
      or exists (select 1 from team_staff s join slots sl on sl.team_id = s.team_id
                 where s.coach_id = u.coach_id and sl.starts_at >= $6 and sl.starts_at < $7)
      or ($8 and exists (select 1 from registrations g where g.coaching_interest is not null and g.parent1_cell = u.cell)))
  order by lower(u.last_name), lower(u.first_name)`;

const recipientParams = (viewer: SessionUser, a: Audience) => [
  viewer.coachId,
  a.everyone,
  a.roles,
  a.teams,
  a.users,
  ...dayRange(a.practiceDate),
  a.volunteers,
];

type Recipient = { coach_id: string; first_name: string; last_name: string; cell: string; email: string | null };

// Volunteers with no app login among the recipients: they get the announcement by email instead (one per address).
async function emailOnlyVolunteers(q: Pick<Pool, "query">, a: Audience, people: Recipient[]): Promise<{ email: string; first: string }[]> {
  if (!a.volunteers) return [];
  const r = await q.query<{ email: string | null; first: string | null; cell: string | null }>(
    `select parent1_email as email, nullif(trim(parent1_first), '') as first, parent1_cell as cell
     from registrations where coaching_interest is not null order by registrant_id`,
  );
  const cells = new Set(people.map((p) => p.cell));
  const seen = new Set(people.flatMap((p) => (p.email ? [p.email.toLowerCase()] : [])));
  const out: { email: string; first: string }[] = [];
  for (const v of r.rows) {
    const email = cleanEmail(v.email ?? "");
    if (!email || (v.cell && cells.has(v.cell)) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, first: v.first ?? "there" });
  }
  return out;
}

// Who a selection reaches, before sending (the compose screen shows the count and names).
// emailOnly: volunteers without a login, who'll get it by email.
export async function previewAudience(
  deps: Deps,
  viewer: SessionUser,
  input: AudienceInput,
): Promise<Result<{ names: string[]; emailOnly: number }>> {
  if (!viewer.isDirector) return { ok: false, message: "Only the Director can send announcements." };
  const a = cleanAudience(input);
  const r = await deps.pool.query<Recipient>(RECIPIENTS, recipientParams(viewer, a));
  const extra = await emailOnlyVolunteers(deps.pool, a, r.rows);
  return { ok: true, names: r.rows.map((u) => `${u.first_name} ${u.last_name}`), emailOnly: extra.length };
}

// Everything the compose screen can pick from.
export async function audienceChoices(deps: Deps, viewer: SessionUser) {
  if (!viewer.isDirector) throw new Error("Director only");
  const [teams, users] = await Promise.all([
    deps.pool.query<{ id: string; name: string }>(
      "select id::text, name from teams order by level = 'COMP' desc, gender, grade_sort, lower(name)",
    ),
    deps.pool.query<{ id: string; name: string }>(
      `select u.coach_id as id, u.first_name || ' ' || u.last_name as name from users u
       where u.active and u.coach_id <> $1
         and (has_role(u.coach_id, 'thunder', 'Coach') or has_role(u.coach_id, 'thunder', 'Director') or exists (select 1 from team_staff s where s.coach_id = u.coach_id))
       order by lower(u.last_name), lower(u.first_name)`,
      [viewer.coachId],
    ),
  ]);
  return { roles: AUDIENCE_ROLES.map((r) => ({ ...r })), teams: teams.rows, users: users.rows };
}

// "Everyone", or e.g. "Head Coaches · 4G Epps · 2 people", kept for the Sent list.
async function describe(deps: Deps, a: Audience): Promise<string> {
  if (a.everyone) return "Everyone";
  const parts: string[] = a.roles.map((k) => AUDIENCE_ROLES.find((r) => r.key === k)!.label);
  if (a.volunteers) parts.push("Volunteer coaches");
  if (a.practiceDate) {
    const [start] = dayRange(a.practiceDate);
    parts.push(`Practicing ${start!.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "numeric", day: "numeric" })}`);
  }
  if (a.teams.length) {
    const t = await deps.pool.query<{ name: string }>("select name from teams where id::text = any($1) order by lower(name)", [a.teams]);
    parts.push(...t.rows.map((x) => x.name));
  }
  if (a.users.length) {
    const u = await deps.pool.query<{ name: string }>(
      "select first_name || ' ' || last_name as name from users where coach_id = any($1) order by lower(last_name)",
      [a.users],
    );
    parts.push(u.rows.length <= 3 ? u.rows.map((x) => x.name).join(", ") : `${u.rows.length} people`);
  }
  return parts.join(" · ");
}

export async function sendAnnouncement(
  deps: Deps & { sendEmail?: SendEmail },
  viewer: SessionUser,
  input: { title: unknown; body: unknown } & AudienceInput,
): Promise<Result<{ id: string; count: number; emailed: number }>> {
  if (!viewer.isDirector) return { ok: false, message: "Only the Director can send announcements." };
  const title = typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "";
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
  if (!title) return { ok: false, message: "Add a title." };
  if (title.length > 120) return { ok: false, message: "Keep the title to 120 characters." };
  if (!body) return { ok: false, message: "Write a message." };
  if (body.length > 4000) return { ok: false, message: "Keep the message to 4,000 characters." };
  const a = cleanAudience(input);
  const audience = await describe(deps, a);
  const sentBy = `${viewer.firstName} ${viewer.lastName}`;
  const saved = await withTx(deps.pool, async (q) => {
    const people = await q.query<Recipient>(RECIPIENTS, recipientParams(viewer, a));
    const extra = await emailOnlyVolunteers(q, a, people.rows);
    if (!people.rows.length && !extra.length) return { ok: false as const, message: "Pick who should get it. Nobody matches yet." };
    const ins = await q.query<{ id: string }>(
      `insert into announcements (title, body, audience, sent_by, sent_by_id, created_at) values ($1, $2, $3, $4, $5, $6) returning id::text`,
      [title, body, audience, sentBy, viewer.coachId, deps.now()],
    );
    const id = ins.rows[0].id;
    await q.query("insert into announcement_recipients (announcement_id, coach_id) select $1, unnest($2::text[])", [
      id,
      people.rows.map((p) => p.coach_id),
    ]);
    return { ok: true as const, id, count: people.rows.length, extra };
  });
  if (!saved.ok) return saved;

  // After it's saved: email the volunteers who have no login. One failed address doesn't stop the rest.
  let emailed = 0;
  for (const v of saved.extra) {
    try {
      await deps.sendEmail?.(
        v.email,
        `Thunder Basketball: ${title}`,
        `Hi ${v.first},\n\n${body}\n\n— ${sentBy}, Thunder Basketball\n\nThis is an automatic email. Replies aren't read.`,
      );
      if (deps.sendEmail) emailed++;
    } catch (e) {
      console.error("Volunteer announcement email failed:", e);
    }
  }
  if (emailed) await deps.pool.query("update announcements set extra_emails = $2 where id = $1", [saved.id, emailed]);
  return { ok: true, id: saved.id, count: saved.count, emailed };
}

export type InboxItem = { id: string; title: string; body: string; sentBy: string; createdAt: Date; read: boolean };

// The viewer's own announcements, newest first.
export async function listInbox(deps: Deps, viewer: SessionUser): Promise<InboxItem[]> {
  const r = await deps.pool.query<InboxItem>(
    `select a.id::text, a.title, a.body, a.sent_by as "sentBy", a.created_at as "createdAt", r.read_at is not null as read
     from announcement_recipients r join announcements a on a.id = r.announcement_id
     where r.coach_id = $1 order by a.created_at desc, a.id desc limit 100`,
    [viewer.coachId],
  );
  return r.rows;
}

export const POPUP_HOURS = 24;

// Unread announcements under 24 hours old: shown in a pop-up the next time the person opens the app, until they
// tap Got it. Older ones only wait in the inbox.
export async function popupAnnouncements(deps: Deps, viewer: SessionUser): Promise<InboxItem[]> {
  const r = await deps.pool.query<InboxItem>(
    `select a.id::text, a.title, a.body, a.sent_by as "sentBy", a.created_at as "createdAt", false as read
     from announcement_recipients r join announcements a on a.id = r.announcement_id
     where r.coach_id = $1 and r.read_at is null and a.created_at > $2
     order by a.created_at, a.id limit 10`,
    [viewer.coachId, new Date(deps.now().getTime() - POPUP_HOURS * HOUR)],
  );
  return r.rows;
}

export async function unreadCount(deps: Deps, viewer: SessionUser): Promise<number> {
  const r = await deps.pool.query<{ n: number }>(
    "select count(*)::int as n from announcement_recipients where coach_id = $1 and read_at is null",
    [viewer.coachId],
  );
  return r.rows[0].n;
}

// Opening the inbox marks what it showed as read. Only the viewer's own rows can change.
export async function markRead(deps: Deps, viewer: SessionUser, ids: string[]): Promise<void> {
  const clean = ids.filter((id) => /^\d{1,18}$/.test(id));
  if (!clean.length) return;
  await deps.pool.query(
    "update announcement_recipients set read_at = $3 where coach_id = $1 and announcement_id::text = any($2) and read_at is null",
    [viewer.coachId, clean, deps.now()],
  );
}

// Director: take an announcement back. It leaves every inbox, and any summary email not yet sent won't include it.
export async function deleteAnnouncement(deps: Deps, viewer: SessionUser, id: unknown): Promise<Result> {
  if (!viewer.isDirector) return { ok: false, message: "Only the Director can remove announcements." };
  if (typeof id !== "string" || !/^\d{1,18}$/.test(id)) return { ok: false, message: "That announcement no longer exists." };
  const r = await deps.pool.query("delete from announcements where id = $1", [id]); // recipients go with it
  return r.rowCount ? { ok: true } : { ok: false, message: "That announcement no longer exists." };
}

export type SentItem = {
  emailed: number;
  id: string;
  title: string;
  body: string;
  audience: string;
  sentBy: string;
  createdAt: Date;
  total: number;
  unread: string[];
};

// Director: every announcement, with who hasn't read it yet.
export async function listSent(deps: Deps, viewer: SessionUser): Promise<SentItem[]> {
  if (!viewer.isDirector) throw new Error("Director only");
  const r = await deps.pool.query<SentItem>(
    `select a.id::text, a.title, a.body, a.audience, a.extra_emails as emailed, a.sent_by as "sentBy", a.created_at as "createdAt",
            (select count(*)::int from announcement_recipients r where r.announcement_id = a.id) as total,
            array(select u.first_name || ' ' || u.last_name from announcement_recipients r join users u on u.coach_id = r.coach_id
                  where r.announcement_id = a.id and r.read_at is null order by lower(u.last_name), lower(u.first_name)) as unread
     from announcements a order by a.created_at desc, a.id desc limit 100`,
  );
  return r.rows;
}

// ---- Unread summary emails ----

type DigestDeps = Deps & { sendEmail: (to: string, subject: string, text: string) => Promise<void>; appUrl: string };

const when = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

// Anyone with announcements unread for 8+ hours gets one email listing them (each announcement is emailed once),
// and at most one email every 8 hours. Returns how many emails went out.
export async function sendUnreadEmails(deps: DigestDeps): Promise<number> {
  const now = deps.now();
  const cutoff = new Date(now.getTime() - EMAIL_AFTER_HOURS * HOUR);
  const due = await deps.pool.query<{ coach_id: string }>(
    `select distinct r.coach_id from announcement_recipients r
     join announcements a on a.id = r.announcement_id
     join users u on u.coach_id = r.coach_id
     left join notify_state n on n.coach_id = r.coach_id
     where r.read_at is null and r.emailed_at is null and a.created_at <= $1
       and u.active and u.email is not null and (n.last_email_at is null or n.last_email_at <= $1)`,
    [cutoff],
  );
  let sent = 0;
  for (const { coach_id } of due.rows) {
    // One person at a time, locked, so two servers (or a slow email) never send twice.
    const done = await withTx(deps.pool, async (q) => {
      await q.query("select pg_advisory_xact_lock(hashtext('notify:' || $1))", [coach_id]);
      const st = await q.query<{ last_email_at: Date | null }>("select last_email_at from notify_state where coach_id = $1", [coach_id]);
      if (st.rows[0]?.last_email_at && st.rows[0].last_email_at > cutoff) return false;
      const rows = await q.query<{
        id: string;
        title: string;
        body: string;
        sent_by: string;
        created_at: Date;
        email: string;
        first_name: string;
      }>(
        `select a.id::text, a.title, a.body, a.sent_by, a.created_at, u.email, u.first_name
         from announcement_recipients r join announcements a on a.id = r.announcement_id join users u on u.coach_id = r.coach_id
         where r.coach_id = $1 and r.read_at is null and r.emailed_at is null and a.created_at <= $2 and u.active and u.email is not null
         order by a.created_at`,
        [coach_id, cutoff],
      );
      if (!rows.rows.length) return false;
      const n = rows.rows.length;
      const text = [
        `Hi ${rows.rows[0].first_name},`,
        "",
        `You have ${n} unread announcement${n === 1 ? "" : "s"} in the Thunder Basketball app:`,
        ...rows.rows.flatMap((a) => ["", `■ ${a.title}`, `From ${a.sent_by} · ${when(a.created_at)}`, "", a.body]),
        "",
        `Open the app: ${deps.appUrl}/inbox`,
        "",
        "This is an automatic email. Replies aren't read.",
      ].join("\n");
      await deps.sendEmail(rows.rows[0].email, `Thunder Basketball: ${n} unread announcement${n === 1 ? "" : "s"}`, text);
      await q.query("update announcement_recipients set emailed_at = $3 where coach_id = $1 and announcement_id::text = any($2)", [
        coach_id,
        rows.rows.map((a) => a.id),
        now,
      ]);
      await q.query(
        `insert into notify_state (coach_id, last_email_at) values ($1, $2)
         on conflict (coach_id) do update set last_email_at = excluded.last_email_at`,
        [coach_id, now],
      );
      return true;
    });
    if (done) sent++;
  }
  return sent;
}
