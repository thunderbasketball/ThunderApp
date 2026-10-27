import { formatCell } from "@/lib/phone";
import type { UserListItem } from "@/lib/users";

const chip = "rounded-full px-2.5 py-0.5 text-xs font-medium";

export default function UserList({ users }: { users: UserListItem[] }) {
  const pending = users.filter((u) => u.request && !u.coach && !u.director).length;
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Users ({users.length})</h2>
        {pending > 0 && <span className="text-sm text-amber-700 dark:text-amber-400">{pending} pending</span>}
      </div>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {users.map((u) => (
          <li key={u.coachId} className={`p-4 ${u.active ? "" : "opacity-50"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {u.lastName}, {u.firstName}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  <a href={`tel:${u.cell}`}>{formatCell(u.cell)}</a>
                </p>
                <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {u.email ?? "No email"}
                  {u.email && (u.verified ? " ✓" : " (not verified)")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {u.director && <span className={`${chip} bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200`}>Director</span>}
                {u.coach && <span className={`${chip} bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200`}>Coach</span>}
                {u.request && !u.coach && !u.director && (
                  <span className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200`}>Pending</span>
                )}
                {!u.active && <span className={`${chip} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200`}>Inactive</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
