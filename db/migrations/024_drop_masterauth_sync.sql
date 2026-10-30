-- The MasterAuth sheet sync is retired: this app is the only source for users and roles (Thunder and Scenic City).
drop trigger if exists users_queue_masterauth on users;
drop function if exists queue_masterauth();
drop table if exists masterauth_outbox;
delete from sync_status where name = 'masterauth-push';
