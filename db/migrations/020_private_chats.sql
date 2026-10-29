-- Chats started by one person (Directors still see them, but only members get unread counts and emails):
--   dm-<id>-<id>       two people (lower id first), one of them a Director
--   staff-<id>-<team>  a Director + that team's whole staff
--   heads-<id>         a Director + every Head Coach
alter table chat_messages drop constraint chat_messages_conv_check;
alter table chat_messages add constraint chat_messages_conv_check
  check (conv ~ '^(directors|everyone|coaches|team-\d{1,18}|teamcoaches-\d{1,18}|coach-\d{7}|event-\d{1,18}|dm-\d{7}-\d{7}|staff-\d{7}-\d{1,18}|heads-\d{7})$');
