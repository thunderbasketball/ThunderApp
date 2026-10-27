import Link from "next/link";
import type { SessionUser } from "@/lib/auth/service";
import { LogoutButton } from "./HomeActions";

// Sticky top bar: name, role chips, and Director tabs. (Full role/team switching comes in Phase 3.)
export default function AppHeader({ user, tab }: { user: SessionUser; tab?: "users" | "players" }) {
  const roles = [user.isDirector && "Director", user.isCoach && "Coach"].filter(Boolean) as string[];
  const tabs = [
    { key: "users", href: "/", label: "Users" },
    { key: "players", href: "/players", label: "Players" },
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
        <nav className="mx-auto flex max-w-3xl gap-1 px-4">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t.key ? "border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400" : "border-transparent text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
