-- Make permanent email blocking and session invalidation atomic.
create or replace function public.aurevia_admin_permanent_delete_block(p_actor_id uuid,p_target_user_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare v_email text; v_fingerprint text; v_inserted boolean:=false; v_session_revoked boolean:=false;
begin
  if p_actor_id is null or public.aurevia_is_admin(p_user_id=>p_actor_id) is not true then
    return jsonb_build_object('ok',false,'code','ADMIN_REQUIRED');
  end if;
  if p_target_user_id is null or p_target_user_id=p_actor_id then
    return jsonb_build_object('ok',false,'code','INVALID_TARGET');
  end if;
  if exists(select 1 from app_private.admin_users where user_id=p_target_user_id) then
    return jsonb_build_object('ok',false,'code','ADMIN_ACCOUNT_PROTECTED');
  end if;
  select email into v_email from auth.users where id=p_target_user_id for update;
  if not found or nullif(btrim(v_email),'') is null then
    return jsonb_build_object('ok',false,'code','USER_NOT_FOUND');
  end if;
  v_fingerprint:=app_private.aurevia_email_fingerprint(v_email);
  insert into app_private.aurevia_blocked_emails(email_fingerprint,created_by,source,reason)
  values(v_fingerprint,p_actor_id,'admin_permanent_delete',left(nullif(btrim(p_reason),''),500))
  on conflict(email_fingerprint) do nothing;
  v_inserted:=found;

  -- Revoke the active app session in the same transaction as the email block.
  update app_private.aurevia_user_sessions
  set session_id=null,session_created_at=now(),last_seen=null,user_agent=null,revoked_at=now(),updated_at=now()
  where user_id=p_target_user_id and (session_id is not null or revoked_at is null);
  v_session_revoked:=found;

  insert into app_private.admin_audit_log(actor_id,action,target_user_id,details)
  values(p_actor_id,'permanent_delete_email_block',p_target_user_id,
    jsonb_build_object('email_blocked',true,'new_block',v_inserted,'session_revoked',v_session_revoked,'email_fingerprint_suffix',right(v_fingerprint,8)));
  return jsonb_build_object('ok',true,'email_blocked',true,'new_block',v_inserted,'session_revoked',v_session_revoked);
end;
$$;
revoke all on function public.aurevia_admin_permanent_delete_block(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.aurevia_admin_permanent_delete_block(uuid,uuid,text) to service_role;
