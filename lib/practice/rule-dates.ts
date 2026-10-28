// Yearly blackout dates: "Nov 26 every year", "4th Thursday of November + 1 day", "last Monday of May".
// Pure date math, shared by the server and the Blackout form.
export type RuleKind = "date" | "nth" | "last";
export type RuleSpec = {
  kind: RuleKind;
  month: number;
  day?: number | null;
  nth?: number | null;
  weekday?: number | null;
  spanDays: number;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORD = ["", "1st", "2nd", "3rd", "4th"];
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// The first day the rule covers in a given year, as a UTC-midnight date.
export function ruleStart(r: RuleSpec, year: number): Date | null {
  if (r.kind === "date") {
    if (!r.day || r.day > daysIn(year, r.month)) return null; // e.g. Feb 29 in a non-leap year
    return new Date(Date.UTC(year, r.month - 1, r.day));
  }
  const wd = r.weekday ?? 0;
  if (r.kind === "nth") {
    const firstWd = new Date(Date.UTC(year, r.month - 1, 1)).getUTCDay();
    return new Date(Date.UTC(year, r.month - 1, 1 + ((wd - firstWd + 7) % 7) + 7 * ((r.nth ?? 1) - 1)));
  }
  const last = daysIn(year, r.month);
  const lastWd = new Date(Date.UTC(year, r.month - 1, last)).getUTCDay();
  return new Date(Date.UTC(year, r.month - 1, last - ((lastWd - wd + 7) % 7)));
}

export function describeRule(r: RuleSpec): string {
  const base =
    r.kind === "date"
      ? `${MONTHS[r.month - 1].slice(0, 3)} ${r.day}`
      : `the ${r.kind === "last" ? "last" : ORD[r.nth ?? 1]} ${WEEKDAYS[r.weekday ?? 0]} of ${MONTHS[r.month - 1]}`;
  const extra = r.spanDays > 1 ? ` + ${r.spanDays - 1} day${r.spanDays > 2 ? "s" : ""} after` : "";
  return `Every year on ${base}${extra}`;
}

// The repeat choices that make sense for a chosen first date (shown when "Repeat every year" is ticked).
export function repeatOptions(isoFrom: string, spanDays: number): { kind: RuleKind; label: string }[] {
  const [y, m, d] = isoFrom.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const nth = Math.ceil(d / 7);
  const opts: { kind: RuleKind; label: string }[] = [{ kind: "date", label: describeRule({ kind: "date", month: m, day: d, spanDays }) }];
  if (nth <= 4) opts.push({ kind: "nth", label: describeRule({ kind: "nth", month: m, nth, weekday, spanDays }) });
  if (d + 7 > daysIn(y, m)) opts.push({ kind: "last", label: describeRule({ kind: "last", month: m, weekday, spanDays }) });
  return opts;
}

// Turn a chosen first date + repeat kind into a stored rule.
export function specFrom(isoFrom: string, kind: RuleKind, spanDays: number): RuleSpec {
  const [y, m, d] = isoFrom.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (kind === "date") return { kind, month: m, day: d, spanDays };
  if (kind === "nth") return { kind, month: m, nth: Math.ceil(d / 7), weekday, spanDays };
  return { kind, month: m, weekday, spanDays };
}
