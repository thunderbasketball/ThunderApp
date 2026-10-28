-- Gyms, courts and 60-minute practice slots.
-- A slot is found by Gym + Court + Time (unique), never by position.
create table gyms (
  id      bigint generated always as identity primary key,
  name    text not null unique,
  active  boolean not null default true
);

create table courts (
  id      bigint generated always as identity primary key,
  gym_id  bigint not null references gyms(id) on delete cascade,
  name    text not null,
  active  boolean not null default true,
  unique (gym_id, name)
);

-- Available = no team and not blacked out. A blackout doesn't count toward any team's limits.
create table slots (
  id          bigint generated always as identity primary key,
  court_id    bigint not null references courts(id) on delete cascade,
  starts_at   timestamptz not null,
  team_id     bigint references teams(id) on delete set null,
  blackout    boolean not null default false,
  note        text,                      -- e.g. "Thanksgiving" on a blackout
  booked_by   text,                      -- who booked or blacked it out (name, from the session)
  booked_at   timestamptz,
  created_at  timestamptz not null default now(),
  created_by  text not null,
  unique (court_id, starts_at),
  check (not (blackout and team_id is not null))
);
create index slots_starts on slots(starts_at);
create index slots_team on slots(team_id, starts_at) where team_id is not null;

alter table gyms enable row level security;
alter table courts enable row level security;
alter table slots enable row level security;
revoke all on gyms, courts, slots from anon, authenticated;
