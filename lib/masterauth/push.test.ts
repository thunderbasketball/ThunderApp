import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testClock } from "../testing/db";
import { openPin, queuePin, sealPin } from "./pin-box";
import { pushToSheet, type SheetIO } from "./push";

// The real MasterAuth header (blank columns included).
const HEADER = [
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
  "",
  "",
  "",
  "",
  "",
  "",
  "TempAuthCode",
  "CodeExpiration",
  "DeviceID",
  "LastLogin",
  "VerifiedEmail",
];
const at = (c: string) => HEADER.indexOf(c);

// A sheet in memory that behaves like the Google one (values come back as display text).
function fakeSheet(rows: Record<string, string>[]) {
  const data = [HEADER, ...rows.map((r) => HEADER.map((h) => (h ? (r[h] ?? "") : "")))];
  const text = (v: string | boolean | null) => (v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v);
  const writes: { row: number; col: number; value: string | boolean }[] = [];
  let failNext = false;
  let beforeWrite: (() => void) | null = null;
  const io: SheetIO = {
    read: async () => data.map((r) => [...r]),
    writeCells: async (cells) => {
      if (failNext) throw new Error("Google Sheets error: quota");
      beforeWrite?.();
      for (const c of cells) data[c.row - 1][c.col - 1] = text(c.value);
      writes.push(...cells);
    },
    appendRow: async (values) => {
      data.push(values.map(text));
    },
  };
  return {
    io,
    data,
    writes,
    cell: (coachId: string, col: string) => data.find((r) => r[0] === coachId)?.[at(col)],
    failNextWrite: () => (failNext = true),
    onRead: (fn: () => void) => (beforeWrite = fn),
  };
}

const SCENIC = { ScenicCityCoach: "TRUE", ScenicCityAssociations: "Hixson", ThunderAdmin: "TRUE", DeviceID: "abc", Active: "TRUE" };

describe("MasterAuth sheet: App → Sheet", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const env = { ...process.env };
  beforeAll(async () => {
    process.env.MASTERAUTH_SYNC = "on";
    process.env.MASTERAUTH_SHEET = "test";
    process.env.MASTERAUTH_PIN_KEY = randomBytes(32).toString("base64");
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    process.env = env;
    await db?.drop();
  });
  let clock = testClock();
  let sheet = fakeSheet([]);
  const push = () => pushToSheet({ pool: db.pool, now: clock.now, sheet: sheet.io, openPin });
  const queued = async () =>
    (await db.pool.query<{ coach_id: string }>("select coach_id from masterauth_outbox order by 1")).rows.map((r) => r.coach_id);

  beforeEach(async () => {
    await db.reset();
    clock = testClock();
    // Already in both: Sam is also a Scenic City coach.
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell, email, verified_email, pin_hash, thunder_coach)
       values ('5550001', 'Sam', 'Lee', '4235550001', 'sam@example.com', 'sam@example.com', 'scrypt$x$y', true)`,
    );
    await db.pool.query("delete from masterauth_outbox");
    sheet = fakeSheet([
      {
        CoachID: "5550001",
        FirstName: "Sam",
        LastName: "Lee",
        PIN: "607",
        CellNumber: "4235550001",
        EmailAddress: "sam@example.com",
        VerifiedEmail: "sam@example.com",
        ThunderCoach: "TRUE",
        ThunderDirector: "FALSE",
        ThunderRequest: "FALSE",
        ...SCENIC,
      },
    ]);
  });

  it("nothing queued: nothing read or written", async () => {
    expect(await push()).toEqual({ status: "idle", updated: 0, added: 0 });
  });

  it("writes only Thunder's cells that changed; Active, Scenic City and the old login columns are never touched", async () => {
    await db.pool.query("update users set last_name = 'Lee-Park', thunder_director = true, active = false where coach_id = '5550001'");
    expect(await queued()).toEqual(["5550001"]);
    expect(await push()).toMatchObject({ status: "done", updated: 1, added: 0 });
    expect(sheet.writes.map((w) => HEADER[w.col - 1]).sort()).toEqual(["LastName", "ThunderDirector"]);
    expect(sheet.cell("5550001", "LastName")).toBe("Lee-Park");
    expect(sheet.cell("5550001", "Active")).toBe("TRUE"); // deactivating in Thunder doesn't touch Scenic City
    expect(sheet.cell("5550001", "PIN")).toBe("607"); // the app doesn't know it, so it stays
    for (const c of ["ScenicCityCoach", "ScenicCityAssociations", "ThunderAdmin", "DeviceID"])
      expect(sheet.cell("5550001", c)).toBe(SCENIC[c as keyof typeof SCENIC]);
    expect(await queued()).toEqual([]);
  });

  it("a PIN set in the app is written, then forgotten; a reset writes 1234", async () => {
    await db.pool.query("update users set pin_hash = 'scrypt$new$1' where coach_id = '5550001'");
    await queuePin(db.pool, "5550001", sealPin("4321"));
    const box = (await db.pool.query("select pin_enc from masterauth_outbox")).rows[0].pin_enc;
    expect(box).not.toContain("4321"); // encrypted while waiting
    await push();
    expect(sheet.cell("5550001", "PIN")).toBe("4321");
    expect((await db.pool.query("select 1 from masterauth_outbox")).rows).toHaveLength(0);

    await db.pool.query("update users set pin_hash = null where coach_id = '5550001'"); // Reset login
    await push();
    expect(sheet.cell("5550001", "PIN")).toBe("1234");
  });

  it("someone new in the app gets a row: Active, cell, starter PIN; Scenic City columns left empty", async () => {
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell, email, thunder_request) values ('5550002', 'Ann', 'Ray', '4235550002', 'ann@example.com', true)`,
    );
    expect(await push()).toMatchObject({ status: "done", added: 1 });
    const row = sheet.data.at(-1)!;
    expect(Object.fromEntries(HEADER.map((h, i) => [h, row[i]]).filter(([h, v]) => h && v))).toEqual({
      CoachID: "5550002",
      FirstName: "Ann",
      LastName: "Ray",
      Active: "TRUE",
      PIN: "1234",
      CellNumber: "4235550002",
      EmailAddress: "ann@example.com",
      ThunderRequest: "TRUE",
      ThunderCoach: "FALSE",
      ThunderDirector: "FALSE",
    });
  });

  it("deleted in the app: the row stays, Thunder roles cleared", async () => {
    await db.pool.query("delete from users where coach_id = '5550001'");
    await push();
    expect(sheet.cell("5550001", "ThunderCoach")).toBe("FALSE");
    expect(sheet.cell("5550001", "FirstName")).toBe("Sam");
    expect(sheet.cell("5550001", "ScenicCityCoach")).toBe("TRUE");
  });

  it("a failed write is retried later, and a change made meanwhile isn't lost", async () => {
    await db.pool.query("update users set first_name = 'Samuel' where coach_id = '5550001'");
    sheet.failNextWrite();
    expect(await push()).toMatchObject({ status: "failed", message: "Google Sheets error: quota" });
    expect(await push()).toMatchObject({ status: "idle" }); // waits a minute before trying again
    const s = await db.pool.query("select ok, message from sync_status where name = 'masterauth-push'");
    expect(s.rows[0]).toEqual({ ok: false, message: "Google Sheets error: quota" });
    clock.advanceMinutes(2);
    sheet = { ...sheet, ...fakeSheet([{ CoachID: "5550001", FirstName: "Sam", ...SCENIC }]) };
    expect(await push()).toMatchObject({ status: "done", updated: 1 });
    expect(sheet.cell("5550001", "FirstName")).toBe("Samuel");
  });

  it("rows moved between reading and writing: nothing is written to the wrong person", async () => {
    sheet = fakeSheet([
      { CoachID: "5550009", FirstName: "Zed", ...SCENIC },
      { CoachID: "5550001", FirstName: "Sam", ...SCENIC },
    ]);
    await db.pool.query("update users set first_name = 'Samuel' where coach_id = '5550001'");
    const io = sheet.io;
    let reads = 0;
    sheet.io = { ...io, read: async () => (++reads === 2 ? [HEADER, sheet.data[2], sheet.data[1]] : io.read()) }; // someone sorted
    expect(await push()).toMatchObject({ status: "failed", message: "The sheet changed while writing; will try again." });
    expect(sheet.cell("5550009", "FirstName")).toBe("Zed");
  });

  it("text that looks like a formula is written as plain text", async () => {
    await db.pool.query("update users set first_name = '=HYPERLINK(1)' where coach_id = '5550001'");
    await push();
    expect(sheet.cell("5550001", "FirstName")).toBe("'=HYPERLINK(1)");
  });

  it("with the sync off, PINs aren't kept at all", async () => {
    process.env.MASTERAUTH_SYNC = "off";
    await queuePin(db.pool, "5550001", sealPin("4321"));
    process.env.MASTERAUTH_SYNC = "on";
    expect((await db.pool.query("select 1 from masterauth_outbox where pin_enc is not null")).rows).toHaveLength(0);
  });
});
