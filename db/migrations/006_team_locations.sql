-- Gyms a team practices at (from the sheet's "Practice Locations"). Becomes a link to gyms in Phase 5.
alter table teams add column practice_locations text[] not null default '{}';
