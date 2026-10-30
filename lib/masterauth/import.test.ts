import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "../auth/crypto";
import { createTestDb } from "../testing/db";
import { importMasterAuth, parseMasterAuth } from "./import";

const H = [
  "CoachID",
  "FirstName",
  "LastName",
  "Active",
  "PIN",
  "CellNumber",
  "EmailAddress",
  "ThunderAdmin",
  "ThunderRequest",
  "ScenicCityRequest",
  "ThunderCoach",
  "ScenicCityCoach",
  "ThunderDirector",
  "ScenicCityDirector",
  "ScenicCityAssociations",
  "",
  "TempAuthCode",
  "VerifiedEmail",
];
// CoachID, First, Last, Active, PIN, Cell, Email, Admin, TReq, SReq, TCoach, SCoach, TDir, SDir, SAssoc, -, Temp, Verified
const u = (o: Partial<Record<string, string>> = {}) => [
  o.id ?? "5551234",
  o.first ?? "Jeb",
  o.last ?? "Black",
  o.active ?? "TRUE",
  o.pin ?? "1988",
  o.cell ?? "4235551234",
  o.email ?? "jeb@example.com",
  "",
  o.treq ?? "FALSE",
  "FALSE",
  o.coach ?? "TRUE",
  o.scoach ?? "FALSE",
  o.dir ?? "FALSE",
  "FALSE",
  o.assoc ?? "FALSE",
  "",
  "",
  o.verified ?? "",
];
const tab = (...rows: string[][]) => [H, ...rows];

describe("parseMasterAuth", () => {
  it("reads a row", () => {
    const r = parseMasterAuth(tab(u({ verified: "jeb@example.com", assoc: "TRUE" })));
    expect(r.errors).toEqual([]);
    expect(r.users[0]).toMatchObject({
      coachId: "5551234",
      first: "Jeb",
      last: "Black",
      active: true,
      pin: "1988",
      cell: "4235551234",
      email: "jeb@example.com",
      verifiedEmail: "jeb@example.com",
      thunderCoach: true,
      thunderDirector: false,
      scenicCityAssociations: "TRUE",
    });
  });

  it("restores a PIN's dropped leading zero, and treats 1234 as the starter PIN", () => {
    const r = parseMasterAuth(tab(u({ pin: "607" }), u({ id: "5550002", cell: "4235550002", pin: "1234" })));
    expect(r.users.map((x) => x.pin)).toEqual(["0607", null]);
  });

  it("errors on mismatched CoachID, bad cells, duplicates", () => {
    const r = parseMasterAuth(tab(u({ id: "1111111" }), u({ cell: "555" }), u(), u()));
    expect(r.errors.map((e) => e.message)).toEqual([
      "CoachID 1111111 doesn't match the last 7 digits of cell 4235551234.",
      'Cell "555" isn\'t a 10-digit number.',
      "CoachID 5551234 appears twice.",
    ]);
  });

  it("warns on a bad email and leaves it blank", () => {
    const r = parseMasterAuth(tab(u({ email: "not an email" })));
    expect(r.users[0].email).toBeNull();
    expect(r.warnings[0].message).toMatch(/doesn't look right/);
  });
});

describe("importMasterAuth", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });
  beforeEach(async () => {
    await db.reset();
  });
  const now = new Date("2026-10-28T12:00:00Z");
  const user = async (coachId: string) => (await db.pool.query("select * from users where coach_id = $1", [coachId])).rows[0];

  it("adds new users with hashed PINs and copies Scenic City columns", async () => {
    const out = await importMasterAuth(db.pool, parseMasterAuth(tab(u({ assoc: "TRUE", scoach: "TRUE" }))), { now, dryRun: false });
    expect(out).toEqual([{ coachId: "5551234", name: "Jeb Black", status: "new", changes: [] }]);
    const row = await user("5551234");
    expect(row.pin_hash).toMatch(/^scrypt\$/);
    expect(await verifyPin("1988", row.pin_hash)).toBe(true);
    expect(row).toMatchObject({ thunder_coach: true, scenic_city_coach: true, scenic_city_associations: "TRUE", email: "jeb@example.com" });
  });

  it("updates an app user: sheet wins for name, email and PIN; roles are combined", async () => {
    await db.pool.query(
      "insert into users (coach_id, first_name, last_name, cell, email, thunder_director) values ('5551234', 'Jebediah', 'Black', '4235551234', 'old@example.com', true)",
    );
    const out = await importMasterAuth(db.pool, parseMasterAuth(tab(u())), { now, dryRun: false });
    expect(out[0]).toMatchObject({ status: "updated" });
    expect(out[0].changes).toEqual([
      "name Jebediah Black → Jeb Black",
      "PIN from sheet",
      "email old@example.com → jeb@example.com",
      "+Coach",
    ]);
    expect(await user("5551234")).toMatchObject({ first_name: "Jeb", thunder_director: true, thunder_coach: true });
  });

  it("keeps a PIN the person chose in the app when the sheet still has 1234", async () => {
    const mine = await hashPin("4321");
    await db.pool.query(
      "insert into users (coach_id, first_name, last_name, cell, pin_hash) values ('5551234', 'Jeb', 'Black', '4235551234', $1)",
      [mine],
    );
    await importMasterAuth(db.pool, parseMasterAuth(tab(u({ pin: "1234" }))), { now, dryRun: false });
    expect((await user("5551234")).pin_hash).toBe(mine);
  });

  it("running again changes nothing", async () => {
    const parsed = parseMasterAuth(tab(u()));
    await importMasterAuth(db.pool, parsed, { now, dryRun: false });
    const before = await user("5551234");
    const out = await importMasterAuth(db.pool, parsed, { now: new Date("2026-10-29T12:00:00Z"), dryRun: false });
    expect(out[0]).toMatchObject({ status: "unchanged", changes: [] });
    expect(await user("5551234")).toEqual(before);
  });

  it("a dry run changes nothing; users only in the app are left alone", async () => {
    await db.pool.query("insert into users (coach_id, first_name, last_name, cell) values ('0000001', 'Test', 'Director', '9990000001')");
    const out = await importMasterAuth(db.pool, parseMasterAuth(tab(u())), { now, dryRun: true });
    expect(out).toHaveLength(1);
    expect((await db.pool.query("select coach_id from users")).rows).toEqual([{ coach_id: "0000001" }]);
  });

  it("refuses a cell already used by a different CoachID", async () => {
    await db.pool.query("insert into users (coach_id, first_name, last_name, cell) values ('7777777', 'Some', 'One', '4235551234')");
    await expect(importMasterAuth(db.pool, parseMasterAuth(tab(u())), { now, dryRun: false })).rejects.toThrow(
      /already used by CoachID 7777777/,
    );
  });
});
