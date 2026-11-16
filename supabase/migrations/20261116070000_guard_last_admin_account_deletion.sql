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
