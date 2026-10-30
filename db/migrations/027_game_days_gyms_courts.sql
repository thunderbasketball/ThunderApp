-- Scenic City game days, and each partner's gyms and courts (SPEC.md section 13, build step 5a).

-- Dates Scenic City plays games. Hosting partners give their courts' open hours on these days (5b).
create table game_days (
  id          bigserial primary key,
  day         date not null unique,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create table partner_gyms (
  id          bigserial primary key,
  partner_id  bigint not null references partners(id) on delete cascade,
  name        text not null,
  address     text,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
create unique index partner_gyms_name on partner_gyms (partner_id, lower(name));

create table partner_courts (
  id          bigserial primary key,
  gym_id      bigint not null references partner_gyms(id) on delete cascade,
  name        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now()
);
create unique index partner_courts_name on partner_courts (gym_id, lower(name));

alter table game_days enable row level security;
alter table partner_gyms enable row level security;
alter table partner_courts enable row level security;
revoke all on game_days, partner_gyms, partner_courts from anon, authenticated;
revoke all on sequence game_days_id_seq, partner_gyms_id_seq, partner_courts_id_seq from anon, authenticated;
