import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "./auth/service";
import { addPlayers } from "./rosters";
import { createTestDb } from "./testing/db";
import { duplicateNumbers, isMissing, listUniforms, saveUniform, uniformsMissing } from "./uniforms";

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
const parent = person("5550001", "Tess"); // Team Parent on the team
const stranger = person("5550002", "Amy");

describe("uniforms", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });
  const deps = () => ({ pool: db.pool, now: () => new Date("2026-10-30T12:00:00Z") });
  let team = "";

  beforeEach(async () => {
    await db.reset();
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell) values ('5550001', 'Tess', 'X', '4235550001'), ('5550002', 'Amy', 'X', '4235550002')`,
    );
    const t = await db.pool.query<{ id: string }>(
      `insert into teams (name, gender, grades, grade_sort, level, created_by) values ('4G A', 'Girls', '{4}', 4, 'REC', 'x') returning id::text`,
    );
    team = t.rows[0].id;
    await db.pool.query(`insert into team_staff (team_id, coach_id, role, added_by) values ($1, '5550001', 'TeamParent', 'x')`, [team]);
    for (const [id, first, last, needed, size, num] of [
      ["r1", "Ava", "Zed", true, "YM", "9"],
      ["r2", "Bea", "Young", false, "YL", "12"],
      ["r3", "Cy", "Xu", true, null, null],
    ] as const) {
      await db.pool.query(
        `insert into registrations (registrant_id, registration_id, first_name, last_name, gender, grade, grade_sort, program, raw,
                                    imported_at, imported_by, uniform_needed, uniform_size, uniform_number)
         values ($1, $1, $2, $3, 'Girls', '4', 4, 'x', '{}', now(), 'x', $4, $5, $6)`,
        [id, first, last, needed, size, num],
      );
    }
    await addPlayers(deps(), director, team, ["r1", "r2", "r3"]);
  });

  it("lists the roster with what was ordered; the parent's request is only a hint", async () => {
    const rows = await listUniforms(deps(), parent, team);
    expect(rows?.map((r) => [r.firstName, r.ordered, r.askedSize, r.askedNumber, r.number])).toEqual([
      ["Cy", true, null, null, null],
      ["Bea", false, "YL", "12", null],
      ["Ava", true, "YM", "9", null],
    ]);
    expect(await uniformsMissing(deps(), team)).toBe(3);
    expect(await listUniforms(deps(), stranger, team)).toBeNull();
  });

  it("needs a number for everyone and a size for those who ordered; who set it is recorded", async () => {
    expect(await saveUniform(deps(), parent, team, "r2", { number: "12" })).toMatchObject({ ok: true, updatedBy: "Tess X" });
    expect(await saveUniform(deps(), parent, team, "r1", { number: "9" })).toMatchObject({ ok: true });
    expect(await uniformsMissing(deps(), team)).toBe(2); // Ava still needs a size, Cy everything
    expect(await saveUniform(deps(), director, team, "r1", { size: "YM" })).toMatchObject({ ok: true, updatedBy: "Earl X" });
    const ava = (await listUniforms(deps(), parent, team))!.find((r) => r.registrantId === "r1")!;
    expect(ava).toMatchObject({ number: "9", size: "YM", updatedBy: "Earl X" }); // saving the size kept the number
    expect(isMissing(ava)).toBe(false);
    expect(await uniformsMissing(deps(), team)).toBe(1);
    expect(await saveUniform(deps(), parent, team, "r1", { size: null })).toMatchObject({ ok: true });
    expect(await uniformsMissing(deps(), team)).toBe(2);
  });

  it("a duplicate number is allowed but reported", async () => {
    await saveUniform(deps(), parent, team, "r1", { number: "5" });
    expect(await saveUniform(deps(), parent, team, "r2", { number: "5" })).toMatchObject({ ok: true, duplicates: ["5"] });
    expect(duplicateNumbers((await listUniforms(deps(), parent, team))!)).toEqual(new Set(["5"]));
    expect(await saveUniform(deps(), parent, team, "r2", { number: "6" })).toMatchObject({ ok: true, duplicates: [] });
    expect(await saveUniform(deps(), parent, team, "r2", { number: "05" })).toMatchObject({ ok: true, duplicates: ["5"] }); // 05 is #5
    expect(await saveUniform(deps(), parent, team, "r2", { number: "00" })).toMatchObject({ ok: true, duplicates: [] });
    await saveUniform(deps(), parent, team, "r3", { number: "0" });
    expect(duplicateNumbers((await listUniforms(deps(), parent, team))!)).toEqual(new Set()); // 0 and 00 differ
  });

  it("checks every value and who's asking", async () => {
    expect(await saveUniform(deps(), parent, team, "r1", { number: "100" })).toMatchObject({ ok: false });
    expect(await saveUniform(deps(), parent, team, "r1", { number: "=1+1" })).toMatchObject({ ok: false });
    expect(await saveUniform(deps(), parent, team, "r1", { size: "Huge" })).toMatchObject({ ok: false });
    expect(await saveUniform(deps(), parent, team, "nobody", { number: "1" })).toMatchObject({ ok: false });
    expect(await saveUniform(deps(), stranger, team, "r1", { number: "1" })).toMatchObject({ ok: false });
    expect(await saveUniform(deps(), parent, team, "r1", {})).toMatchObject({ ok: false });
  });
});
