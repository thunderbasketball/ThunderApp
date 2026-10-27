-- Tables live in Supabase's public schema so they show up in the dashboard.
-- Lock them: row level security on with no policies, and no grants to Supabase's API roles.
-- Only the app's server (direct database connection) can read or write.
-- Every new table needs the same two lines.

alter table users enable row level security;
alter table sessions enable row level security;
alter table email_codes enable row level security;
alter table pin_lockouts enable row level security;
alter table registrations enable row level security;
alter table schema_migrations enable row level security;

revoke all on users, sessions, email_codes, pin_lockouts, registrations, schema_migrations from anon, authenticated;
revoke all on sequence email_codes_id_seq from anon, authenticated;
