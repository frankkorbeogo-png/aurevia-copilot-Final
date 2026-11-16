alter table public.aurevia_license_events drop constraint aurevia_license_events_event_type_check;
alter table public.aurevia_license_events add constraint aurevia_license_events_event_type_check
check (event_type in ('trial_started','trial_expired','license_issued','license_activated','license_expired','license_suspended','license_revoked','license_reassigned','session_released'));

create or replace function public.aurevia_license_status(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_access public.aurevia_account_access%rowtype;
  v_license public.aurevia_licenses%rowtype;
  v_now timestamptz := now();
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then return jsonb_build_object('ok',false,'code','USER_NOT_FOUND'); end if;
  insert into public.aurevia_account_access(user_id,access_status) values(p_user_id,'trial') on conflict(user_id) do nothing;
  select * into v_access from public.aurevia_account_access where user_id=p_user_id for update;
  if v_access.license_id is not null then
    select * into v_license from public.aurevia_licenses where id=v_access.license_id for update;
    if not found then
      update public.aurevia_account_access set access_status='revoked',license_id=null,updated_at=v_now where user_id=p_user_id;
      return jsonb_build_object('ok',true,'status','revoked');
    end if;
    if v_license.status in ('suspended','revoked','expired') then
      update public.aurevia_account_access set access_status=v_license.status,updated_at=v_now where user_id=p_user_id;
      return jsonb_build_object('ok',true,'status',v_license.status,'expires_at',v_license.expires_at);
    end if;
    if v_license.expires_at is not null and v_license.expires_at<=v_now then
      update public.aurevia_licenses set status='expired',updated_at=v_now where id=v_license.id;
      update public.aurevia_account_access set access_status='expired',updated_at=v_now where user_id=p_user_id;
      insert into public.aurevia_license_events(license_id,user_id,event_type) values(v_license.id,p_user_id,'license_expired');
      return jsonb_build_object('ok',true,'status','expired','expires_at',v_license.expires_at);
    end if;
    update public.aurevia_account_access set access_status='licensed',updated_at=v_now where user_id=p_user_id;
    return jsonb_build_object('ok',true,'status','licensed','plan',v_license.plan_code,'expires_at',v_license.expires_at,'max_active_sessions',v_license.max_active_sessions);
  end if;
  if v_access.trial_started_at is null then
    update public.aurevia_account_access set trial_started_at=v_now,trial_expires_at=v_now+interval '3 days',access_status='trial',updated_at=v_now where user_id=p_user_id returning * into v_access;
    insert into public.aurevia_license_events(user_id,event_type,details) values(p_user_id,'trial_started',jsonb_build_object('duration_days',3));
  elsif v_access.trial_expires_at<=v_now then
    if v_access.access_status<>'expired' then
      update public.aurevia_account_access set access_status='expired',updated_at=v_now where user_id=p_user_id;
      insert into public.aurevia_license_events(user_id,event_type,details) values(p_user_id,'trial_expired',jsonb_build_object('trial_expires_at',v_access.trial_expires_at));
    end if;
    return jsonb_build_object('ok',true,'status','expired','trial_started_at',v_access.trial_started_at,'trial_expires_at',v_access.trial_expires_at);
  end if;
  return jsonb_build_object('ok',true,'status',v_access.access_status,'trial_started_at',v_access.trial_started_at,'trial_expires_at',v_access.trial_expires_at,
    'days_remaining',greatest(0,ceil(extract(epoch from (v_access.trial_expires_at-v_now))/86400.0)::integer));
end;
$$;
revoke all on function public.aurevia_license_status(uuid) from public,anon,authenticated;
grant execute on function public.aurevia_license_status(uuid) to service_role;
