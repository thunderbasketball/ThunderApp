-- Each team has at most one person in each role (one Head Coach, one Assistant Coach, one Manager, one Team Parent).
drop index team_staff_one_head;
create unique index team_staff_one_per_role on team_staff(team_id, role);
