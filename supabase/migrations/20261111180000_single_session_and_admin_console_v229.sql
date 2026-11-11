-- AUREVIA COPILOT V2.2.9
-- Une seule session applicative active par compte, heartbeat et fonctions de console admin.
-- Cette migration est livrée dans le ZIP mais n'est PAS appliquée au projet de production.

create table if not exists app_private.aurevia_user_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid,
  session_created_at timestamptz not null default now(),
  last_seen timestamptz,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists aurevia_user_sessions_last_seen_idx
  on app_private.aurevia_user_sessions(last_seen desc) where session_id is not null;
alter table app_private.aurevia_user_sessions enable row level security;
revoke all on app_private.aurevia_user_sessions from public, anon, authenticated;

-- Enregistre la session la plus récente selon auth.sessions.created_at (et non le JWT iat,
-- qui change lors du rafraîchissement d'un ancien token).
create or replace function public.aurevia_session_touch(
  p_user_id uuid, p_session_id uuid, p_claim boolean default false, p_user_agent text default null
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, app_private, auth
as $$
declare v_created_at timestamptz; v_accepted boolean := false;
begin
  select s.created_at into v_created_at
  from auth.sessions s where s.id=p_session_id and s.user_id=p_user_id;
  if v_created_at is null then return false; end if;
  insert into app_private.aurevia_user_sessions(user_id,session_id,session_created_at,last_seen,user_agent,revoked_at,updated_at)
  values(p_user_id,p_session_id,v_created_at,now(),left(coalesce(p_user_agent,''),240),null,now())
  on conflict(user_id) do update set
    session_id=excluded.session_id,
    session_created_at=excluded.session_created_at,
    last_seen=now(),
    user_agent=excluded.user_agent,
    revoked_at=null,
    updated_at=now()
  where app_private.aurevia_user_sessions.session_id=excluded.session_id
     or (p_claim and excluded.session_created_at>=app_private.aurevia_user_sessions.session_created_at)
  returning true into v_accepted;
  return coalesce(v_accepted,false);
end; $$;
revoke all on function public.aurevia_session_touch(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.aurevia_session_touch(uuid,uuid,boolean,text) to service_role;

create or replace function public.aurevia_session_is_active_for_user(p_user_id uuid,p_session_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private
as $$
  select exists(
    select 1 from app_private.aurevia_user_sessions s
    where s.user_id=p_user_id and s.session_id=p_session_id and s.revoked_at is null
      and s.last_seen >= now()-interval '2 minutes'
  );
$$;
revoke all on function public.aurevia_session_is_active_for_user(uuid,uuid) from public, anon, authenticated;
grant execute on function public.aurevia_session_is_active_for_user(uuid,uuid) to service_role;

create or replace function public.aurevia_session_is_active()
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private, auth
as $$
  select public.aurevia_session_is_active_for_user(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
$$;
revoke all on function public.aurevia_session_is_active() from public, anon;
grant execute on function public.aurevia_session_is_active() to authenticated;

create or replace function public.aurevia_session_end(p_user_id uuid,p_session_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, app_private
as $$
declare v_changed boolean := false;
begin
  update app_private.aurevia_user_sessions
  set session_id=null,session_created_at=now(),last_seen=null,user_agent=null,revoked_at=now(),updated_at=now()
  where user_id=p_user_id and session_id=p_session_id;
  v_changed := found;
  return v_changed;
end; $$;
revoke all on function public.aurevia_session_end(uuid,uuid) from public, anon, authenticated;
grant execute on function public.aurevia_session_end(uuid,uuid) to service_role;

create or replace function public.aurevia_admin_user_list(
  p_actor_id uuid,p_search text default '',p_limit integer default 100,p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare
  v_search text := left(trim(coalesce(p_search,'')),120);
  v_limit integer := greatest(1,least(coalesce(p_limit,100),100));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_total bigint;
  v_users jsonb;
begin
  if not exists(select 1 from app_private.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
  with matched as (
    select u.id,u.email,u.created_at,u.last_sign_in_at,u.banned_until,u.email_confirmed_at,
      p.display_name,case when exists(select 1 from app_private.admin_users a where a.user_id=u.id) then 'admin' else 'user' end as role,s.last_seen,s.session_created_at,s.user_agent,
      (s.session_id is not null and s.revoked_at is null and s.last_seen>=now()-interval '90 seconds') as online,
      (s.session_id is not null and s.revoked_at is null and s.last_seen>=now()-interval '2 minutes') as session_active
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join app_private.aurevia_user_sessions s on s.user_id=u.id
    where v_search='' or coalesce(u.email,'') ilike '%'||v_search||'%' or coalesce(p.display_name,'') ilike '%'||v_search||'%'
  )
  select count(*) into v_total from matched;
  with matched as (
    select u.id,u.email,u.created_at,u.last_sign_in_at,u.banned_until,u.email_confirmed_at,
      p.display_name,case when exists(select 1 from app_private.admin_users a where a.user_id=u.id) then 'admin' else 'user' end as role,s.last_seen,s.session_created_at,s.user_agent,
      (s.session_id is not null and s.revoked_at is null and s.last_seen>=now()-interval '90 seconds') as online,
      (s.session_id is not null and s.revoked_at is null and s.last_seen>=now()-interval '2 minutes') as session_active
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join app_private.aurevia_user_sessions s on s.user_id=u.id
    where v_search='' or coalesce(u.email,'') ilike '%'||v_search||'%' or coalesce(p.display_name,'') ilike '%'||v_search||'%'
  )
  select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc),'[]'::jsonb) into v_users
  from (select * from matched order by created_at desc limit v_limit offset v_offset) page_row;
  return jsonb_build_object('users',coalesce(v_users,'[]'::jsonb),'total',v_total,'page',floor(v_offset::numeric/v_limit)+1,'per_page',v_limit,'has_more',v_total>v_offset+v_limit);
end; $$;
revoke all on function public.aurevia_admin_user_list(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.aurevia_admin_user_list(uuid,text,integer,integer) to service_role;

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
    'suspended',(select count(*) from auth.users where banned_until>now())
  );
end; $$;
revoke all on function public.aurevia_admin_stats(uuid) from public, anon, authenticated;
grant execute on function public.aurevia_admin_stats(uuid) to service_role;

create or replace function public.aurevia_admin_revoke_session(p_actor_id uuid,p_target_user_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, app_private
as $$
declare v_changed boolean := false;
begin
  if not exists(select 1 from app_private.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
  update app_private.aurevia_user_sessions
  set session_id=null,session_created_at=now(),last_seen=null,user_agent=null,revoked_at=now(),updated_at=now()
  where user_id=p_target_user_id and session_id is not null;
  v_changed := found;
  insert into app_private.admin_audit_log(actor_id,action,target_user_id,details)
  values(p_actor_id,'revoke_session',p_target_user_id,jsonb_build_object('revoked',v_changed));
  return v_changed;
end; $$;
revoke all on function public.aurevia_admin_revoke_session(uuid,uuid) from public, anon, authenticated;
grant execute on function public.aurevia_admin_revoke_session(uuid,uuid) to service_role;

-- Le heartbeat devient une condition d'accès à toutes les données personnelles existantes.
-- Les expressions originales des politiques sont conservées et simplement renforcées.
do $$
declare p record; v_sql text;
begin
  for p in
    select schemaname,tablename,policyname,qual,with_check
    from pg_policies
    where schemaname='public'
      and tablename = any(array['profiles','user_preferences','telegram_connections','trading_journal','trading_position_groups','trading_positions','trading_position_closes'])
  loop
    v_sql := format('ALTER POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
    if p.qual is not null then v_sql := v_sql || format(' USING ((%s) AND public.aurevia_session_is_active())',p.qual); end if;
    if p.with_check is not null then v_sql := v_sql || format(' WITH CHECK ((%s) AND public.aurevia_session_is_active())',p.with_check); end if;
    if p.qual is not null or p.with_check is not null then execute v_sql; end if;
  end loop;
end; $$;
