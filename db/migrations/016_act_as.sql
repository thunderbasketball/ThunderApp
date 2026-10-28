-- Director "Act as": the session shows the app as another user sees it (view only). Cleared by Stop or logout.
alter table sessions add column acting_as text references users(coach_id) on delete set null;
