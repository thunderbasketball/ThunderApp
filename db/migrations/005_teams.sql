-- Teams and their staff. Name format: top grade + gender letter + head coach's last name, e.g. "4G Epps".
create table teams (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  gender      text not null check (gender in ('Boys', 'Girls')),
  grades      text[] not null check (cardinality(grades) > 0),  -- 'K', '1' .. '12'
  grade_sort  int not null,                                    -- top grade, for sorting (K = 0)
  level       text not null check (level in ('REC', 'COMP')),
  created_at  timestamptz not null default now(),
  created_by  text not null
);

-- One person can hold different roles on different teams.
create table team_staff (
  team_id   bigint not null references teams(id) on delete cascade,
  coach_id  text not null references users(coach_id),
  role      text not null check (role in ('HeadCoach', 'AsstCoach', 'Manager', 'TeamParent')),
  added_at  timestamptz not null default now(),
  added_by  text not null,
  primary key (team_id, coach_id, role)
);
create unique index team_staff_one_head on team_staff(team_id) where role = 'HeadCoach';
create index team_staff_coach on team_staff(coach_id);

alter table teams enable row level security;
alter table team_staff enable row level security;
revoke all on teams, team_staff from anon, authenticated;
