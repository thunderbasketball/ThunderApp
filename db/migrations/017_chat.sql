-- Chat (SPEC.md section 11). Each conversation is a fixed key, so its members always follow the current roles:
--   directors · everyone (Directors + all coaches) · coaches · team-<id> · teamcoaches-<id> · coach-<coachId>
create table chat_messages (
  id           bigint generated always as identity primary key,
  conv         text not null check (conv ~ '^(directors|everyone|coaches|team-\d{1,18}|teamcoaches-\d{1,18}|coach-\d{7})$'),
  sender_id    text not null references users(coach_id) on delete cascade,
  sender_name  text not null,
  body         text not null check (length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index chat_messages_conv on chat_messages (conv, id);

-- How far each person has read each chat, and how far it's been covered by an unread-summary email.
create table chat_reads (
  conv            text not null,
  coach_id        text not null references users(coach_id) on delete cascade,
  last_read_at    timestamptz,
  emailed_until   timestamptz,
  primary key (conv, coach_id)
);

alter table notify_state add column last_chat_email_at timestamptz;

alter table chat_messages enable row level security;
revoke all on chat_messages from anon, authenticated;
alter table chat_reads enable row level security;
revoke all on chat_reads from anon, authenticated;
