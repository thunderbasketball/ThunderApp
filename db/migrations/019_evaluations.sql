-- Player evaluations (SPEC.md section 5): one card per team per player. Each team sees only its own cards.
-- Names are copied because registrations get replaced on every sync. Blank fields = not rated yet.
create table evaluations (
  team_id        bigint not null references teams(id) on delete cascade,
  registrant_id  text not null,
  first_name     text not null,
  last_name      text not null,
  gender         text not null,
  grade          text not null,
  grade_sort     int not null,
  position       text check (position in ('Guard', 'Wing', 'Post')),
  height         text check (height in ('Short', 'Average', 'Tall')),
  speed          text check (speed in ('Slow', 'Average', 'Fast')),
  score          int check (score between 1 and 5),
  notes          text not null default '' check (length(notes) <= 1000),
  interested     boolean not null default false,
  updated_by     text not null,
  updated_at     timestamptz not null,
  primary key (team_id, registrant_id)
);
create index evaluations_registrant on evaluations (registrant_id);

alter table evaluations enable row level security;
revoke all on evaluations from anon, authenticated;
