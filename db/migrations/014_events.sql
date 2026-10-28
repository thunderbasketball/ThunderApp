-- Events with player check-in (tryouts, evaluations, clinics).
-- The Director creates an event, picks which players should be there (by gender and grade) and who runs check-in.
create table events (
  id          bigint generated always as identity primary key,
  name        text not null check (length(name) between 1 and 80),
  starts_at   timestamptz not null,
  location    text check (length(location) <= 80),
  notes       text check (length(notes) <= 1000),
  genders     text[] not null,             -- 'Boys' / 'Girls'
  grades      text[] not null,             -- 'K', '1' … '12'
  created_by  text not null,
  created_at  timestamptz not null default now()
);

-- Who can open the check-in screen (besides the Director).
create table event_staff (
  event_id  bigint not null references events(id) on delete cascade,
  coach_id  text not null references users(coach_id) on delete cascade,
  added_by  text not null,
  primary key (event_id, coach_id)
);
create index event_staff_coach on event_staff (coach_id);

-- The players expected, copied from registrations when the list is made (registrations get replaced on every sync).
create table event_attendees (
  event_id       bigint not null references events(id) on delete cascade,
  registrant_id  text not null,
  first_name     text not null,
  last_name      text not null,
  gender         text not null,
  grade          text not null,
  grade_sort     int not null,
  status         text not null default 'unknown' check (status in ('unknown', 'here', 'absent')),
  updated_by     text,                     -- who last changed the status (name)
  updated_at     timestamptz,
  primary key (event_id, registrant_id)
);

alter table events enable row level security;
revoke all on events from anon, authenticated;
alter table event_staff enable row level security;
revoke all on event_staff from anon, authenticated;
alter table event_attendees enable row level security;
revoke all on event_attendees from anon, authenticated;
