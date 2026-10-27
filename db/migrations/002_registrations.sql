-- Registered players from the TeamSnap CSV export. Each import replaces the whole table.
-- Useful fields get their own columns; raw keeps every column of the original row.

create table registrations (
  registrant_id        text primary key,          -- one per child (siblings share registration_id)
  registration_id      text not null,
  first_name           text not null,
  last_name            text not null,
  birthdate            date,                       -- corrected: TeamSnap exports midnight UTC as the evening before
  gender               text not null check (gender in ('Boys', 'Girls')),
  grade                text not null,              -- 'K', '1' … '12'
  grade_sort           int not null,               -- K = 0
  program              text not null,              -- as registered, e.g. '4th Girls'
  roster_status        text,
  parent1_first        text,
  parent1_last         text,
  parent1_email        text,
  parent1_cell         text,
  parent2_first        text,
  parent2_last         text,
  parent2_email        text,
  parent2_cell         text,
  address              text,
  city                 text,
  state                text,
  zip                  text,
  coach_request        text,
  coaching_interest    text,                       -- 'Head Coach', 'Assistant Coach', or null
  uniform_needed       boolean,
  uniform_size         text,
  uniform_number       text,
  checkout_type        text,
  checkout_detail      text,
  total_fees           numeric(10, 2),
  amount_paid          numeric(10, 2),
  amount_remaining     numeric(10, 2),
  notes                text[] not null default '{}',
  registered_at        timestamptz,
  raw                  jsonb not null,
  imported_at          timestamptz not null,
  imported_by          text not null
);

create index registrations_group on registrations (gender, grade_sort, lower(last_name), lower(first_name));
