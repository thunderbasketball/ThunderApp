-- Quick event setup: the event types the Director picks from (and can add to).
create table event_types (
  name        text primary key check (length(name) between 1 and 40),
  created_by  text not null,
  created_at  timestamptz not null default now()
);
create unique index event_types_lower on event_types (lower(name));
insert into event_types (name, created_by) values ('Open Gym', 'setup'), ('Group Training', 'setup'), ('Open Run', 'setup'), ('Tryouts', 'setup');

-- The type an event was made from; its name is built from the type, gender and grades.
alter table events add column kind text;

-- Team rosters: registered players the Director puts on a team. Names are copied because registrations get replaced on every sync.
create table team_players (
  team_id        bigint not null references teams(id) on delete cascade,
  registrant_id  text not null,
  first_name     text not null,
  last_name      text not null,
  gender         text not null,
  grade          text not null,
  grade_sort     int not null,
  rostered_by    text not null,
  rostered_at    timestamptz not null,
  primary key (team_id, registrant_id)
);
create index team_players_registrant on team_players (registrant_id);

-- Attendance at a team's booked practice. No row = not checked (?).
create table practice_attendance (
  slot_id        bigint not null references slots(id) on delete cascade,
  team_id        bigint not null references teams(id) on delete cascade,
  registrant_id  text not null,
  status         text not null check (status in ('unknown', 'here', 'absent')),
  updated_by     text,
  updated_at     timestamptz,
  primary key (slot_id, team_id, registrant_id)
);

alter table event_types enable row level security;
revoke all on event_types from anon, authenticated;
alter table team_players enable row level security;
revoke all on team_players from anon, authenticated;
alter table practice_attendance enable row level security;
revoke all on practice_attendance from anon, authenticated;
