-- CourtCaptain organizations and per-organization roles (SPEC.md section 13, build step 1).
-- org_roles is filled from the users role columns and kept in step with them by a trigger,
-- so the app works as before; step 2 moves login and the sync onto org_roles.

create table organizations (
  slug        text primary key check (slug ~ '^[a-z0-9-]+$'),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- The roles each organization offers. Adding an organization or role is data, not code.
create table org_role_types (
  org   text not null references organizations(slug),
  role  text not null check (role in ('Request', 'Coach', 'Director', 'Partner', 'Solo')),
  primary key (org, role)
);

create table org_roles (
  coach_id    text not null references users(coach_id) on delete cascade,
  org         text not null,
  role        text not null,
  granted_by  text,
  granted_at  timestamptz not null default now(),
  primary key (coach_id, org, role),
  foreign key (org, role) references org_role_types(org, role)
);
create index org_roles_org_role on org_roles(org, role);

insert into organizations (slug, name) values ('thunder', 'Thunder Basketball'), ('scenic-city', 'Scenic City Basketball');
insert into org_role_types (org, role) values
  ('thunder', 'Request'), ('thunder', 'Coach'), ('thunder', 'Director'),
  ('scenic-city', 'Request'), ('scenic-city', 'Coach'), ('scenic-city', 'Director'),
  ('scenic-city', 'Partner'), ('scenic-city', 'Solo');

-- The roles a user's columns give them. ScenicCityAssociations (TRUE/FALSE text from the sheet) = Partner.
-- Solo has no column, so the trigger never touches it.
create function column_org_roles(u users) returns table (org text, role text) language sql immutable as $$
  select r.org, r.role from (values
    ('thunder', 'Request', u.thunder_request),
    ('thunder', 'Coach', u.thunder_coach),
    ('thunder', 'Director', u.thunder_director),
    ('scenic-city', 'Request', u.scenic_city_request),
    ('scenic-city', 'Coach', u.scenic_city_coach),
    ('scenic-city', 'Director', u.scenic_city_director),
    ('scenic-city', 'Partner', upper(btrim(coalesce(u.scenic_city_associations, ''))) = 'TRUE')
  ) as r(org, role, held) where held
$$;

insert into org_roles (coach_id, org, role, granted_by)
select u.coach_id, r.org, r.role, 'setup' from users u, column_org_roles(u) r;

create function sync_org_roles() returns trigger language plpgsql as $$
begin
  delete from org_roles o
  where o.coach_id = new.coach_id and o.role <> 'Solo'
    and (o.org, o.role) not in (select r.org, r.role from column_org_roles(new) r);
  insert into org_roles (coach_id, org, role, granted_by)
  select new.coach_id, r.org, r.role, new.updated_by from column_org_roles(new) r
  on conflict do nothing;
  return null;
end $$;

create trigger users_sync_org_roles after insert or update of
  thunder_request, thunder_coach, thunder_director,
  scenic_city_request, scenic_city_coach, scenic_city_director, scenic_city_associations
  on users for each row execute function sync_org_roles();

alter table organizations enable row level security;
alter table org_role_types enable row level security;
alter table org_roles enable row level security;
revoke all on organizations, org_role_types, org_roles from anon, authenticated;
revoke all on function column_org_roles(users), sync_org_roles() from public, anon, authenticated;
