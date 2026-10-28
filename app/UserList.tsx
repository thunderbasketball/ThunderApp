import { formatCell } from "@/lib/phone";
import type { UserListItem } from "@/lib/users";
import { Chip, EmailLink, GroupCard, PageTitle, PersonRow, PhoneLink, Stats } from "./ui";

// Grouped like the old Thunder User Management: requests, Directors, Coaches, then everyone else (collapsed).
// Each group stays sorted by last name.
export default function UserList({ users }: { users: UserListItem[] }) {
  const active = users.filter((u) => u.active);
  const requests = active.filter((u) => u.request && !u.coach && !u.director && !u.teams.length);
  const directors = active.filter((u) => u.director);
  const coaches = active.filter((u) => u.coach && !u.director);
  const others = active.filter((u) => !u.director && !u.coach && !requests.includes(u));
  const inactive = users.filter((u) => !u.active);

  const rows = (list: UserListItem[]) =>
    list.map((u) => (
      <PersonRow
        key={u.coachId}
        first={u.firstName}
        last={u.lastName}
        avatarTone={u.director ? "blue" : u.coach ? "green" : "zinc"}
        dim={!u.active}
        chips={
          <>
            {u.director && <Chip tone="blue">Director</Chip>}
            {u.coach && <Chip tone="green">Coach</Chip>}
            {requests.includes(u) && <Chip tone="amber">Pending</Chip>}
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
        {u.teams.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {u.teams.map((t) => (
              <Chip key={t} tone="orange">
                {t}
              </Chip>
            ))}
          </div>
        )}
      </PersonRow>
    ));

  return (
    <section>
      <PageTitle title="Users" subtitle="Everyone who can sign in, grouped by role and sorted by last name" />
      <Stats
        items={[
          { label: "Users", value: users.length },
          { label: "Active", value: active.length },
          { label: "Requests", value: requests.length, tone: requests.length ? "text-amber-600 dark:text-amber-400" : "" },
        ]}
      />
      <div className="space-y-3">
        <GroupCard title="Access requests" count={requests.length}>
          {requests.length ? rows(requests) : <li className="px-4 py-3 text-sm text-zinc-500 italic">No pending access requests.</li>}
        </GroupCard>
        {directors.length > 0 && (
          <GroupCard title="Active Directors" count={directors.length}>
            {rows(directors)}
          </GroupCard>
        )}
        {coaches.length > 0 && (
          <GroupCard title="Active Coaches" count={coaches.length}>
            {rows(coaches)}
          </GroupCard>
        )}
        {others.length > 0 && (
          <GroupCard title="Other active users" count={others.length} defaultOpen={false}>
            {rows(others)}
          </GroupCard>
        )}
        {inactive.length > 0 && (
          <GroupCard title="Non-active users" count={inactive.length} defaultOpen={false}>
            {rows(inactive)}
          </GroupCard>
        )}
      </div>
    </section>
  );
}
