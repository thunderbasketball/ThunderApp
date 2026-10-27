// Input checks shared by the server (authoritative) and the login screens (for early messages).

export function isPin(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}$/.test(v);
}

export function isCode(v: unknown): v is string {
  return typeof v === "string" && /^\d{6}$/.test(v);
}

// Letters (any language), spaces, apostrophes, hyphens, periods. Must start with a letter,
// which also blocks spreadsheet formulas (= + - @).
export function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return /^\p{L}[\p{L} '.-]{0,39}$/u.test(s) ? s : null;
}

export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s.length > 254) return null;
  return /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s) ? s : null;
}

// "earl@gmail.com" -> "e***@gmail.com"
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user[0]}***@${domain}`;
}
