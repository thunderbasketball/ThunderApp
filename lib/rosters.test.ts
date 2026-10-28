import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "./auth/service";
import { addPlayers, listRoster, removePlayer, rosterCandidates } from "./rosters";
import { createTestDb } from "./testing/db";

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
const stranger = person("5550002", "Amy");

describe("rosters", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });
  const deps = () => ({ pool: db.pool, now: () => new Date("2026-10-28T12:00:00Z") });
  let team = "";
  let other = "";
  const reg = (id: string, first: string, last: string, gender: string, grade: string) =>
    db.pool.query(
      `insert into registrations (registrant_id, registration_id, first_name, last_name, gender, grade, grade_sort, program, raw, imported_at, imported_by)
       values ($1, $1, $2, $3, $4, $5, $6, 'x', '{}', now(), 'x')`,
      [id, first, last, gender, grade, Number(grade)],
    );

  beforeEach(async () => {
    await db.reset();
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell) values ('5550001', 'Hank', 'X', '4235550001'), ('5550002', 'Amy', 'X', '4235550002')`,
    );
    const t = await db.pool.query<{ id: string }>(
      `insert into teams (name, gender, grades, grade_sort, level, created_by) values ('4G A', 'Girls', '{4}', 4, 'REC', 'x'), ('4G B', 'Girls', '{4}', 4, 'COMP', 'x') returning id::text`,
    );
    [team, other] = t.rows.map((r) => r.id);
    await db.pool.query(`insert into team_staff (team_id, coach_id, role, added_by) values ($1, '5550001', 'HeadCoach', 'x')`, [team]);
    await reg("r1", "Ava", "Zed", "Girls", "4");
    await reg("r2", "Bea", "Young", "Girls", "4");
    await reg("r3", "Cy", "Ames", "Boys", "4");
    await reg("r4", "Dee", "Bell", "Girls", "5");
  });

  it("the Director adds players (who rostered them is recorded); fitting players are offered first", async () => {
    expect((await rosterCandidates(deps(), director, team)).map((c) => [c.firstName, c.fits])).toEqual([
      ["Bea", true],
      ["Ava", true],
      ["Cy", false],
      ["Dee", false],
    ]);
    expect(await addPlayers(deps(), director, team, ["r1", "r2", "r2", "nope!"])).toEqual({ ok: true, added: 2 });
    expect(await addPlayers(deps(), director, team, ["r1"])).toEqual({ ok: true, added: 0 });
    const roster = await listRoster(deps(), director, team);
    expect(roster?.map((p) => [p.firstName, p.rosteredBy, p.registered])).toEqual([
      ["Bea", "Earl X", true],
      ["Ava", "Earl X", true],
    ]);
    // Offered for the other team, showing where they already are.
    await addPlayers(deps(), director, other, ["r4"]);
    expect((await rosterCandidates(deps(), director, other)).find((c) => c.firstName === "Ava")?.otherTeams).toEqual(["4G A"]);
    expect((await rosterCandidates(deps(), director, team)).map((c) => c.firstName)).toEqual(["Cy", "Dee"]);
  });

  it("staff can see their roster but not change it; others can't see it", async () => {
    await addPlayers(deps(), director, team, ["r1"]);
    expect((await listRoster(deps(), head, team))?.length).toBe(1);
    expect(await listRoster(deps(), stranger, team)).toBeNull();
    expect(await addPlayers(deps(), head, team, ["r2"])).toEqual({ ok: false, message: "Only the Director can change rosters." });
    expect(await removePlayer(deps(), head, team, "r1")).toMatchObject({ ok: false });
    expect(await rosterCandidates(deps(), head, team)).toEqual([]);
  });

  it("remove, and a player who left registrations stays on the roster, marked", async () => {
    await addPlayers(deps(), director, team, ["r1", "r2"]);
    expect(await removePlayer(deps(), director, team, "r2")).toEqual({ ok: true });
    expect(await removePlayer(deps(), director, team, "r2")).toMatchObject({ ok: false });
    await db.pool.query("delete from registrations where registrant_id = 'r1'");
    expect(await listRoster(deps(), director, team)).toMatchObject([{ firstName: "Ava", registered: false }]);
  });
});
