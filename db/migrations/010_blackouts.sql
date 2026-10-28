-- Blacked-out dates (the sheet's BlackOuts tab). Slots in a blackout are marked blackout = true;
-- this list also makes newly added slots on those dates come in blocked.
create table blackouts (
  id              bigint generated always as identity primary key,
  day             date not null,
  gym_id          bigint references gyms(id) on delete cascade, -- null = all gyms
  minute_of_day   int check (minute_of_day between 0 and 1439),  -- null = all day; 18:00 = 1080
  reason          text,
  created_by      text not null,
  created_at      timestamptz not null default now()
);
create unique index blackouts_scope on blackouts(day, coalesce(gym_id, 0), coalesce(minute_of_day, -1));

alter table blackouts enable row level security;
revoke all on blackouts from anon, authenticated;
