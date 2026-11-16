create index aurevia_account_access_license_id_idx on public.aurevia_account_access(license_id);
create index aurevia_license_events_license_id_idx on public.aurevia_license_events(license_id);
create index aurevia_licenses_created_by_idx on public.aurevia_licenses(created_by);

create or replace function public.aurevia_license_status(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_access public.aurevia_account_access%rowtype;
  v_license public.aurevia_licenses%rowtype;
  v_now timestamptz := now();
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    return jsonb_build_object('ok',false,'code','USER_NOT_FOUND');
  end if;
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
    update public.aurevia_account_access set trial_started_at=v_now,trial_expires_at=v_now+interval '3 days',access_status='trial',updated_at=v_now
    where user_id=p_user_id returning * into v_access;
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

create or replace function public.aurevia_license_activate(p_user_id uuid,p_key_hash text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_license public.aurevia_licenses%rowtype;
  v_now timestamptz := now();
  v_expiry timestamptz;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then return jsonb_build_object('ok',false,'code','USER_NOT_FOUND'); end if;
  if p_key_hash is null or length(p_key_hash)<>64 then return jsonb_build_object('ok',false,'code','INVALID_KEY'); end if;
  select * into v_license from public.aurevia_licenses where key_hash=p_key_hash for update;
  if not found then return jsonb_build_object('ok',false,'code','INVALID_KEY'); end if;
  if v_license.status='active' and v_license.assigned_user_id=p_user_id then
    if v_license.expires_at is not null and v_license.expires_at<=v_now then
      update public.aurevia_licenses set status='expired',updated_at=v_now where id=v_license.id;
      update public.aurevia_account_access set access_status='expired',updated_at=v_now where user_id=p_user_id;
      return jsonb_build_object('ok',false,'code','LICENSE_EXPIRED');
    end if;
    return jsonb_build_object('ok',true,'status','licensed','plan',v_license.plan_code,'expires_at',v_license.expires_at);
  end if;
  if v_license.status<>'issued' then
    return jsonb_build_object('ok',false,'code',case when v_license.status='expired' then 'LICENSE_EXPIRED' when v_license.status='suspended' then 'LICENSE_SUSPENDED' when v_license.status='revoked' then 'LICENSE_REVOKED' else 'LICENSE_UNAVAILABLE' end);
  end if;
  if v_license.starts_at is not null and v_license.starts_at>v_now then return jsonb_build_object('ok',false,'code','LICENSE_NOT_YET_VALID'); end if;
  v_expiry:=case when v_license.duration_days is null then null else v_now+make_interval(days=>v_license.duration_days) end;
  update public.aurevia_licenses set status='active',assigned_user_id=p_user_id,activated_at=v_now,starts_at=coalesce(starts_at,v_now),expires_at=v_expiry,updated_at=v_now where id=v_license.id;
  insert into public.aurevia_account_access(user_id,access_status,license_id) values(p_user_id,'licensed',v_license.id)
  on conflict(user_id) do update set access_status='licensed',license_id=excluded.license_id,updated_at=v_now;
  insert into public.aurevia_license_events(license_id,user_id,event_type,details) values(v_license.id,p_user_id,'license_activated',jsonb_build_object('plan',v_license.plan_code,'expires_at',v_expiry));
  return jsonb_build_object('ok',true,'status','licensed','plan',v_license.plan_code,'expires_at',v_expiry,'max_active_sessions',v_license.max_active_sessions);
end;
$$;

revoke all on function public.aurevia_license_status(uuid) from public,anon,authenticated;
revoke all on function public.aurevia_license_activate(uuid,text) from public,anon,authenticated;
grant execute on function public.aurevia_license_status(uuid) to service_role;
grant execute on function public.aurevia_license_activate(uuid,text) to service_role;
