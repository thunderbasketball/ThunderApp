import Image from "next/image";
import Link from "next/link";
import { after } from "next/server";
import { popupAnnouncements, unreadCount } from "@/lib/announcements";
import { chatUnreadCount } from "@/lib/chat";
import type { SessionUser } from "@/lib/auth/service";
import { currentContexts } from "@/lib/contexts-server";
import { db } from "@/lib/db";
import { myEventCount } from "@/lib/events";
import { myPracticesToday } from "@/lib/practice-attendance";
import { localParts, TZ, zonedTime } from "@/lib/time";
import { syncIfStale } from "@/lib/teamsnap/scheduler";
import { stopActing } from "./act-as/actions";
import AnnouncementPopup from "./AnnouncementPopup";
import { LogoutButton } from "./HomeActions";
import { Avatar } from "./ui";

type Tab = "teams" | "practice" | "events" | "users" | "players" | "coaches";

// Events the person runs check-in for (from yesterday on), plus their teams' practices today.
async function checkInsFor(user: SessionUser): Promise<number> {
  const deps = { pool: db, now: () => new Date() };
  const t = localParts(new Date());
  const start = zonedTime(t.year, t.month, t.day);
  const next = new Date(Date.UTC(t.year, t.month - 1, t.day + 1));
  const end = zonedTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  const [events, practices] = await Promise.all([myEventCount(deps, user), myPracticesToday(deps, user, start, end)]);
  return events + practices;
}

// Sticky top bar: logo, the user, one chip per role to switch between them, and the Director tabs.
// `context` is the role this page is shown as ("director" or "team:<id>"); it highlights that chip.
export default async function AppHeader({ user, tab, context }: { user: SessionUser; tab?: Tab; context?: string }) {
  const deps = { pool: db, now: () => new Date() };
  const [{ contexts }, unread, myEvents, popups, chatUnread] = await Promise.all([
    currentContexts(user),
    unreadCount(deps, user),
    user.isDirector ? 0 : checkInsFor(user),
    // Not while a Director is viewing as this person.
    user.actingBy ? [] : popupAnnouncements(deps, user),
    user.hasThunderRole ? chatUnreadCount(deps, user) : 0,
  ]);
  // Backup for the sheet timer: after this page is sent, refresh registrations if the last check is stale.
  after(syncIfStale);
  const tabs: { key: Tab; href: string; label: string; icon: string }[] = [
    { key: "teams", href: "/teams", label: "Teams", icon: ICONS.teams },
    { key: "practice", href: "/practice", label: "Practice", icon: ICONS.practice },
    { key: "events", href: "/events", label: "Events", icon: ICONS.events },
    { key: "users", href: "/users", label: "Users", icon: ICONS.users },
    { key: "players", href: "/players", label: "Players", icon: ICONS.players },
    { key: "coaches", href: "/coaches", label: "Coaches", icon: ICONS.coaches },
  ];
  const showTabs = user.isDirector && context === "director";
  return (
    <>
      <header className="sticky top-0 z-10 border-t-[3px] border-t-thunder-orange border-b border-zinc-950/5 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/80">
        {user.actingBy && (
          <form
            action={stopActing}
            className="flex items-center justify-between gap-3 bg-thunder-orange px-4 py-2 text-sm font-medium text-white"
          >
            <span className="min-w-0 truncate">
              👁 Viewing as {user.firstName} {user.lastName} · view only
            </span>
            <button type="submit" className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-thunder-orange">
              Stop
            </button>
          </form>
        )}
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/logo-96.png" alt="Thunder Basketball" width={36} height={36} priority className="size-9" />
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight">Thunder</span>
              <span className="block text-xs font-medium text-thunder-orange">Basketball</span>
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            {myEvents > 0 && (
              <Link
                href="/events"
                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-emerald-700"
              >
                ✓ Check-in
              </Link>
            )}
            {user.hasThunderRole && (
              <Link
                href="/chat"
                aria-label={chatUnread ? `Chat, ${chatUnread} unread` : "Chat"}
                className="relative rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className="size-6">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                  />
                </svg>
                {chatUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white tabular-nums">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
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

        {/* Tablets and computers: tabs under the header. */}
        {showTabs && (
          <nav aria-label="Director" className="mx-auto hidden max-w-3xl px-4 pb-3 sm:block">
            <div className="inline-flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
              {tabs.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`rounded-full px-5 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors ${
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
      {popups.length > 0 && <AnnouncementPopup items={popups} />}

      {/* Phones: a tab bar along the bottom, every tab visible, within thumb reach. Kept outside the header,
        whose blur effect would otherwise pin it to the header instead of the screen. */}
      {showTabs && (
        <nav
          id="bottom-tabs"
          aria-label="Director"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-950/10 bg-white/95 backdrop-blur-xl sm:hidden dark:border-white/10 dark:bg-zinc-950/95"
        >
          <div className="grid grid-cols-6">
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${
                    on ? "text-thunder-blue dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {on && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-thunder-blue" />}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.6} aria-hidden className="size-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                  </svg>
                  {t.label}
                </Link>
              );
            })}
          </div>
          {/* A strip under the tabs for the host's "Powered by" badge (bottom right), so it never covers a tab.
            Also clears the iPhone home bar. Today's date fills the free left side. */}
          <div className="flex h-[max(3.75rem,env(safe-area-inset-bottom))] items-center px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {new Date().toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })}
          </div>
        </nav>
      )}
    </>
  );
}

// Outline icons (Heroicons) for the phone tab bar.
const ICONS = {
  teams:
    "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
  practice:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  events: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  users:
    "M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  players:
    "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  coaches:
    "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5",
};
