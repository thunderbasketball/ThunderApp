// Test-only: a small TeamSnap export to build rows from.
export const HEADER =
  "Id,Registrant Id,Registration Created At,Roster Status,first,last,address,birthdate,gender,p1fn,p1ln,p1email,p1cell,Are you interested in Coaching?,Winter Fees,Registration Note,Registration Note";

export const row = (o: Partial<Record<string, string>> = {}) =>
  [
    o.id ?? "100",
    o.rid ?? "200",
    o.created ?? "2026-10-02 13:38:58 UTC",
    o.status ?? "(2026/27 Winter Teams)",
    o.first ?? "Sam",
    o.last ?? "Test",
    o.address ?? "1 Main St",
    o.birthdate ?? "08-03-2020 8:00:00 PM",
    o.gender ?? "Male",
    "Pat",
    "Test",
    o.email ?? "pat@example.com",
    o.cell ?? "4235550000",
    o.coach ?? "NO",
    o.program ?? "1st Boys",
    o.note1 ?? "",
    o.note2 ?? "",
  ]
    .map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
    .join(",");
