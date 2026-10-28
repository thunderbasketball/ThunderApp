-- One row per automatic sync (e.g. 'registrations' from the Google Sheet):
-- when it last looked, when the data last changed, and whether the last try worked.
create table sync_status (
  name text primary key,
  checked_at timestamptz,
  changed_at timestamptz,
  source_hash text,
  ok boolean not null default true,
  message text
);

alter table sync_status enable row level security;
revoke all on sync_status from anon, authenticated;
