import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testClock, testMailer } from "../testing/db";
import { hashPin } from "./crypto";
import * as auth from "./service";
import { MSG, type Deps, type Step } from "./service";

let db: Awaited<ReturnType<typeof createTestDb>>;
let clock: ReturnType<typeof testClock>;
let mail: ReturnType<typeof testMailer>;
let deps: Deps;

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);
afterAll(async () => {
  await db?.drop();
});
beforeEach(async () => {
  await db.reset();
  clock = testClock();
  mail = testMailer();
  deps = { pool: db.pool, sendEmail: mail.sendEmail, now: clock.now };
});

const CELL = "4235551234";

async function addUser(o: {
  cell?: string;
  pin?: string | null;
  email?: string | null;
  verified?: boolean;
  coach?: boolean;
  director?: boolean;
  active?: boolean;
  request?: boolean;
}) {
  const cell = o.cell ?? CELL;
  const email = o.email === undefined ? "earl@example.com" : o.email;
  await db.pool.query(
    `insert into users (coach_id, first_name, last_name, active, pin_hash, cell, email, verified_email,
                        thunder_request, thunder_coach, thunder_director)
     values ($1, 'Earl', 'Epps', $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      cell.slice(-7),
      o.active ?? true,
      o.pin === null ? null : await hashPin(o.pin ?? "5678"),
      cell,
      email,
      o.verified === false ? null : email,
      o.request ?? false,
      o.coach ?? true,
      o.director ?? false,
    ],
  );
}

async function userRow(cell = CELL) {
  return (await db.pool.query("select * from users where cell = $1", [cell])).rows[0];
}

function expectError(s: Step, message?: string | RegExp) {
  expect(s.step).toBe("error");
  if (message && s.step === "error") {
    if (typeof message === "string") expect(s.message).toBe(message);
    else expect(s.message).toMatch(message);
  }
}

function token(s: Step): string {
  if (s.step !== "loggedIn") throw new Error(`Expected loggedIn, got ${JSON.stringify(s)}`);
  return s.token;
}

describe("phone step", () => {
  it("rejects bad numbers", async () => {
    expectError(await auth.lookupPhone(deps, "555-1234"), MSG.badPhone);
  });

  it("unknown number goes to Create Account", async () => {
    expect(await auth.lookupPhone(deps, "(423) 555-1234")).toEqual({ step: "create" });
  });

  it("inactive account is deactivated", async () => {
    await addUser({ active: false });
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "done", message: MSG.deactivated });
  });

  it("pending request is still pending", async () => {
    await addUser({ coach: false, request: true });
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "done", message: MSG.pending });
  });

  it("normal account goes to the PIN step", async () => {
    await addUser({});
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "pin" });
  });
});

describe("create account", () => {
  const form = { cell: CELL, firstName: "Earl", lastName: "Epps", email: "Earl@Example.com", pin1: "2468", pin2: "2468" };

  it("validates before sending anything", async () => {
    expectError(await auth.startSignup(deps, { ...form, firstName: "=HACK()" }), MSG.badName);
    expectError(await auth.startSignup(deps, { ...form, email: "nope" }), MSG.badEmail);
    expectError(await auth.startSignup(deps, { ...form, pin2: "1357" }), MSG.pinMismatch);
    expectError(await auth.startSignup(deps, { ...form, pin1: "1234", pin2: "1234" }), MSG.pinStarter);
    expect(mail.sent).toHaveLength(0);
  });

  it("emails a code and saves nothing until it checks out", async () => {
    const s = await auth.startSignup(deps, form);
    expect(s).toEqual({ step: "signupCode", maskedEmail: "e***@example.com" });
    expect(mail.sent[0].to).toBe("earl@example.com");
    expect(await userRow()).toBeUndefined();

    expectError(await auth.completeSignup(deps, CELL, "000000"), /Wrong code. 4 tries left/);
    expect(await userRow()).toBeUndefined();

    const done = await auth.completeSignup(deps, CELL, mail.lastCode());
    expect(done).toEqual({ step: "done", message: MSG.requested });
    const u = await userRow();
    expect(u).toMatchObject({
      coach_id: "5551234",
      first_name: "Earl",
      email: "earl@example.com",
      verified_email: "earl@example.com",
      thunder_request: true,
      thunder_coach: false,
      active: true,
    });
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "done", message: MSG.pending });
  });

  it("refuses a number whose last 7 digits match an existing user", async () => {
    await addUser({ cell: "6155551234" });
    expectError(await auth.startSignup(deps, form), MSG.taken);
  });

  it("a code can't be used twice", async () => {
    await auth.startSignup(deps, form);
    const code = mail.lastCode();
    await auth.completeSignup(deps, CELL, code);
    expectError(await auth.completeSignup(deps, CELL, code), MSG.codeExpired);
  });
});

describe("email codes", () => {
  const form = { cell: CELL, firstName: "Earl", lastName: "Epps", email: "earl@example.com", pin1: "2468", pin2: "2468" };

  it("expire after 15 minutes", async () => {
    await auth.startSignup(deps, form);
    clock.advanceMinutes(15);
    expectError(await auth.completeSignup(deps, CELL, mail.lastCode()), MSG.codeExpired);
  });

  it("die after 5 wrong tries, even if the right code follows", async () => {
    await auth.startSignup(deps, form);
    for (let i = 0; i < 4; i++) await auth.completeSignup(deps, CELL, "000000");
    expectError(await auth.completeSignup(deps, CELL, "000000"), MSG.codeDead);
    expectError(await auth.completeSignup(deps, CELL, mail.lastCode()), MSG.codeDead);
  });

  it("only the newest code works", async () => {
    await auth.startSignup(deps, form);
    const first = mail.lastCode();
    await auth.startSignup(deps, form);
    const second = mail.lastCode();
    if (first !== second) expectError(await auth.completeSignup(deps, CELL, first));
    expect((await auth.completeSignup(deps, CELL, second)).step).toBe("done");
  });

  it("max 3 emails per hour per person", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await auth.startSignup(deps, form)).step).toBe("signupCode");
      clock.advanceMinutes(10);
    }
    expectError(await auth.startSignup(deps, form), /Too many codes sent. Try again in 30 minutes/);
    expect(mail.sent).toHaveLength(3);
    clock.advanceMinutes(30);
    expect((await auth.startSignup(deps, form)).step).toBe("signupCode");
  });

  it("a failed send doesn't count and saves nothing", async () => {
    deps.sendEmail = async () => {
      throw new Error("mail down");
    };
    await expect(auth.startSignup(deps, form)).rejects.toThrow("mail down");
    const n = await db.pool.query("select count(*)::int as n from email_codes");
    expect(n.rows[0].n).toBe(0);
  });
});

describe("starter PIN 1234", () => {
  it("with email on file: skips PIN, emails that address immediately", async () => {
    await addUser({ pin: "1234", verified: false });
    const s = await auth.lookupPhone(deps, CELL);
    expect(s).toEqual({ step: "starterCode", maskedEmail: "e***@example.com" });
    expect(mail.sent[0].to).toBe("earl@example.com");
  });

  it("the email on file can't be swapped", async () => {
    await addUser({ pin: "1234" });
    await auth.sendStarterCode(deps, CELL, "other@example.com");
    expect(mail.sent.every((m) => m.to === "earl@example.com")).toBe(true);
  });

  it("no PIN at all counts as the starter PIN", async () => {
    await addUser({ pin: null });
    expect((await auth.lookupPhone(deps, CELL)).step).toBe("starterCode");
  });

  it("Set Your PIN: new PIN twice, not 1234, then logged in and verified", async () => {
    await addUser({ pin: "1234", verified: false });
    await auth.lookupPhone(deps, CELL);
    const code = mail.lastCode();
    expectError(await auth.completeStarter(deps, CELL, code, "1234", "1234"), MSG.pinStarter);
    expectError(await auth.completeStarter(deps, CELL, code, "2468", "1357"), MSG.pinMismatch);
    token(await auth.completeStarter(deps, CELL, code, "2468", "2468"));
    expect(await userRow()).toMatchObject({ email: "earl@example.com", verified_email: "earl@example.com" });
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "pin" });
    token(await auth.submitPin(deps, CELL, "2468"));
  });

  it("with no email: asks for one, then sends the code there", async () => {
    await addUser({ pin: "1234", email: null });
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "starterEmail" });
    expectError(await auth.sendStarterCode(deps, CELL, "bad"), MSG.badEmail);
    expect(await auth.sendStarterCode(deps, CELL, "New@Example.com")).toEqual({
      step: "starterCode",
      maskedEmail: "n***@example.com",
    });
    token(await auth.completeStarter(deps, CELL, mail.lastCode(), "2468", "2468"));
    expect(await userRow()).toMatchObject({ email: "new@example.com", verified_email: "new@example.com" });
  });

  it("typing 1234 on the PIN step never logs in", async () => {
    await addUser({ pin: "1234" });
    const s = await auth.submitPin(deps, CELL, "1234");
    expect(s.step).toBe("starterCode");
  });
});

describe("local testing bypass", () => {
  it("when on: phone + 123456 logs any active account in, no PIN, no email", async () => {
    await addUser({ email: null, coach: false, request: true });
    deps.devStarterBypass = true;
    deps.devFixedCode = "123456";
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "devCode" });
    expectError(await auth.devLogin(deps, CELL, "000000"), /Wrong code/);
    token(await auth.devLogin(deps, CELL, "123456"));
    expect(mail.sent).toHaveLength(0);
  });

  it("when on: inactive accounts still can't get in", async () => {
    await addUser({ active: false });
    deps.devStarterBypass = true;
    deps.devFixedCode = "123456";
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "done", message: MSG.deactivated });
    expect((await auth.devLogin(deps, CELL, "123456")).step).toBe("done");
  });

  it("when on: Create Account + 123456 makes a Director and logs in", async () => {
    deps.devStarterBypass = true;
    deps.devFixedCode = "123456";
    await auth.startSignup(deps, { cell: CELL, firstName: "Earl", lastName: "Epps", email: "e@example.com", pin1: "2468", pin2: "2468" });
    token(await auth.completeSignup(deps, CELL, "123456"));
    expect(await userRow()).toMatchObject({ thunder_director: true, thunder_request: false });
  });

  it("when off: devLogin does nothing", async () => {
    await addUser({});
    deps.devFixedCode = "123456";
    expectError(await auth.devLogin(deps, CELL, "123456"), "Not available.");
  });

  it("when on: doesn't help anyone with a real PIN", async () => {
    await addUser({});
    deps.devStarterBypass = true;
    expectError(await auth.submitPin(deps, CELL, "1234"), /Wrong PIN/);
  });

  it("fixed code: always 123456, no email, no hourly limit; wrong codes still count", async () => {
    await addUser({});
    deps.devFixedCode = "123456";
    for (let i = 0; i < 4; i++) expect((await auth.startForgot(deps, CELL)).step).toBe("resetCode");
    expect(mail.sent).toHaveLength(0);
    expectError(await auth.completeReset(deps, CELL, "000000", "2468", "2468"), /Wrong code. 4 tries left/);
    token(await auth.completeReset(deps, CELL, "123456", "2468", "2468"));
  });

  it("when off (the default): normal starter rules", async () => {
    await addUser({ pin: "1234" });
    expect((await auth.submitPin(deps, CELL, "1234")).step).toBe("starterCode");
  });
});

describe("PIN step", () => {
  it("correct PIN + verified email logs in", async () => {
    await addUser({ director: true });
    const t = token(await auth.submitPin(deps, CELL, "5678"));
    expect(await auth.getSessionUser(deps, t)).toMatchObject({
      coachId: "5551234",
      firstName: "Earl",
      isDirector: true,
      isCoach: true,
      hasThunderRole: true,
    });
  });

  it("counts down wrong tries, locks for 15 minutes on the 5th", async () => {
    await addUser({});
    for (let left = 4; left >= 1; left--) {
      expectError(await auth.submitPin(deps, CELL, "0000"), `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.`);
    }
    expectError(await auth.submitPin(deps, CELL, "0000"), MSG.locked);
    expectError(await auth.submitPin(deps, CELL, "5678"), MSG.locked); // right PIN still refused
    clock.advanceMinutes(14);
    expectError(await auth.submitPin(deps, CELL, "5678"), MSG.locked);
    clock.advanceMinutes(1);
    token(await auth.submitPin(deps, CELL, "5678"));
  });

  it("a correct PIN resets the wrong-try count", async () => {
    await addUser({});
    for (let i = 0; i < 4; i++) await auth.submitPin(deps, CELL, "0000");
    token(await auth.submitPin(deps, CELL, "5678"));
    expectError(await auth.submitPin(deps, CELL, "0000"), "Wrong PIN. 4 tries left.");
  });
});

describe("email not verified", () => {
  it("correct PIN asks to verify, code to email on file, then logged in", async () => {
    await addUser({ verified: false });
    expect(await auth.submitPin(deps, CELL, "5678")).toEqual({ step: "verifyChoice", maskedEmail: "e***@example.com" });
    expect(await auth.sendVerifyCode(deps, CELL, "5678", null)).toEqual({ step: "verifyCode", maskedEmail: "e***@example.com" });
    expect(await userRow()).toMatchObject({ verified_email: null }); // nothing saved yet
    token(await auth.completeVerify(deps, CELL, "5678", mail.lastCode()));
    expect(await userRow()).toMatchObject({ email: "earl@example.com", verified_email: "earl@example.com" });
  });

  it("can use a different email", async () => {
    await addUser({ verified: false });
    await auth.sendVerifyCode(deps, CELL, "5678", "coach@example.com");
    expect(mail.sent[0].to).toBe("coach@example.com");
    token(await auth.completeVerify(deps, CELL, "5678", mail.lastCode()));
    expect(await userRow()).toMatchObject({ email: "coach@example.com", verified_email: "coach@example.com" });
  });

  it("needs the right PIN to send or use a code", async () => {
    await addUser({ verified: false });
    expectError(await auth.sendVerifyCode(deps, CELL, "0000", null), /Wrong PIN/);
    expect(mail.sent).toHaveLength(0);
    await auth.sendVerifyCode(deps, CELL, "5678", null);
    expectError(await auth.completeVerify(deps, CELL, "0000", mail.lastCode()), /Wrong PIN/);
  });

  it("counts as unverified when Email differs from VerifiedEmail", async () => {
    await addUser({});
    await db.pool.query("update users set email = 'changed@example.com'");
    expect((await auth.submitPin(deps, CELL, "5678")).step).toBe("verifyChoice");
  });
});

describe("Forgot PIN", () => {
  it("sends only to the verified email, resets PIN, clears lockout", async () => {
    await addUser({});
    for (let i = 0; i < 5; i++) await auth.submitPin(deps, CELL, "0000");
    expectError(await auth.submitPin(deps, CELL, "5678"), MSG.locked);

    expect(await auth.startForgot(deps, CELL)).toEqual({ step: "resetCode", maskedEmail: "e***@example.com" });
    expect(mail.sent[0].to).toBe("earl@example.com");
    expectError(await auth.completeReset(deps, CELL, mail.lastCode(), "1234", "1234"), MSG.pinStarter);
    token(await auth.completeReset(deps, CELL, mail.lastCode(), "9753", "9753"));

    expectError(await auth.submitPin(deps, CELL, "5678"), "Wrong PIN. 4 tries left.");
    token(await auth.submitPin(deps, CELL, "9753"));
  });

  it("no verified email: contact the Director", async () => {
    await addUser({ verified: false });
    expectError(await auth.startForgot(deps, CELL), MSG.noVerifiedEmail);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("no Thunder role", () => {
  it("logs in, then Request Access sets the request flag", async () => {
    await addUser({ coach: false });
    const t = token(await auth.submitPin(deps, CELL, "5678"));
    expect(await auth.getSessionUser(deps, t)).toMatchObject({ hasThunderRole: false, requestPending: false });
    expect(await auth.requestAccess(deps, t)).toEqual({ step: "done", message: MSG.requested });
    expect(await userRow()).toMatchObject({ thunder_request: true });
    expect(await auth.getSessionUser(deps, t)).toMatchObject({ requestPending: true });
    expect(await auth.lookupPhone(deps, CELL)).toEqual({ step: "done", message: MSG.pending });
  });
});

describe("sessions", () => {
  it("last 6 hours", async () => {
    await addUser({});
    const t = token(await auth.submitPin(deps, CELL, "5678"));
    clock.advanceMinutes(6 * 60 - 1);
    expect(await auth.getSessionUser(deps, t)).not.toBeNull();
    clock.advanceMinutes(1);
    expect(await auth.getSessionUser(deps, t)).toBeNull();
  });

  it("roles are re-read on every request", async () => {
    await addUser({ director: true });
    const t = token(await auth.submitPin(deps, CELL, "5678"));
    await db.pool.query("update users set thunder_director = false");
    expect(await auth.getSessionUser(deps, t)).toMatchObject({ isDirector: false });
  });

  it("deactivating ends the session at once", async () => {
    await addUser({});
    const t = token(await auth.submitPin(deps, CELL, "5678"));
    await db.pool.query("update users set active = false");
    expect(await auth.getSessionUser(deps, t)).toBeNull();
  });

  it("logout deletes the session; junk tokens get nothing", async () => {
    await addUser({});
    const t = token(await auth.submitPin(deps, CELL, "5678"));
    await auth.logout(deps, t);
    expect(await auth.getSessionUser(deps, t)).toBeNull();
    expect(await auth.getSessionUser(deps, "junk")).toBeNull();
    expect(await auth.getSessionUser(deps, undefined)).toBeNull();
  });
});
