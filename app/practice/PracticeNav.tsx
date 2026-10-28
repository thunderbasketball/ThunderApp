import Link from "next/link";

const LINKS = [
  { key: "schedule", href: "/practice", label: "Schedule" },
  { key: "season", href: "/practice/season", label: "Season" },
  { key: "blackouts", href: "/practice/blackouts", label: "Blackouts" },
  { key: "gyms", href: "/practice/gyms", label: "Gyms" },
] as const;

// The Director's links inside Practice.
export default function PracticeNav({ current }: { current: (typeof LINKS)[number]["key"] }) {
  return (
    <nav aria-label="Practice" className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-white/10">
      {LINKS.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={current === l.key ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${
            current === l.key
              ? "border-thunder-orange text-zinc-900 dark:text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
