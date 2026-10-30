-- Uniform number (and size, for players who ordered one) set by a team's staff for each rostered player.
-- Kept apart from registrations, which are replaced on every sheet sync.
create table team_uniforms (
  team_id        bigint not null references teams(id) on delete cascade,
  registrant_id  text not null,
  number         text check (number ~ '^\d{1,2}$'),
  size           text,
  updated_by     text not null,
  updated_at     timestamptz not null,
  primary key (team_id, registrant_id)
);

alter table team_uniforms enable row level security;
revoke all on team_uniforms from anon, authenticated;
