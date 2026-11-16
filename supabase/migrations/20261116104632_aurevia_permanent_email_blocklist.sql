-- Permanent account deletion: retain only a keyed email fingerprint to block re-registration.
-- The HMAC secret is generated once and remains inside app_private; raw emails are never stored.
create table if not exists app_private.aurevia_email_fingerprint_secret (
  singleton boolean primary key default true check (singleton),
  secret bytea not null check (octet_length(secret)=32),
  created_at timestamptz not null default now()
);
revoke all on app_private.aurevia_email_fingerprint_secret from public, anon, authenticated, service_role;
insert into app_private.aurevia_email_fingerprint_secret(singleton,secret)
values(true,extensions.gen_random_bytes(32))
on conflict(singleton) do nothing;

create table if not exists app_private.aurevia_blocked_emails (
  email_fingerprint text primary key check (length(email_fingerprint)=64),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'admin_permanent_delete',
  reason text
);
alter table app_private.aurevia_blocked_emails enable row level security;
revoke all on app_private.aurevia_blocked_emails from public, anon, authenticated, service_role;

create or replace function app_private.aurevia_email_fingerprint(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, app_private, extensions
as $$
declare v_secret bytea; v_email text;
begin
  v_email := lower(btrim(coalesce(p_email,'')));
  if v_email = '' or position('@' in v_email) < 2 then return null; end if;
  select secret into v_secret from app_private.aurevia_email_fingerprint_secret where singleton=true;
  if v_secret is null then raise exception 'EMAIL_FINGERPRINT_SECRET_UNAVAILABLE'; end if;
  return encode(extensions.hmac(convert_to(v_email,'UTF8'),v_secret,'sha256'),'hex');
end;
$$;
revoke all on function app_private.aurevia_email_fingerprint(text) from public, anon, authenticated, service_role;

create or replace function public.aurevia_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_email text; v_fingerprint text;
begin
  v_email := lower(btrim(coalesce(event->'user'->>'email','')));
  if v_email = '' then return '{}'::jsonb; end if;
  v_fingerprint := app_private.aurevia_email_fingerprint(v_email);
  if exists(select 1 from app_private.aurevia_blocked_emails b where b.email_fingerprint=v_fingerprint) then
    return jsonb_build_object('error',jsonb_build_object(
      'http_code',403,
      'message','Cette adresse e-mail a été définitivement bloquée après une suppression administrative. Contactez le support AUREVIA si vous pensez qu’il s’agit d’une erreur.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.aurevia_before_user_created(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.aurevia_before_user_created(jsonb) to supabase_auth_admin;

create or replace function public.aurevia_admin_permanent_delete_block(p_actor_id uuid,p_target_user_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare v_email text; v_fingerprint text; v_inserted boolean:=false;
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
  select email into v_email from auth.users where id=p_target_user_id;
  if not found or nullif(btrim(v_email),'') is null then
    return jsonb_build_object('ok',false,'code','USER_NOT_FOUND');
  end if;
  v_fingerprint:=app_private.aurevia_email_fingerprint(v_email);
  insert into app_private.aurevia_blocked_emails(email_fingerprint,created_by,source,reason)
  values(v_fingerprint,p_actor_id,'admin_permanent_delete',left(nullif(btrim(p_reason),''),500))
  on conflict(email_fingerprint) do nothing;
  v_inserted:=found;
  insert into app_private.admin_audit_log(actor_id,action,target_user_id,details)
  values(p_actor_id,'permanent_delete_email_block',p_target_user_id,
    jsonb_build_object('email_blocked',true,'new_block',v_inserted,'email_fingerprint_suffix',right(v_fingerprint,8)));
  return jsonb_build_object('ok',true,'email_blocked',true,'new_block',v_inserted);
end;
$$;
revoke all on function public.aurevia_admin_permanent_delete_block(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.aurevia_admin_permanent_delete_block(uuid,uuid,text) to service_role;

create or replace function public.aurevia_admin_stats(p_actor_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, app_private, auth
as $$
begin
  if not exists(select 1 from app_private.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
  return jsonb_build_object(
    'profiles',(select count(*) from auth.users),
    'trading_journal',(select count(*) from public.trading_journal),
    'trading_position_groups',(select count(*) from public.trading_position_groups),
    'telegram_connections',(select count(*) from public.telegram_connections),
    'users_online',(select count(*) from app_private.aurevia_user_sessions where session_id is not null and revoked_at is null and last_seen>=now()-interval '90 seconds'),
    'active_sessions',(select count(*) from app_private.aurevia_user_sessions where session_id is not null and revoked_at is null and last_seen>=now()-interval '2 minutes'),
    'suspended',(select count(*) from auth.users where banned_until>now()),
    'blocked_emails',(select count(*) from app_private.aurevia_blocked_emails)
  );
end;
$$;
revoke all on function public.aurevia_admin_stats(uuid) from public, anon, authenticated;
grant execute on function public.aurevia_admin_stats(uuid) to service_role;
