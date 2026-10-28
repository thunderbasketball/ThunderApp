-- Announcements: one-way posts from the Director to chosen users, roles, teams, or everyone.
-- Recipients are fixed when it's sent (one row each), so later team or role changes don't change who got it.
create table announcements (
  id          bigint generated always as identity primary key,
  title       text not null check (length(title) between 1 and 120),
  body        text not null check (length(body) between 1 and 4000),
  audience    text not null,             -- who it went to, in words ("Everyone", "Head Coaches · 4G Epps")
  sent_by     text not null,             -- name, shown to readers
  sent_by_id  text not null references users(coach_id),
  created_at  timestamptz not null default now()
);

create table announcement_recipients (
  announcement_id  bigint not null references announcements(id) on delete cascade,
  coach_id         text not null references users(coach_id) on delete cascade,
  read_at          timestamptz,           -- first time they opened their inbox with it in it
  emailed_at       timestamptz,           -- included in an unread summary email
  primary key (announcement_id, coach_id)
);
create index announcement_recipients_unread on announcement_recipients (coach_id) where read_at is null;

-- When each person last got an unread summary email (at most one every 8 hours).
create table notify_state (
  coach_id       text primary key references users(coach_id) on delete cascade,
  last_email_at  timestamptz
);

alter table announcements enable row level security;
revoke all on announcements from anon, authenticated;
alter table announcement_recipients enable row level security;
revoke all on announcement_recipients from anon, authenticated;
alter table notify_state enable row level security;
revoke all on notify_state from anon, authenticated;
