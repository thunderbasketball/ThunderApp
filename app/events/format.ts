import { TZ } from "@/lib/time";

export const eventWhen = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
