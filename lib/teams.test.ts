import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "./auth/service";
import { createTestDb } from "./testing/db";
import { HEADER, row } from "./teamsnap/fixtures";
import { importRegistrations } from "./teamsnap/import";
import { parseRegistrations } from "./teamsnap/parse";
import { createTeam, personOptions, listTeams, teamName } from "./teams";

const director: SessionUser = {
  coachId: "9913694",
  firstName: "Earl",
  lastName: "Epps",
  isDirector: true,
  isCoach: false,
  requestPending: false,
  hasThunderRole: true,
};
const coach: SessionUser = { ...director, coachId: "5550001", firstName: "Cal", lastName: "Coach", isDirector: false, isCoach: true };

describe("teamName", () => {
  it("uses the top grade, gender letter and head coach's last name", () => {
    expect(teamName("Girls", ["4"], "Epps")).toBe("4G Epps");
    expect(teamName("Girls", ["7", "8"], "Black")).toBe("8G Black");
    expect(teamName("Boys", ["K"], " Harper ")).toBe("KB Harper");
    expect(teamName("Boys", ["K", "10", "9"], "Lee")).toBe("10B Lee");
  });
});

describe("teams", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });

  const now = new Date("2026-10-28T12:00:00Z");
  const deps = () => ({ pool: db.pool, now: () => now });

  beforeEach(async () => {
    await db.reset();
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell, thunder_director) values
         ('9913694', 'Earl', 'Epps', '4239913694', true),
         ('5550001', 'Cal', 'Coach', '4235550001', false)`,
    );
    // Volunteer parents: Pat Test (Head Coach, cell 4235550000) and one with a bad cell.
    const csv = parseRegistrations(
      [HEADER, row({ rid: "1", coach: "Head Coach" }), row({ rid: "2", first: "Zed", coach: "Assistant Coach", cell: "423555" }), row({ rid: "3" })].join("\n"),
      { schoolYear: 2026 },
    );
    await importRegistrations(db.pool, csv, "Earl Epps", now);
  });

  it("creates a team with an existing user as head coach, and records who made it", async () => {
    const r = await createTeam(deps(), director, { gender: "Girls", grades: ["4"], level: "REC", headCoach: "user:9913694" });
    expect(r).toMatchObject({ ok: true, name: "4G Epps" });
    const teams = await listTeams(deps(), director);
    expect(teams).toEqual([
      expect.objectContaining({ name: "4G Epps", gender: "Girls", grades: ["4"], level: "REC", createdBy: "Earl Epps", headCoach: { first: "Earl", last: "Epps", cell: "4239913694" } }),
    ]);
  });

  it("picking a volunteer creates their login with the Coach role and starter PIN", async () => {
    const opts = await personOptions(deps(), director);
    expect(opts.volunteers.map((v) => v.value)).toEqual(["volunteer:1"]); // bad cell left out
    const r = await createTeam(deps(), director, { gender: "Boys", grades: ["1", "2"], level: "COMP", headCoach: "volunteer:1" });
    expect(r).toMatchObject({ ok: true, name: "2B Test" });
    const u = await db.pool.query("select coach_id, first_name, cell, email, pin_hash, thunder_coach from users where cell = '4235550000'");
    expect(u.rows).toEqual([{ coach_id: "5550000", first_name: "Pat", cell: "4235550000", email: "pat@example.com", pin_hash: null, thunder_coach: true }]);
    // Now a user, so no longer offered as a volunteer.
    expect((await personOptions(deps(), director)).volunteers).toEqual([]);
  });

  it("gives an existing user the Coach role when they become a head coach", async () => {
    await db.pool.query("update users set thunder_request = true where coach_id = '5550001'");
    await createTeam(deps(), director, { gender: "Boys", grades: ["3"], level: "REC", headCoach: "user:5550001" });
    const u = await db.pool.query("select thunder_coach, thunder_request from users where coach_id = '5550001'");
    expect(u.rows[0]).toEqual({ thunder_coach: true, thunder_request: false });
  });

  it("refuses a duplicate team name and changes nothing", async () => {
    await createTeam(deps(), director, { gender: "Girls", grades: ["4"], level: "REC", headCoach: "user:9913694" });
    const r = await createTeam(deps(), director, { gender: "Girls", grades: ["4"], level: "COMP", headCoach: "user:9913694" });
    expect(r).toEqual({ ok: false, message: 'There\'s already a team named "4G Epps".' });
    expect(await listTeams(deps(), director)).toHaveLength(1);
  });

  it("refuses a volunteer whose cell matches another user's last 7 digits", async () => {
    await db.pool.query("insert into users (coach_id, first_name, last_name, cell) values ('5550000', 'Other', 'Person', '6155550000')");
    const r = await createTeam(deps(), director, { gender: "Boys", grades: ["1"], level: "REC", headCoach: "volunteer:1" });
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/same 7 digits as Other Person/) });
    expect(await listTeams(deps(), director)).toEqual([]);
  });

  it("refuses a volunteer without a 10-digit cell", async () => {
    const r = await createTeam(deps(), director, { gender: "Boys", grades: ["1"], level: "REC", headCoach: "volunteer:2" });
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/10-digit cell/) });
  });

  it("validates every field on the server", async () => {
    const base = { gender: "Girls", grades: ["4"], level: "REC", headCoach: "user:9913694" };
    expect(await createTeam(deps(), director, { ...base, gender: "Coed" })).toMatchObject({ ok: false, message: "Pick Boys or Girls." });
    expect(await createTeam(deps(), director, { ...base, grades: [] })).toMatchObject({ ok: false, message: "Pick at least one grade." });
    expect(await createTeam(deps(), director, { ...base, grades: ["13"] })).toMatchObject({ ok: false });
    expect(await createTeam(deps(), director, { ...base, level: "PRO" })).toMatchObject({ ok: false, message: "Pick REC or COMP." });
    expect(await createTeam(deps(), director, { ...base, headCoach: "user:1; drop table teams" })).toMatchObject({ ok: false, message: "Pick a head coach." });
    expect(await createTeam(deps(), director, { ...base, headCoach: "user:1234567" })).toMatchObject({ ok: false, message: "That person isn't an active user." });
  });

  it("only the Director can create or list teams", async () => {
    const r = await createTeam(deps(), coach, { gender: "Girls", grades: ["4"], level: "REC", headCoach: "user:9913694" });
    expect(r).toEqual({ ok: false, message: "Only the Director can create teams." });
    await expect(listTeams(deps(), coach)).rejects.toThrow("Director only");
    await expect(personOptions(deps(), coach)).rejects.toThrow("Director only");
  });

  it("lists Comp before Rec, then Boys before Girls, youngest grade first", async () => {
    const mk = (gender: string, grades: string[], level: string) => createTeam(deps(), director, { gender, grades, level, headCoach: "user:9913694" });
    await mk("Girls", ["5"], "REC");
    await mk("Boys", ["10"], "COMP");
    await mk("Boys", ["2"], "COMP");
    await mk("Girls", ["K"], "COMP");
    await mk("Boys", ["4"], "REC");
    expect((await listTeams(deps(), director)).map((t) => t.name)).toEqual(["2B Epps", "10B Epps", "KG Epps", "4B Epps", "5G Epps"]);
  });
});
