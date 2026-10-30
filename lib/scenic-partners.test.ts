import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "./auth/service";
import {
  addCourt,
  addGameDays,
  cleanPlaceName,
  deleteCourt,
  deleteGameDay,
  deleteGym,
  getPartner,
  listGameDays,
  listPartners,
  saveGym,
  savePartner,
} from "./scenic-partners";
import { createTestDb, grant } from "./testing/db";

const person = (coachId: string, firstName: string): SessionUser => ({
  coachId,
  firstName,
  lastName: "X",
  isDirector: false,
  isCoach: false,
  requestPending: false,
  hasThunderRole: false,
});
const dee = person("9913694", "Dee"); // Scenic City Director
const pat = person("5550001", "Pat"); // Partner, contact for Baylor
const sam = person("5550002", "Sam"); // Solo

describe("Scenic City partners, gyms, courts and game days", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => db.drop());
  const now = new Date("2026-11-02T15:00:00Z"); // Mon Nov 2, Eastern
  const deps = () => ({ pool: db.pool, now: () => now });
  let baylor = "";
  let other = "";

  beforeEach(async () => {
    await db.reset();
    await db.pool.query(
      `insert into users (coach_id, first_name, last_name, cell) values
         ('9913694', 'Dee', 'X', '4239913694'), ('5550001', 'Pat', 'X', '4235550001'), ('5550002', 'Sam', 'X', '4235550002')`,
    );
    await grant(db.pool, "9913694 scenic-city Director", "5550001 scenic-city Partner", "5550002 scenic-city Solo");
    const p = await db.pool.query<{ id: string }>(
      `insert into partners (name, kind, hosts_games, registers_teams, approved, created_by) values
         ('Baylor School', 'School', true, false, true, 'x'), ('Other Club', 'Organization', false, true, false, 'x') returning id::text`,
    );
    [baylor, other] = p.rows.map((r) => r.id);
    await db.pool.query("insert into partner_contacts (partner_id, coach_id, added_by) values ($1, '5550001', 'x')", [baylor]);
  });

  it("gym and court names: letters, numbers, simple punctuation; never a formula", () => {
    expect(cleanPlaceName("  Main   Gym #2 ")).toBe("Main Gym #2");
    expect(cleanPlaceName("=1+1")).toBeNull();
    expect(cleanPlaceName("")).toBeNull();
  });

  it("Directors see every partner; a contact sees only theirs; others see none", async () => {
    expect((await listPartners(deps(), dee)).partners.map((p) => p.name)).toEqual(["Baylor School", "Other Club"]);
    expect((await listPartners(deps(), pat)).partners.map((p) => p.name)).toEqual(["Baylor School"]);
    expect((await listPartners(deps(), sam)).partners).toEqual([]);
    expect(await getPartner(deps(), pat, other)).toBeNull();
    expect(await getPartner(deps(), sam, baylor)).toBeNull();
    expect(await getPartner(deps(), pat, baylor)).toMatchObject({ name: "Baylor School", contacts: ["Pat X"], canEditPartner: false });
  });

  it("only Directors add or edit partners; names stay unique", async () => {
    const input = { name: "Red Bank HS", kind: "School", hostsGames: true, registersTeams: true, approved: true };
    expect(await savePartner(deps(), pat, null, input)).toMatchObject({ ok: false });
    const r = await savePartner(deps(), dee, null, input);
    expect(r).toMatchObject({ ok: true });
    expect(await savePartner(deps(), dee, other, { ...input, name: "baylor school" })).toMatchObject({ ok: false, message: /already a partner/ });
    expect(await savePartner(deps(), dee, other, { ...input, name: "Other Club", approved: true })).toEqual({ ok: true, id: other });
    expect((await listPartners(deps(), dee)).partners.find((p) => p.id === other)).toMatchObject({ approved: true, hostsGames: true });
  });

  it("a contact manages their partner's gyms and courts, in order; others can't", async () => {
    const g = await saveGym(deps(), pat, baylor, null, { name: "Main Gym", address: "171 Baylor School Rd, Chattanooga" });
    expect(g).toMatchObject({ ok: true });
    const gymId = (g as { id: string }).id;
    for (const c of ["Court 10", "Court 2", "Court 1"]) expect(await addCourt(deps(), pat, gymId, c)).toEqual({ ok: true });
    expect(await addCourt(deps(), pat, gymId, "court 1")).toMatchObject({ ok: false, message: /already used/ });
    expect(await saveGym(deps(), pat, baylor, null, { name: "main gym", address: "" })).toMatchObject({ ok: false, message: /already used/ });
    expect(await saveGym(deps(), pat, other, null, { name: "Their Gym", address: "" })).toMatchObject({ ok: false });
    expect(await saveGym(deps(), sam, baylor, null, { name: "X Gym", address: "" })).toMatchObject({ ok: false });
    expect(await addCourt(deps(), sam, gymId, "Court 3")).toMatchObject({ ok: false });
    expect(await saveGym(deps(), pat, baylor, null, { name: "Gym B", address: "=cmd" })).toMatchObject({ ok: false, message: /address/ });

    const p = await getPartner(deps(), dee, baylor);
    expect(p?.gymList).toMatchObject([{ name: "Main Gym", address: "171 Baylor School Rd, Chattanooga" }]);
    expect(p?.gymList[0].courts.map((c) => c.name)).toEqual(["Court 1", "Court 2", "Court 10"]);
    expect(p).toMatchObject({ gyms: 1, courts: 3 });

    expect(await deleteCourt(deps(), sam, p!.gymList[0].courts[0].id)).toMatchObject({ ok: false });
    expect(await deleteCourt(deps(), pat, p!.gymList[0].courts[0].id)).toEqual({ ok: true });
    expect(await deleteGym(deps(), pat, gymId)).toEqual({ ok: true });
    expect((await getPartner(deps(), dee, baylor))?.gymList).toEqual([]);
  });

  it("game days: one date or a weekly repeat; existing days stay; only Directors change them", async () => {
    expect(await addGameDays(deps(), pat, { from: "2026-12-05" })).toMatchObject({ ok: false });
    expect(await addGameDays(deps(), dee, { from: "2026-12-05" })).toEqual({ ok: true, added: 1 });
    // Saturdays and Sundays, Dec 1–14: Dec 5 already there.
    expect(await addGameDays(deps(), dee, { from: "2026-12-01", to: "2026-12-14", weekdays: [6, 0] })).toEqual({ ok: true, added: 3 });
    expect(await addGameDays(deps(), dee, { from: "2026-12-01", to: "2026-12-14" })).toMatchObject({ ok: false, message: /days of the week/ });
    expect(await addGameDays(deps(), dee, { from: "2026-12-14", to: "2026-12-01", weekdays: [6] })).toMatchObject({ ok: false });
    expect(await addGameDays(deps(), dee, { from: "2026-01-01", to: "2027-06-01", weekdays: [6] })).toMatchObject({ ok: false, message: /a year/ });
    await addGameDays(deps(), dee, { from: "2026-10-31" }); // in the past

    const days = await listGameDays(deps(), sam);
    expect(days?.map((d) => d.day)).toEqual(["2026-12-05", "2026-12-06", "2026-12-12", "2026-12-13"]);
    expect(days?.[0].createdBy).toBe("Dee X");
    expect(await listGameDays(deps(), person("5550009", "Nobody"))).toBeNull();

    expect(await deleteGameDay(deps(), pat, days![0].id)).toMatchObject({ ok: false });
    expect(await deleteGameDay(deps(), dee, days![0].id)).toEqual({ ok: true });
    expect((await listGameDays(deps(), dee))?.length).toBe(3);
  });
});
