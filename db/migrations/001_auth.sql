-- Users, sessions, email codes, PIN lockouts.
-- Runs with search_path set to the app schema (see scripts/migrate.ts), so no schema prefixes here.

create table users (
  coach_id                  text primary key check (coach_id ~ '^\d{7}$'),
  first_name                text not null,
  last_name                 text not null,
  active                    boolean not null default true,
  pin_hash                  text,               -- null or the hash of 1234 = starter PIN
  cell                      text not null unique check (cell ~ '^\d{10}$'),
  email                     text,
  verified_email            text,
  thunder_request           boolean not null default false,
  thunder_coach             boolean not null default false,
  thunder_director          boolean not null default false,
  -- Scenic City columns: kept in step with MasterAuth, never written by this app.
  scenic_city_request       boolean not null default false,
  scenic_city_coach         boolean not null default false,
  scenic_city_director      boolean not null default false,
  scenic_city_associations  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- The browser holds a random token; we store only its SHA-256.
create table sessions (
  token_hash  text primary key,
  coach_id    text not null references users(coach_id) on delete cascade,
  created_at  timestamptz not null,
  expires_at  timestamptz not null
);
create index sessions_coach_id on sessions(coach_id);

-- 6-digit email codes. payload holds what gets saved once the code checks out.
create table email_codes (
  id          bigserial primary key,
  cell        text not null,
  purpose     text not null check (purpose in ('signup', 'starter', 'verify', 'reset')),
  email       text not null,
  code_hash   text not null,
  payload     jsonb not null default '{}',
  attempts    int not null default 0,
  created_at  timestamptz not null,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index email_codes_cell_created on email_codes(cell, created_at);

-- Wrong-PIN counter per cell number.
create table pin_lockouts (
  cell          text primary key,
  failed_count  int not null default 0,
  locked_until  timestamptz
);
