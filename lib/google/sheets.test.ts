import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readTab, spreadsheetIdOf } from "./sheets";

const ID = "1fanbOA5o9ed14S1ZuBE7OxzV_On2mGuEpue8yMUlgyA";

describe("spreadsheetIdOf", () => {
  it("takes a full link or a bare ID", () => {
    expect(spreadsheetIdOf(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=0#gid=0`)).toBe(ID);
    expect(spreadsheetIdOf(` ${ID} `)).toBe(ID);
  });
  it("refuses anything else", () => {
    expect(() => spreadsheetIdOf("https://example.com/x")).toThrow(/Google Sheet link/);
  });
});

describe("readTab", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = {
    client_email: `test-${Math.random()}@x.iam.gserviceaccount.com`, // fresh email: no cached token between tests
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  const fakeFetch = (status: number, body: object) =>
    (async (url: string | URL | Request) =>
      String(url).includes("oauth2")
        ? Response.json({ access_token: "tok", expires_in: 3600 })
        : Response.json(body, { status })) as typeof fetch;

  it("returns the cells as text", async () => {
    const rows = await readTab({ key, fetch: fakeFetch(200, { values: [["Id", "first"], ["1", "Ann"]] }) }, ID, "TeamSnapAPI");
    expect(rows).toEqual([["Id", "first"], ["1", "Ann"]]);
  });

  it("says to share the sheet when Google refuses", async () => {
    await expect(readTab({ key, fetch: fakeFetch(403, { error: { message: "denied" } }) }, ID, "X")).rejects.toThrow(
      `Share it with ${key.client_email}`,
    );
  });

  it("names a missing tab", async () => {
    const f = fakeFetch(400, { error: { message: "Unable to parse range: 'Nope'" } });
    await expect(readTab({ key, fetch: f }, ID, "Nope")).rejects.toThrow('no tab named "Nope"');
  });
});
