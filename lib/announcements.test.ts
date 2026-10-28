import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "./auth/service";
import { createTestDb } from "./testing/db";
import { listInbox, listSent, markRead, previewAudience, sendAnnouncement, sendUnreadEmails, unreadCount } from "./announcements";

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
