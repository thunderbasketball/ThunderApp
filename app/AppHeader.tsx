import Image from "next/image";
import Link from "next/link";
import { after } from "next/server";
import { unreadCount } from "@/lib/announcements";
import type { SessionUser } from "@/lib/auth/service";
import { currentContexts } from "@/lib/contexts-server";
import { db } from "@/lib/db";
import { syncIfStale } from "@/lib/teamsnap/scheduler";
import { LogoutButton } from "./HomeActions";
import { Avatar } from "./ui";

type Tab = "teams" | "practice" | "users" | "players" | "coaches";

// Sticky top bar: logo, the user, one chip per role to switch between them, and the Director tabs.
// `context` is the role this page is shown as ("director" or "team:<id>"); it highlights that chip.
export default async function AppHeader({ user, tab, context }: { user: SessionUser; tab?: Tab; context?: string }) {
  const [{ contexts }, unread] = await Promise.all([currentContexts(user), unreadCount({ pool: db, now: () => new Date() }, user)]);
  // Backup for the sheet timer: after this page is sent, refresh registrations if the last check is stale.
  after(syncIfStale);
  const tabs: { key: Tab; href: string; label: string }[] = [
    { key: "teams", href: "/teams", label: "Teams" },
    { key: "practice", href: "/practice", label: "Practice" },
    { key: "users", href: "/users", label: "Users" },
    { key: "players", href: "/players", label: "Players" },
    { key: "coaches", href: "/coaches", label: "Coaches" },
  ];
  const showTabs = user.isDirector && context === "director";
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
          {user.isDirector && (
            <Link href="/preview" className="hidden text-sm font-medium text-thunder-blue hover:underline md:block dark:text-blue-400">
              Preview
            </Link>
          )}
          {user.hasThunderRole && (
            <Link
              href="/inbox"
              prefetch={false}
              aria-label={unread ? `Announcements, ${unread} unread` : "Announcements"}
              className="relative rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className="size-6">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white tabular-nums">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          )}
          <p className="hidden truncate text-sm font-medium sm:block">
            {user.firstName} {user.lastName}
          </p>
          <Avatar first={user.firstName} last={user.lastName} tone="orange" />
          <LogoutButton />
        </div>
      </div>

      {contexts.length > 1 && (
        <nav aria-label="Switch role" className="mx-auto max-w-3xl">
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
            {contexts.map((c) => {
              const on = c.key === context;
              return (
                <a
                  key={c.key}
                  href={`/switch?to=${encodeURIComponent(c.key)}`}
                  aria-current={on ? "true" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset transition-colors ${
                    on
                      ? "bg-thunder-orange text-white ring-thunder-orange"
                      : "bg-white text-zinc-600 ring-zinc-950/10 hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-white/15"
                  }`}
                >
                  {c.label}
                </a>
              );
            })}
          </div>
        </nav>
      )}

      {showTabs && (
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
