create or replace function public.aurevia_admin_license_issue(
  p_actor_id uuid,p_key_hash text,p_key_prefix text,p_plan_code text,p_duration_days integer default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_license public.aurevia_licenses%rowtype;
begin
  if p_actor_id is null or public.aurevia_is_admin(p_user_id=>p_actor_id) is not true then return jsonb_build_object('ok',false,'code','ADMIN_REQUIRED'); end if;
  if p_key_hash is null or length(p_key_hash)<>64 or p_key_prefix is null or length(p_key_prefix)>16 then return jsonb_build_object('ok',false,'code','INVALID_KEY_MATERIAL'); end if;
  if p_plan_code is null or p_plan_code !~ '^[a-z0-9_-]{2,32}$' then return jsonb_build_object('ok',false,'code','INVALID_PLAN'); end if;
  if p_duration_days is not null and (p_duration_days<1 or p_duration_days>3650) then return jsonb_build_object('ok',false,'code','INVALID_DURATION'); end if;
  insert into public.aurevia_licenses(key_hash,key_prefix,plan_code,status,duration_days,max_active_sessions,created_by)
  values(p_key_hash,p_key_prefix,p_plan_code,'issued',p_duration_days,1,p_actor_id) returning * into v_license;
  insert into public.aurevia_license_events(license_id,event_type,details)
  values(v_license.id,'license_issued',jsonb_build_object('plan_code',p_plan_code,'duration_days',p_duration_days,'created_by',p_actor_id));
  return jsonb_build_object('ok',true,'license',jsonb_build_object('id',v_license.id,'key_prefix',v_license.key_prefix,'plan_code',v_license.plan_code,'status',v_license.status,'duration_days',v_license.duration_days,'created_at',v_license.created_at));
end;
$$;

create or replace function public.aurevia_admin_license_set_status(p_actor_id uuid,p_license_id uuid,p_status text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_license public.aurevia_licenses%rowtype; v_event text;
begin
  if p_actor_id is null or public.aurevia_is_admin(p_user_id=>p_actor_id) is not true then return jsonb_build_object('ok',false,'code','ADMIN_REQUIRED'); end if;
  if p_status not in ('suspended','revoked') then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;
  select * into v_license from public.aurevia_licenses where id=p_license_id for update;
  if not found then return jsonb_build_object('ok',false,'code','LICENSE_NOT_FOUND'); end if;
  if v_license.status in ('revoked','expired') then return jsonb_build_object('ok',false,'code','LICENSE_FINAL_STATE'); end if;
  update public.aurevia_licenses set status=p_status,updated_at=now() where id=p_license_id;
  v_event:=case when p_status='suspended' then 'license_suspended' else 'license_revoked' end;
  if v_license.assigned_user_id is not null then
    update public.aurevia_account_access set access_status=p_status,updated_at=now() where user_id=v_license.assigned_user_id;
    insert into public.aurevia_license_events(license_id,user_id,event_type,details) values(p_license_id,v_license.assigned_user_id,v_event,jsonb_build_object('admin_id',p_actor_id));
  else
    insert into public.aurevia_license_events(license_id,event_type,details) values(p_license_id,v_event,jsonb_build_object('admin_id',p_actor_id));
  end if;
  return jsonb_build_object('ok',true,'license_id',p_license_id,'status',p_status,'assigned_user_id',v_license.assigned_user_id);
end;
$$;
revoke all on function public.aurevia_admin_license_issue(uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.aurevia_admin_license_set_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.aurevia_admin_license_issue(uuid,text,text,text,integer) to service_role;
grant execute on function public.aurevia_admin_license_set_status(uuid,uuid,text) to service_role;
