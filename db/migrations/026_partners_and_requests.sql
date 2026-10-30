-- Scenic City Partners and access requests (SPEC.md section 13, build step 4).

-- A school or organization working with Scenic City. A new one waits for a Scenic City Director's approval.
create table partners (
  id               bigserial primary key,
  name             text not null,
  kind             text not null check (kind in ('School', 'Organization')),
  hosts_games      boolean not null,
  registers_teams  boolean not null check (hosts_games or registers_teams),
  approved         boolean not null default false,
  created_by       text not null,
  created_at       timestamptz not null default now()
);
create unique index partners_name on partners (lower(name));

-- A partner's contact people (users with the Partner role). One person can be a contact for several partners.
create table partner_contacts (
  partner_id  bigint not null references partners(id) on delete cascade,
  coach_id    text not null references users(coach_id) on delete cascade,
  added_by    text not null,
  added_at    timestamptz not null default now(),
  primary key (partner_id, coach_id)
);
create index partner_contacts_coach on partner_contacts(coach_id);

-- What a pending request asks for. The person also holds the organization's Request role while it's open.
create table access_requests (
  coach_id    text not null references users(coach_id) on delete cascade,
  org         text not null references organizations(slug),
  wants       text not null check (wants in ('Partner', 'Solo')),
  partner_id  bigint references partners(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (coach_id, org)
);

insert into partners (name, kind, hosts_games, registers_teams, approved, created_by)
values ('Thunder Basketball', 'Organization', true, true, true, 'setup');

alter table partners enable row level security;
alter table partner_contacts enable row level security;
alter table access_requests enable row level security;
revoke all on partners, partner_contacts, access_requests from anon, authenticated;
revoke all on sequence partners_id_seq from anon, authenticated;
