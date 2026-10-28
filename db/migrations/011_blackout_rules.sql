-- Yearly blackouts, e.g. "Nov 26 every year" or "4th Thursday of November + the day after".
-- Each rule is filled into the blackouts list year by year (blackouts.rule_id points back to it).
create table blackout_rules (
  id             bigint generated always as identity primary key,
  kind           text not null check (kind in ('date', 'nth', 'last')), -- fixed date / nth weekday / last weekday of the month
  month          int not null check (month between 1 and 12),
  day            int check (day between 1 and 31),                      -- kind = 'date'
  nth            int check (nth between 1 and 4),                       -- kind = 'nth'
  weekday        int check (weekday between 0 and 6),                   -- kind = 'nth' / 'last' (0 = Sunday)
  span_days      int not null default 1 check (span_days between 1 and 14),
  gym_id         bigint references gyms(id) on delete cascade,          -- null = all gyms
  minute_of_day  int check (minute_of_day between 0 and 1439),          -- null = all day
  reason         text,
  created_by     text not null,
  created_at     timestamptz not null default now()
);

alter table blackouts add column rule_id bigint references blackout_rules(id) on delete set null;

alter table blackout_rules enable row level security;
revoke all on blackout_rules from anon, authenticated;
