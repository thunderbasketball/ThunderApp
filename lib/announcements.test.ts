import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "./auth/service";
import { createTestDb } from "./testing/db";
import {
  deleteAnnouncement,
  listInbox,
  listSent,
  markRead,
  previewAudience,
  sendAnnouncement,
  sendUnreadEmails,
  unreadCount,
} from "./announcements";

const person = (coachId: string, firstName: string, isDirector = false): SessionUser => ({
  coachId,
  firstName,
  lastName: "X",
  isDirector,
  isCoach: true,
  requestPending: false,
  hasThunderRole: true,
});
const director = person("9913694", "Earl", true);
const head = person("5550001", "Hank");
const parent = person("5550004", "Paula");

describe("announcements", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });
  let now = new Date("2026-10-28T12:00:00Z");
  const deps = () => ({ pool: db.pool, now: () => now });
  const hours = (h: number) => (now = new Date(now.getTime() + h * 3_600_000));
  let teamA = "";
  let teamB = "";
  const msg = { title: "Gym change", body: "Practice moves to Heritage.\nSee you there." };

  beforeEach(async () => {
    await db.reset();
    now = new Date("2026-10-28T12:00:00Z");
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell, email, active, thunder_coach, thunder_director, thunder_request) values
         ('9913694', 'Earl', 'X', '4239913694', 'earl@example.com', true, false, true, false),
         ('5550001', 'Hank', 'X', '4235550001', 'hank@example.com', true, true, false, false),
         ('5550002', 'Amy', 'X', '4235550002', 'amy@example.com', true, true, false, false),
         ('5550003', 'Cole', 'X', '4235550003', null, true, true, false, false),
         ('5550004', 'Paula', 'X', '4235550004', 'paula@example.com', true, false, false, false),
         ('5550005', 'Ina', 'X', '4235550005', 'ina@example.com', false, true, false, false),
         ('5550006', 'Rex', 'X', '4235550006', 'rex@example.com', true, false, false, true)`,
    );
    const t = await db.pool.query<{ id: string }>(
      `insert into teams (name, gender, grades, grade_sort, level, created_by) values ('4G A', 'Girls', '{4}', 4, 'REC', 'x'), ('5B B', 'Boys', '{5}', 5, 'COMP', 'x') returning id::text`,
    );
    [teamA, teamB] = t.rows.map((r) => r.id);
    await db.pool.query(
      `insert into team_staff (team_id, coach_id, role, added_by) values ($1, '5550001', 'HeadCoach', 'x'), ($1, '5550004', 'TeamParent', 'x'), ($2, '5550002', 'HeadCoach', 'x'), ($2, '5550003', 'AsstCoach', 'x')`,
      [teamA, teamB],
    );
  });

  const names = async (a: object) => {
    const r = await previewAudience(deps(), director, a);
    return r.ok ? r.names.map((n) => n.split(" ")[0]) : r.message;
  };

  it("picks people by everyone, role, team or name; never inactive, pending, or the sender", async () => {
    expect(await names({ everyone: true })).toEqual(["Amy", "Cole", "Hank", "Paula"]);
    expect(await names({ roles: ["HeadCoach"] })).toEqual(["Amy", "Hank"]);
    expect(await names({ roles: ["TeamParent", "AsstCoach"] })).toEqual(["Cole", "Paula"]);
    expect(await names({ teams: [teamA] })).toEqual(["Hank", "Paula"]);
    expect(await names({ users: ["5550002", "5550005", "5550006"] })).toEqual(["Amy"]);
    expect(await names({ roles: ["AsstCoach"], users: ["5550001"] })).toEqual(["Cole", "Hank"]);
    expect(await names({ roles: ["nope"], teams: ["x"], users: ["'; drop"] })).toEqual([]);
    expect(await names({})).toEqual([]);
  });

  it("a practice day reaches the staff of every team practicing that day (Eastern time)", async () => {
    const g = await db.pool.query<{ id: string }>("insert into gyms (name) values ('Gym') returning id::text");
    const c = await db.pool.query<{ id: string }>("insert into courts (gym_id, name) values ($1, 'Main') returning id::text", [
      g.rows[0].id,
    ]);
    await db.pool.query(
      `insert into slots (court_id, starts_at, team_id, created_by) values
         ($1, '2026-11-10T23:00:00Z', $2, 'x'),  -- Tue 6 PM Eastern: team A
         ($1, '2026-11-11T03:30:00Z', $3, 'x'),  -- Tue 10:30 PM Eastern (Wed in UTC): team B
         ($1, '2026-11-11T18:00:00Z', null, 'x')`,
      [c.rows[0].id, teamA, teamB],
    );
    expect(await names({ practiceDate: "2026-11-10" })).toEqual(["Amy", "Cole", "Hank", "Paula"]);
    expect(await names({ practiceDate: "2026-11-11" })).toEqual([]);
    expect(await names({ practiceDate: "11/10" })).toEqual([]);
    const r = await sendAnnouncement(deps(), director, { ...msg, practiceDate: "2026-11-10" });
    expect(r).toMatchObject({ ok: true, count: 4 });
    expect((await listSent(deps(), director))[0].audience).toBe("Practicing Tue, 11/10");
  });

  it("volunteers: in the app if they have a login, otherwise emailed right away (once per address)", async () => {
    const reg = (id: string, first: string, cell: string, email: string | null, interest: string | null) =>
      db.pool.query(
        `insert into registrations (registrant_id, registration_id, first_name, last_name, gender, grade, grade_sort, program,
                                    parent1_first, parent1_cell, parent1_email, coaching_interest, raw, imported_at, imported_by)
         values ($1, $1, 'Kid', 'X', 'Girls', '4', 4, '4th Girls', $2, $3, $4, $5, '{}', now(), 'x')`,
        [id, first, cell, email, interest],
      );
    await reg("1", "Amy", "4235550002", "amy@example.com", "Head Coach"); // has a login
    await reg("2", "Vic", "4235559001", "vic@example.com", "Assistant Coach"); // no login
    await reg("3", "Vic", "4235559001", "VIC@example.com", "Assistant Coach"); // second child, same parent
    await reg("4", "Nora", "4235559002", null, "Head Coach"); // no login, no email
    await reg("5", "Pat", "4235559003", "pat@example.com", null); // didn't volunteer
    expect(await previewAudience(deps(), director, { volunteers: true })).toEqual({ ok: true, names: ["Amy X"], emailOnly: 1 });

    const mail: { to: string; subject: string; text: string }[] = [];
    const r = await sendAnnouncement(
      { ...deps(), sendEmail: async (to, subject, text) => void mail.push({ to, subject, text }) },
      director,
      {
        ...msg,
        volunteers: true,
      },
    );
    expect(r).toMatchObject({ ok: true, count: 1, emailed: 1 });
    expect(mail).toEqual([
      { to: "vic@example.com", subject: "Thunder Basketball: Gym change", text: expect.stringContaining("Practice moves to Heritage.") },
    ]);
    expect((await listSent(deps(), director))[0]).toMatchObject({ audience: "Volunteer coaches", total: 1, emailed: 1 });
  });

  it("sends to the picked people, describes who it went to, and checks the input", async () => {
    const r = await sendAnnouncement(deps(), director, { ...msg, roles: ["HeadCoach"], teams: [teamA] });
    expect(r).toMatchObject({ ok: true, count: 3 });
    const sent = await listSent(deps(), director);
    expect(sent[0]).toMatchObject({ title: "Gym change", audience: "Head Coaches · 4G A", sentBy: "Earl X", total: 3 });
    expect(sent[0].unread).toEqual(["Amy X", "Hank X", "Paula X"]);

    expect(await sendAnnouncement(deps(), director, { ...msg, title: " ", everyone: true })).toEqual({
      ok: false,
      message: "Add a title.",
    });
    expect(await sendAnnouncement(deps(), director, { ...msg, body: "x".repeat(4001), everyone: true })).toMatchObject({ ok: false });
    expect(await sendAnnouncement(deps(), director, { ...msg, users: ["5550005"] })).toEqual({
      ok: false,
      message: "Pick who should get it. Nobody matches yet.",
    });
    expect(await sendAnnouncement(deps(), head, { ...msg, everyone: true })).toEqual({
      ok: false,
      message: "Only the Director can send announcements.",
    });
    expect((await previewAudience(deps(), head, { everyone: true })).ok).toBe(false);
  });

  it("the Director can remove one: gone from every inbox and never emailed", async () => {
    const r = await sendAnnouncement(deps(), director, { ...msg, everyone: true });
    if (!r.ok) throw new Error(r.message);
    expect(await deleteAnnouncement(deps(), head, r.id)).toEqual({ ok: false, message: "Only the Director can remove announcements." });
    expect(await unreadCount(deps(), head)).toBe(1);
    expect(await deleteAnnouncement(deps(), director, r.id)).toEqual({ ok: true });
    expect(await listInbox(deps(), head)).toEqual([]);
    expect(await unreadCount(deps(), head)).toBe(0);
    expect(await listSent(deps(), director)).toEqual([]);
    expect(await deleteAnnouncement(deps(), director, r.id)).toMatchObject({ ok: false });
    expect(await deleteAnnouncement(deps(), director, "1; drop table users")).toMatchObject({ ok: false });
    const mail: string[] = [];
    hours(9);
    expect(await sendUnreadEmails({ ...deps(), appUrl: "x", sendEmail: async (to) => void mail.push(to) })).toBe(0);
  });

  it("inbox: only your own, newest first; opening marks read", async () => {
    await sendAnnouncement(deps(), director, { ...msg, teams: [teamA] });
    hours(1);
    await sendAnnouncement(deps(), director, { title: "Second", body: "Hi", users: ["5550002"] });
    expect((await listInbox(deps(), head)).map((i) => [i.title, i.read])).toEqual([["Gym change", false]]);
    expect(await listInbox(deps(), person("5550002", "Amy"))).toMatchObject([{ title: "Second" }]);
    expect(await unreadCount(deps(), head)).toBe(1);

    const [item] = await listInbox(deps(), head);
    await markRead(deps(), head, [item.id]);
    expect(await unreadCount(deps(), head)).toBe(0);
    expect(await unreadCount(deps(), parent)).toBe(1); // marking your own doesn't touch anyone else's
    expect((await listSent(deps(), director)).find((s) => s.title === "Gym change")?.unread).toEqual(["Paula X"]);
  });

  it("unread after 8 hours: one summary email each, never twice, at most every 8 hours", async () => {
    const mail: { to: string; subject: string; text: string }[] = [];
    const run = () =>
      sendUnreadEmails({
        ...deps(),
        appUrl: "https://app.example",
        sendEmail: async (to, subject, text) => void mail.push({ to, subject, text }),
      });

    await sendAnnouncement(deps(), director, { ...msg, everyone: true });
    hours(1);
    await sendAnnouncement(deps(), director, { title: "Second", body: "Two", roles: ["HeadCoach"] });
    const [first] = await listInbox(deps(), person("5550002", "Amy"));
    await markRead(deps(), person("5550002", "Amy"), [first.id]); // Amy read the newer one only

    hours(6.9);
    expect(await run()).toBe(0); // first one is 7.9 hours old

    hours(0.2);
    expect(await run()).toBe(3); // Amy, Hank, Paula (Cole has no email)
    expect(mail.map((m) => [m.to, m.subject]).sort()).toEqual([
      ["amy@example.com", "Thunder Basketball: 1 unread announcement"],
      ["hank@example.com", "Thunder Basketball: 1 unread announcement"],
      ["paula@example.com", "Thunder Basketball: 1 unread announcement"],
    ]);
    const amy = mail.find((m) => m.to === "amy@example.com")!.text;
    expect(amy).toContain("■ Gym change");
    expect(amy).toContain("Practice moves to Heritage.\nSee you there.");
    expect(amy).toContain("https://app.example/inbox");
    expect(await run()).toBe(0); // nothing new

    hours(1); // Hank's "Second" is now 8+ hours old, but he was emailed 1 hour ago
    expect(await run()).toBe(0);
    hours(7);
    expect(await run()).toBe(1);
    expect(mail.at(-1)).toMatchObject({ to: "hank@example.com", subject: "Thunder Basketball: 1 unread announcement" });
    expect(mail.at(-1)?.text).toContain("■ Second");

    // Reading in the app stops the email.
    await sendAnnouncement(deps(), director, { title: "Third", body: "3", users: ["5550004"] });
    const [third] = await listInbox(deps(), parent);
    await markRead(deps(), parent, [third.id]);
    hours(9);
    expect(await run()).toBe(0);
  });
});
