import { describe, expect, it } from "vitest";
import { coachIdFromCell, formatCell, normalizeCell } from "./phone";

describe("normalizeCell", () => {
  it("accepts common formats", () => {
    expect(normalizeCell("4235551234")).toBe("4235551234");
    expect(normalizeCell("(423) 555-1234")).toBe("4235551234");
    expect(normalizeCell("423.555.1234")).toBe("4235551234");
    expect(normalizeCell("+1 423 555 1234")).toBe("4235551234");
  });

  it("rejects anything that isn't 10 digits", () => {
    expect(normalizeCell("")).toBeNull();
    expect(normalizeCell("555-1234")).toBeNull();
    expect(normalizeCell("24235551234")).toBeNull();
    expect(normalizeCell("423555123456")).toBeNull();
  });
});

describe("coachIdFromCell", () => {
  it("is the last 7 digits", () => {
    expect(coachIdFromCell("4235551234")).toBe("5551234");
  });
});

describe("formatCell", () => {
  it("formats for display", () => {
    expect(formatCell("4235551234")).toBe("(423) 555-1234");
  });
});
