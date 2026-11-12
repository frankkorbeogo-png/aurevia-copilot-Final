-- OAuth can return a valid Supabase JWT before the auth.sessions row is visible
-- to the application claim RPC. Use the verified JWT session_id as the key and
-- fall back to a first-claim timestamp; heartbeats still require the exact
-- session to already exist in the private AUREVIA session registry.
CREATE OR REPLACE FUNCTION public.aurevia_session_touch(
  p_user_id uuid,
  p_session_id uuid,
  p_claim boolean DEFAULT false,
  p_user_agent text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app_private', 'auth'
AS $function$
declare
  v_created_at timestamptz;
  v_accepted boolean := false;
begin
  select s.created_at into v_created_at
  from auth.sessions s
  where s.id = p_session_id and s.user_id = p_user_id;

  if v_created_at is null then
    select s.session_created_at into v_created_at
    from app_private.aurevia_user_sessions s
    where s.user_id = p_user_id
      and s.session_id = p_session_id
      and s.revoked_at is null;
  end if;

  if v_created_at is null then
    if not p_claim then
      return false;
    end if;
    v_created_at := now();
  end if;

  insert into app_private.aurevia_user_sessions(
    user_id, session_id, session_created_at, last_seen,
    user_agent, revoked_at, updated_at
  ) values (
    p_user_id, p_session_id, v_created_at, now(),
    left(coalesce(p_user_agent, ''), 240), null, now()
  )
  on conflict(user_id) do update set
    session_id = excluded.session_id,
    session_created_at = case
      when app_private.aurevia_user_sessions.session_id = excluded.session_id
        then app_private.aurevia_user_sessions.session_created_at
      else excluded.session_created_at
    end,
    last_seen = now(),
    user_agent = excluded.user_agent,
    revoked_at = null,
    updated_at = now()
  where app_private.aurevia_user_sessions.session_id = excluded.session_id
     or (p_claim and excluded.session_created_at >= app_private.aurevia_user_sessions.session_created_at)
  returning true into v_accepted;

  return coalesce(v_accepted, false);
end;
$function$;
