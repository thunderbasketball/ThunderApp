-- Event chats: event-<id> = the event's check-in people + Directors.
alter table chat_messages drop constraint chat_messages_conv_check;
alter table chat_messages add constraint chat_messages_conv_check
  check (conv ~ '^(directors|everyone|coaches|team-\d{1,18}|teamcoaches-\d{1,18}|coach-\d{7}|event-\d{1,18})$');
