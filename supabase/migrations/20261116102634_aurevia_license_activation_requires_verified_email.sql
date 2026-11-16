create or replace function public.aurevia_license_activate(p_user_id uuid,p_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_access public.aurevia_account_access%rowtype;
  v_license public.aurevia_licenses%rowtype;
  v_previous public.aurevia_licenses%rowtype;
  v_email_confirmed_at timestamptz;
  v_now timestamptz := now();
  v_base_expiry timestamptz := now();
  v_expiry timestamptz;
begin
  select email_confirmed_at into v_email_confirmed_at from auth.users where id=p_user_id;
  if p_user_id is null or not found then return jsonb_build_object('ok',false,'code','USER_NOT_FOUND'); end if;
  if v_email_confirmed_at is null then return jsonb_build_object('ok',false,'code','EMAIL_NOT_VERIFIED'); end if;
  if p_key_hash is null or length(p_key_hash)<>64 then return jsonb_build_object('ok',false,'code','INVALID_KEY'); end if;
  insert into public.aurevia_account_access(user_id,access_status) values(p_user_id,'trial') on conflict(user_id) do nothing;
  select * into v_access from public.aurevia_account_access where user_id=p_user_id for update;
  select * into v_license from public.aurevia_licenses where key_hash=p_key_hash for update;
  if not found then return jsonb_build_object('ok',false,'code','INVALID_KEY'); end if;
  if v_license.status='active' and v_license.assigned_user_id=p_user_id then
    if v_license.expires_at is not null and v_license.expires_at<=v_now then
      update public.aurevia_licenses set status='expired',updated_at=v_now where id=v_license.id;
      update public.aurevia_account_access set access_status='expired',updated_at=v_now where user_id=p_user_id;
      insert into public.aurevia_license_events(license_id,user_id,event_type) values(v_license.id,p_user_id,'license_expired');
      return jsonb_build_object('ok',false,'code','LICENSE_EXPIRED');
    end if;
    return jsonb_build_object('ok',true,'status','licensed','plan',v_license.plan_code,'expires_at',v_license.expires_at);
  end if;
  if v_license.status<>'issued' then
    return jsonb_build_object('ok',false,'code',case when v_license.status='expired' then 'LICENSE_EXPIRED' when v_license.status='suspended' then 'LICENSE_SUSPENDED' when v_license.status='revoked' then 'LICENSE_REVOKED' else 'LICENSE_UNAVAILABLE' end);
  end if;
  if v_license.starts_at is not null and v_license.starts_at>v_now then return jsonb_build_object('ok',false,'code','LICENSE_NOT_YET_VALID'); end if;
  if v_access.license_id is not null then
    select * into v_previous from public.aurevia_licenses where id=v_access.license_id for update;
    if found and v_previous.status='active' and (v_previous.expires_at is null or v_previous.expires_at>v_now) then v_base_expiry:=coalesce(v_previous.expires_at,v_now); end if;
    if found and v_previous.id<>v_license.id then
      update public.aurevia_licenses set status=case when v_previous.expires_at is not null and v_previous.expires_at<=v_now then 'expired' else 'revoked' end,assigned_user_id=null,updated_at=v_now where id=v_previous.id;
      insert into public.aurevia_license_events(license_id,user_id,event_type,details)
      values(v_previous.id,p_user_id,case when v_previous.expires_at is not null and v_previous.expires_at<=v_now then 'license_expired' else 'license_reassigned' end,jsonb_build_object('replaced_by_license_id',v_license.id));
    end if;
  end if;
  v_expiry:=case when v_license.duration_days is null or (v_previous.id is not null and v_previous.status='active' and v_previous.expires_at is null) then null else v_base_expiry+make_interval(days=>v_license.duration_days) end;
  update public.aurevia_licenses set status='active',assigned_user_id=p_user_id,activated_at=v_now,starts_at=coalesce(starts_at,v_now),expires_at=v_expiry,updated_at=v_now where id=v_license.id;
  update public.aurevia_account_access set access_status='licensed',license_id=v_license.id,updated_at=v_now where user_id=p_user_id;
  insert into public.aurevia_license_events(license_id,user_id,event_type,details)
  values(v_license.id,p_user_id,'license_activated',jsonb_build_object('plan',v_license.plan_code,'expires_at',v_expiry,'previous_expiry_preserved',v_base_expiry>v_now));
  return jsonb_build_object('ok',true,'status','licensed','plan',v_license.plan_code,'expires_at',v_expiry,'max_active_sessions',v_license.max_active_sessions);
end;
$$;
revoke all on function public.aurevia_license_activate(uuid,text) from public,anon,authenticated;
grant execute on function public.aurevia_license_activate(uuid,text) to service_role;
