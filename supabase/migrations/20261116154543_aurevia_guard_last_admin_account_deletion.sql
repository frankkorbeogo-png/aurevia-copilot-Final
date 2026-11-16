-- Protect the final AUREVIA administrator during self-service account deletion.
-- The admin-count check, application-data purge and Auth deletion are one transaction.
-- A transaction-scoped advisory lock serializes concurrent account deletions.
create or replace function public.aurevia_account_delete_guarded(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare
  v_is_admin boolean := false;
  v_admin_count integer := 0;
  v_deleted integer := 0;
begin
  if p_user_id is null then
    raise exception using errcode = '22004', message = 'USER_ID_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aurevia:last-admin-protection', 0));

  select exists(
    select 1 from app_private.admin_users where user_id = p_user_id
  ) into v_is_admin;

  if v_is_admin then
    select count(*) into v_admin_count from app_private.admin_users;
    if v_admin_count <= 1 then
      raise exception using
        errcode = 'P0001',
        message = 'LAST_ADMIN_PROTECTED',
        detail = 'Le dernier administrateur ne peut pas supprimer son propre compte.';
    end if;
  end if;

  -- Revoke the active AUREVIA session and remove all user-owned application data.
  delete from public.announcement_reads where user_id = p_user_id;
  delete from public.announcement_recipients where user_id = p_user_id;
  delete from public.aurevia_trade_alert_events where user_id = p_user_id;
  delete from public.aurevia_analysis_scenarios where user_id = p_user_id;
  delete from public.telegram_connections where user_id = p_user_id;
  delete from public.user_preferences where user_id = p_user_id;
  delete from public.trading_position_closes where user_id = p_user_id;
  delete from public.trading_positions where user_id = p_user_id;
  delete from public.trading_position_groups where user_id = p_user_id;
  delete from public.trading_journal where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
  delete from app_private.aurevia_user_sessions where user_id = p_user_id;

  delete from auth.users where id = p_user_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception using errcode = 'P0002', message = 'AUTH_USER_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'was_admin', v_is_admin,
    'remaining_admins', case when v_is_admin then v_admin_count - 1 else v_admin_count end,
    'application_data_deleted', true
  );
end;
$$;

revoke all on function public.aurevia_account_delete_guarded(uuid) from public, anon, authenticated;
grant execute on function public.aurevia_account_delete_guarded(uuid) to service_role;


-- Serialize every administrative-role mutation against account deletion.
create or replace function public.aurevia_bootstrap_admin(p_user_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare actual_email text;
begin
  perform pg_advisory_xact_lock(hashtextextended('aurevia:last-admin-protection', 0));
  if exists(select 1 from app_private.admin_users) then raise exception 'BOOTSTRAP_ALREADY_USED'; end if;
  select email into actual_email from auth.users where id = p_user_id;
  if actual_email is null or lower(actual_email) <> lower(trim(p_email)) then raise exception 'EMAIL_MISMATCH'; end if;
  insert into app_private.admin_users(user_id, granted_by) values (p_user_id, 'bootstrap') on conflict (user_id) do nothing;
  update public.profiles set role='admin', updated_at=now() where id=p_user_id;
  insert into app_private.admin_audit_log(actor_id, action, target_user_id, details) values (p_user_id,'bootstrap_admin',p_user_id,jsonb_build_object('email',lower(actual_email)));
  return jsonb_build_object('ok',true,'user_id',p_user_id);
end;
$$;
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
  perform pg_advisory_xact_lock(hashtextextended('aurevia:last-admin-protection', 0));
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
end;
$$;
revoke all on function public.aurevia_admin_manage(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.aurevia_admin_manage(uuid,uuid,text,jsonb) to service_role;
