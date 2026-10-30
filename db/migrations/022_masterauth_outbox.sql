-- Users waiting to be written to the MasterAuth sheet (SPEC.md section 7, App → Sheet).
-- A trigger queues every change to a user's sheet columns, so no code path can forget to.
-- pin_enc: a PIN the person just set, encrypted (MASTERAUTH_PIN_KEY), kept only until it's written to the sheet.
-- starter_pin: the app reset their PIN to the starter (1234), so the sheet gets 1234 too.
-- deleted: the user was deleted in the app; their row stays in the sheet with Thunder roles cleared.
create table masterauth_outbox (
  coach_id     text primary key,
  pin_enc      text,
  starter_pin  boolean not null default false,
  deleted      boolean not null default false,
  queued_at    timestamptz not null default clock_timestamp(),
  attempts     int not null default 0,
  next_try_at  timestamptz,
  last_error   text
);

create function queue_masterauth() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (old.first_name, old.last_name, old.cell, old.email, old.verified_email, old.pin_hash,
                           old.thunder_request, old.thunder_coach, old.thunder_director)
                          is not distinct from
                          (new.first_name, new.last_name, new.cell, new.email, new.verified_email, new.pin_hash,
                           new.thunder_request, new.thunder_coach, new.thunder_director) then
    return null;
  end if;
  insert into masterauth_outbox (coach_id, deleted, starter_pin, queued_at)
  values (case when tg_op = 'DELETE' then old.coach_id else new.coach_id end, tg_op = 'DELETE',
          tg_op = 'UPDATE' and old.pin_hash is not null and new.pin_hash is null, clock_timestamp())
  on conflict (coach_id) do update
    set deleted = excluded.deleted, queued_at = excluded.queued_at, attempts = 0, next_try_at = null, last_error = null,
        -- A new PIN hash without a plain PIN (e.g. a reset) replaces any PIN still waiting.
        pin_enc = case when tg_op = 'UPDATE' and old.pin_hash is distinct from new.pin_hash then null
                       else masterauth_outbox.pin_enc end,
        starter_pin = case when tg_op = 'UPDATE' and old.pin_hash is distinct from new.pin_hash then excluded.starter_pin
                           else masterauth_outbox.starter_pin end;
  return null;
end $$;

create trigger users_queue_masterauth after insert or update or delete on users
  for each row execute function queue_masterauth();

alter table masterauth_outbox enable row level security;
revoke all on masterauth_outbox from anon, authenticated;
revoke all on function queue_masterauth() from public, anon, authenticated;
