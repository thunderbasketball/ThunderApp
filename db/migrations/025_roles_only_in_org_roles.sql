-- SPEC.md section 13, build step 2: org_roles is the only place roles live. The old role columns go away.

-- Does this person hold this role in this organization?
create function has_role(p_coach_id text, p_org text, p_role text) returns boolean language sql stable as $$
  select exists (select 1 from org_roles where coach_id = p_coach_id and org = p_org and role = p_role)
$$;

-- Grant (p_on) or remove a role. Granting one already held keeps who first granted it.
create function set_role(p_coach_id text, p_org text, p_role text, p_on boolean, p_by text) returns void language plpgsql as $$
begin
  if p_on then
    insert into org_roles (coach_id, org, role, granted_by) values (p_coach_id, p_org, p_role, p_by) on conflict do nothing;
  else
    delete from org_roles where coach_id = p_coach_id and org = p_org and role = p_role;
  end if;
end $$;

drop trigger users_sync_org_roles on users;
drop function sync_org_roles();
drop function column_org_roles(users);

alter table users
  drop column thunder_request,
  drop column thunder_coach,
  drop column thunder_director,
  drop column scenic_city_request,
  drop column scenic_city_coach,
  drop column scenic_city_director,
  drop column scenic_city_associations;

revoke all on function has_role(text, text, text), set_role(text, text, text, boolean, text) from public, anon, authenticated;
