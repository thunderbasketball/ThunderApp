import { formatCell } from "@/lib/phone";
import type { UserListItem } from "@/lib/users";
import { Chip, EmailLink, PageTitle, PersonRow, PhoneLink, Stats, card } from "./ui";

export default function UserList({ users }: { users: UserListItem[] }) {
  const pending = users.filter((u) => u.request && !u.coach && !u.director).length;
  const active = users.filter((u) => u.active).length;
  return (
    <section>
      <PageTitle title="Users" subtitle="Everyone who can sign in, sorted by last name" />
      <Stats
        items={[
          { label: "Users", value: users.length },
          { label: "Active", value: active },
          { label: "Pending", value: pending, tone: pending ? "text-amber-600 dark:text-amber-400" : "" },
        ]}
      />
      <ul className={`${card} divide-y divide-zinc-100 overflow-hidden dark:divide-white/5`}>
        {users.map((u) => (
          <PersonRow
            key={u.coachId}
            first={u.firstName}
            last={u.lastName}
            avatarTone={u.director ? "blue" : "zinc"}
            dim={!u.active}
            chips={
              <>
                {u.director && <Chip tone="blue">Director</Chip>}
                {u.coach && <Chip>Coach</Chip>}
                {u.request && !u.coach && !u.director && <Chip tone="amber">Pending</Chip>}
                {!u.active && <Chip tone="red">Inactive</Chip>}
              </>
            }
          >
            <p>
              <PhoneLink cell={u.cell} label={formatCell(u.cell)} />
            </p>
            <p className="truncate">
              {u.email ? <EmailLink email={u.email} /> : "No email"}
              {u.email && (u.verified ? <span className="text-emerald-600 dark:text-emerald-400"> ✓ verified</span> : " · not verified")}
            </p>
          </PersonRow>
        ))}
      </ul>
    </section>
  );
}
