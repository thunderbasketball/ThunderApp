-- Volunteer coaches without an app login get announcements by email right away; this counts them for the Sent list.
alter table announcements add column extra_emails int not null default 0;
