-- A permanently blocked email must remain unable to access AUREVIA even if
-- an Auth deletion request fails after the block is written.
create or replace function public.aurevia_license_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions','pg_temp'
as $function$
declare
  v_access public.aurevia_account_access%rowtype;
  v_license public.aurevia_licenses%rowtype;
  v_claim public.aurevia_trial_claims%rowtype;
  v_email text;
  v_email_confirmed_at timestamptz;
  v_email_hash text;
  v_blocked_fingerprint text;
  v_now timestamptz:=now();
begin
  select email,email_confirmed_at into v_email,v_email_confirmed_at from auth.users where id=p_user_id;
  if p_user_id is null or not found then return jsonb_build_object('ok',false,'code','USER_NOT_FOUND'); end if;
  if nullif(btrim(v_email),'') is null or v_email_confirmed_at is null then return jsonb_build_object('ok',false,'code','EMAIL_NOT_VERIFIED'); end if;

  v_blocked_fingerprint:=app_private.aurevia_email_fingerprint(v_email);
  if exists(select 1 from app_private.aurevia_blocked_emails where email_fingerprint=v_blocked_fingerprint) then
    return jsonb_build_object('ok',false,'status','blocked','code','EMAIL_BLOCKED');
  end if;

  v_email_hash:=encode(extensions.digest(lower(btrim(v_email)),'sha256'),'hex');
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

  insert into public.aurevia_trial_claims(email_hash,first_user_id,trial_started_at,trial_expires_at)
  values(v_email_hash,p_user_id,v_now,v_now+interval '3 days') on conflict(email_hash) do nothing;
  select * into v_claim from public.aurevia_trial_claims where email_hash=v_email_hash for update;
  if not found then return jsonb_build_object('ok',false,'code','TRIAL_STATUS_UNAVAILABLE'); end if;

  if v_access.trial_started_at is distinct from v_claim.trial_started_at
     or v_access.trial_expires_at is distinct from v_claim.trial_expires_at
     or v_access.access_status not in ('trial','expired') then
    update public.aurevia_account_access set trial_started_at=v_claim.trial_started_at,trial_expires_at=v_claim.trial_expires_at,
      access_status=case when v_claim.trial_expires_at<=v_now then 'expired' else 'trial' end,updated_at=v_now
    where user_id=p_user_id returning * into v_access;
  end if;

  if v_claim.trial_expires_at<=v_now then
    if v_access.access_status<>'expired' then update public.aurevia_account_access set access_status='expired',updated_at=v_now where user_id=p_user_id; end if;
    if not exists(select 1 from public.aurevia_license_events where user_id=p_user_id and event_type='trial_expired' and details->>'email_hash'=v_email_hash) then
      insert into public.aurevia_license_events(user_id,event_type,details)
      values(p_user_id,'trial_expired',jsonb_build_object('trial_started_at',v_claim.trial_started_at,'trial_expires_at',v_claim.trial_expires_at,'reason','verified_email_trial_already_used','email_hash',v_email_hash));
    end if;
    return jsonb_build_object('ok',true,'status','expired','trial_started_at',v_claim.trial_started_at,'trial_expires_at',v_claim.trial_expires_at,'days_remaining',0);
  end if;
  return jsonb_build_object('ok',true,'status','trial','trial_started_at',v_claim.trial_started_at,'trial_expires_at',v_claim.trial_expires_at,
    'days_remaining',greatest(0,ceil(extract(epoch from (v_claim.trial_expires_at-v_now))/86400.0)::integer));
end;
$function$;

revoke all on function public.aurevia_license_status(uuid) from public,anon,authenticated;
grant execute on function public.aurevia_license_status(uuid) to service_role;
