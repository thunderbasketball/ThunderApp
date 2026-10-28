import Image from "next/image";
import Link from "next/link";
import type { SessionUser } from "@/lib/auth/service";
import { LogoutButton } from "./HomeActions";
import { Avatar } from "./ui";

// Sticky top bar: logo, the user's name and roles, and Director tabs. (Full role/team switching comes in Phase 3.)
export default function AppHeader({ user, tab }: { user: SessionUser; tab?: "teams" | "users" | "players" | "coaches" }) {
  const roles = [user.isDirector && "Director", user.isCoach && "Coach"].filter(Boolean) as string[];
  const tabs = [
    { key: "teams", href: "/teams", label: "Teams" },
    { key: "users", href: "/", label: "Users" },
    { key: "players", href: "/players", label: "Players" },
    { key: "coaches", href: "/coaches", label: "Coaches" },
  ];
  return (
    <header className="sticky top-0 z-10 border-t-[3px] border-t-thunder-orange border-b border-zinc-950/5 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/brand/logo-96.png" alt="Thunder Basketball" width={36} height={36} priority className="size-9" />
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">Thunder</span>
            <span className="block text-xs font-medium text-thunder-orange">Basketball</span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{roles.join(" · ") || "No role yet"}</p>
          </div>
          <Avatar first={user.firstName} last={user.lastName} tone="orange" />
          <LogoutButton />
        </div>
      </div>
      {user.isDirector && (
        <nav className="mx-auto max-w-3xl px-4 pb-3">
          <div className="flex rounded-full bg-zinc-100 p-1 sm:inline-flex dark:bg-zinc-900">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                aria-current={tab === t.key ? "page" : undefined}
                className={`flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none sm:px-6 ${
                  tab === t.key
                    ? "bg-thunder-blue text-white shadow-sm"
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
