-- AUREVIA COPILOT: administration sécurisée et indexation des clés étrangères.
-- Les fonctions de privilège sont exécutables uniquement par le rôle service_role.
create table if not exists app_private.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table app_private.admin_audit_log enable row level security;
revoke all on app_private.admin_audit_log from anon, authenticated, public;

create or replace function public.aurevia_is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private
as $$ select exists(select 1 from app_private.admin_users where user_id = p_user_id); $$;
revoke all on function public.aurevia_is_admin(uuid) from public, anon, authenticated;
grant execute on function public.aurevia_is_admin(uuid) to service_role;

create or replace function public.aurevia_bootstrap_admin(p_user_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare actual_email text;
begin
  if exists(select 1 from app_private.admin_users) then raise exception 'BOOTSTRAP_ALREADY_USED'; end if;
  select email into actual_email from auth.users where id = p_user_id;
  if actual_email is null or lower(actual_email) <> lower(trim(p_email)) then raise exception 'EMAIL_MISMATCH'; end if;
  insert into app_private.admin_users(user_id, granted_by) values (p_user_id, 'bootstrap') on conflict (user_id) do nothing;
  update public.profiles set role='admin', updated_at=now() where id=p_user_id;
  insert into app_private.admin_audit_log(actor_id, action, target_user_id, details) values (p_user_id,'bootstrap_admin',p_user_id,jsonb_build_object('email',lower(actual_email)));
  return jsonb_build_object('ok',true,'user_id',p_user_id);
end; $$;
revoke all on function public.aurevia_bootstrap_admin(uuid,text) from public, anon, authenticated;
grant execute on function public.aurevia_bootstrap_admin(uuid,text) to service_role;

create or replace function public.aurevia_admin_manage(p_actor_id uuid, p_target_user_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare admin_count integer;
begin
  if not exists(select 1 from app_private.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_action='grant_admin' then
    insert into app_private.admin_users(user_id,granted_by) values(p_target_user_id,p_actor_id::text) on conflict(user_id) do nothing;
    update public.profiles set role='admin',updated_at=now() where id=p_target_user_id;
  elsif p_action='revoke_admin' then
    select count(*) into admin_count from app_private.admin_users;
    if admin_count <= 1 and exists(select 1 from app_private.admin_users where user_id=p_target_user_id) then raise exception 'CANNOT_REMOVE_LAST_ADMIN'; end if;
    delete from app_private.admin_users where user_id=p_target_user_id;
    update public.profiles set role='user',updated_at=now() where id=p_target_user_id;
  else raise exception 'INVALID_ADMIN_ACTION'; end if;
  insert into app_private.admin_audit_log(actor_id,action,target_user_id,details) values(p_actor_id,p_action,p_target_user_id,coalesce(p_details,'{}'::jsonb));
  return jsonb_build_object('ok',true,'action',p_action,'target_user_id',p_target_user_id);
end; $$;
revoke all on function public.aurevia_admin_manage(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.aurevia_admin_manage(uuid,uuid,text,jsonb) to service_role;

create or replace function public.aurevia_admin_audit(p_actor_id uuid,p_action text,p_target_user_id uuid default null,p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $$
begin
 if not exists(select 1 from app_private.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
 insert into app_private.admin_audit_log(actor_id,action,target_user_id,details) values(p_actor_id,p_action,p_target_user_id,coalesce(p_details,'{}'::jsonb));
end; $$;
revoke all on function public.aurevia_admin_audit(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.aurevia_admin_audit(uuid,text,uuid,jsonb) to service_role;

create index if not exists trading_journal_group_id_idx on public.trading_journal(group_id);
create index if not exists trading_journal_position_id_idx on public.trading_journal(position_id);
create index if not exists trading_position_closes_user_id_idx on public.trading_position_closes(user_id);
create index if not exists trading_position_groups_user_id_idx on public.trading_position_groups(user_id);
create index if not exists trading_positions_journal_id_idx on public.trading_positions(journal_id);
create index if not exists admin_audit_log_created_at_idx on app_private.admin_audit_log(created_at desc);
