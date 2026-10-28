import Link from "next/link";
import type { SessionUser } from "@/lib/auth/service";
import { LogoutButton } from "./HomeActions";

// Sticky top bar: name, role chips, and Director tabs. (Full role/team switching comes in Phase 3.)
export default function AppHeader({ user, tab }: { user: SessionUser; tab?: "users" | "players" | "coaches" }) {
  const roles = [user.isDirector && "Director", user.isCoach && "Coach"].filter(Boolean) as string[];
  const tabs = [
    { key: "users", href: "/", label: "Users" },
    { key: "players", href: "/players", label: "Players" },
    { key: "coaches", href: "/coaches", label: "Coaches" },
  ];
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/95">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {user.firstName} {user.lastName}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {roles.map((r) => (
              <span key={r} className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {r}
              </span>
            ))}
          </div>
        </div>
        <LogoutButton />
      </div>
      {user.isDirector && (
        <nav className="mx-auto max-w-3xl px-4 pb-3">
          <div className="flex rounded-full bg-zinc-100 p-1 sm:inline-flex dark:bg-zinc-900">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                aria-current={tab === t.key ? "page" : undefined}
                className={`flex-1 rounded-full px-3 py-1.5 text-center sm:flex-none sm:px-6 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-700 dark:text-white dark:ring-zinc-600"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
