-- Shared session revocation used by both self-service and administrator account deletion.
-- The Netlify function validates the caller and supplies the target user id; only
-- service_role may execute this SECURITY DEFINER function.
create or replace function public.aurevia_account_revoke_all_sessions(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $$
declare
  v_changed boolean := false;
begin
  update app_private.aurevia_user_sessions
  set session_id = null,
      session_created_at = now(),
      last_seen = null,
      user_agent = null,
      revoked_at = now(),
      updated_at = now()
  where user_id = p_user_id
    and (session_id is not null or revoked_at is null);
  v_changed := found;
  return v_changed;
end;
$$;
revoke all on function public.aurevia_account_revoke_all_sessions(uuid) from public, anon, authenticated;
grant execute on function public.aurevia_account_revoke_all_sessions(uuid) to service_role;
