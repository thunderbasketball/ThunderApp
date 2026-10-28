import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "./auth/service";
import { createTestDb } from "./testing/db";
import { hashPin } from "./auth/crypto";
import { addUser, deleteUser, denyRequest, resetLogin, updateUser } from "./user-admin";

const director: SessionUser = {
  coachId: "9913694",
  firstName: "Earl",
  lastName: "Epps",
  isDirector: true,
  isCoach: false,
  requestPending: false,
  hasThunderRole: true,
};
const coach: SessionUser = { ...director, coachId: "5550001", isDirector: false, isCoach: true };

describe("user admin", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });
  const now = new Date("2026-10-28T12:00:00Z");
  const deps = () => ({ pool: db.pool, now: () => now });
  const user = async (id: string) => (await db.pool.query("select * from users where coach_id = $1", [id])).rows[0];
  const edit = { first: "Pat", last: "Test", email: "pat@example.com", active: true, coach: true, director: false };

  beforeEach(async () => {
    await db.reset();
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell, email, verified_email, thunder_director, thunder_request, scenic_city_coach) values
         ('9913694', 'Earl', 'Epps', '4239913694', null, null, true, false, false),
         ('5550001', 'Pat', 'Test', '4235550001', 'pat@example.com', 'pat@example.com', false, true, false),
         ('5550002', 'Sam', 'Scenic', '4235550002', null, null, false, false, true)`,
    );
  });

  it("edits name, email, Active and roles, records who did it, and leaves Scenic City columns alone", async () => {
    expect(await updateUser(deps(), director, "5550002", { first: "Samuel", last: "Scenic", email: "Sam@Example.com", active: false, coach: true, director: true })).toEqual({
      ok: true,
    });
    expect(await user("5550002")).toMatchObject({
      first_name: "Samuel",
      email: "sam@example.com",
      active: false,
      thunder_coach: true,
      thunder_director: true,
      scenic_city_coach: true,
      updated_by: "Earl Epps",
    });
  });

  it("granting a role approves a pending request", async () => {
    await updateUser(deps(), director, "5550001", edit);
    expect(await user("5550001")).toMatchObject({ thunder_request: false, thunder_coach: true });
  });

  it("deny clears the request without a role", async () => {
    await denyRequest(deps(), director, "5550001");
    expect(await user("5550001")).toMatchObject({ thunder_request: false, thunder_coach: false });
  });

  it("changing the email means it must be verified again", async () => {
    await updateUser(deps(), director, "5550001", { ...edit, email: "new@example.com" });
    const u = await user("5550001");
    expect(u.email).toBe("new@example.com");
    expect(u.verified_email).toBe("pat@example.com");
  });

  it("you can't remove your own Director role or deactivate yourself", async () => {
    const me = { first: "Earl", last: "Epps", email: "", active: true, coach: false, director: true };
    expect(await updateUser(deps(), director, "9913694", { ...me, director: false })).toEqual({ ok: false, message: "You can't remove your own Director role." });
    expect(await updateUser(deps(), director, "9913694", { ...me, active: false })).toEqual({ ok: false, message: "You can't deactivate yourself." });
    expect(await updateUser(deps(), director, "9913694", { ...me, coach: true })).toEqual({ ok: true });
  });

  it("checks names and email", async () => {
    expect(await updateUser(deps(), director, "5550001", { ...edit, first: "=HYPERLINK()" })).toMatchObject({ ok: false });
    expect(await updateUser(deps(), director, "5550001", { ...edit, email: "nope" })).toMatchObject({ ok: false, message: "That email doesn't look right." });
  });

  it("adds a user with the starter PIN; refuses a taken cell or matching last 7 digits", async () => {
    const r = await addUser(deps(), director, { first: "New", last: "Coach", cell: "(423) 555-9999", email: "", coach: true, director: false });
    expect(r).toEqual({ ok: true, coachId: "5559999" });
    expect(await user("5559999")).toMatchObject({ pin_hash: null, thunder_coach: true, email: null, updated_by: "Earl Epps" });
    expect(await addUser(deps(), director, { first: "A", last: "B", cell: "4235559999", email: "", coach: false, director: false })).toMatchObject({
      ok: false,
      message: "New Coach already has that cell number.",
    });
    expect(await addUser(deps(), director, { first: "A", last: "B", cell: "6155559999", email: "", coach: false, director: false })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/same 7 digits as New Coach/),
    });
  });

  it("reset login: PIN back to 1234, email cleared, logged out, lockout cleared", async () => {
    await db.pool.query("update users set pin_hash = $1 where coach_id = '5550001'", [await hashPin("2468")]);
    await db.pool.query("insert into sessions (token_hash, coach_id, created_at, expires_at) values ('x', '5550001', $1, $1)", [now]);
    await db.pool.query("insert into pin_lockouts (cell, failed_count) values ('4235550001', 3)");
    expect(await resetLogin(deps(), director, "5550001")).toEqual({ ok: true });
    expect(await user("5550001")).toMatchObject({ pin_hash: null, email: null, verified_email: null, updated_by: "Earl Epps", first_name: "Pat" });
    expect((await db.pool.query("select count(*)::int n from sessions where coach_id = '5550001'")).rows[0].n).toBe(0);
    expect((await db.pool.query("select count(*)::int n from pin_lockouts where cell = '4235550001'")).rows[0].n).toBe(0);
    expect(await resetLogin(deps(), director, "9913694")).toEqual({ ok: false, message: "You can't reset your own login." });
    expect((await resetLogin(deps(), coach, "5550002")).ok).toBe(false);
  });

  it("deletes only where appropriate", async () => {
    expect(await deleteUser(deps(), director, "9913694")).toEqual({ ok: false, message: "You can't delete yourself." });
    expect(await deleteUser(deps(), director, "5550002")).toMatchObject({ ok: false, message: /Scenic City/ });
    const t = await db.pool.query<{ id: string }>("insert into teams (name, gender, grades, grade_sort, level, created_by) values ('4G Test', 'Girls', '{4}', 4, 'REC', 'x') returning id");
    await db.pool.query("insert into team_staff (team_id, coach_id, role, added_by) values ($1, '5550001', 'Manager', 'x')", [t.rows[0].id]);
    expect(await deleteUser(deps(), director, "5550001")).toMatchObject({ ok: false, message: /on a team/ });
    await db.pool.query("delete from team_staff");
    await db.pool.query("insert into sessions (token_hash, coach_id, created_at, expires_at) values ('x', '5550001', now(), now() + interval '1 hour')");
    expect(await deleteUser(deps(), director, "5550001")).toEqual({ ok: true });
    expect(await user("5550001")).toBeUndefined();
    expect((await db.pool.query("select count(*)::int n from sessions")).rows[0].n).toBe(0);
  });

  it("only the Director can manage users", async () => {
    expect(await updateUser(deps(), coach, "5550002", edit)).toMatchObject({ ok: false });
    expect(await addUser(deps(), coach, { first: "A", last: "B", cell: "4235558888", email: "", coach: true, director: true })).toMatchObject({ ok: false });
    expect(await deleteUser(deps(), coach, "5550002")).toMatchObject({ ok: false });
    expect(await denyRequest(deps(), coach, "5550001")).toMatchObject({ ok: false });
    expect(await user("5550001")).toMatchObject({ thunder_request: true });
  });
});
