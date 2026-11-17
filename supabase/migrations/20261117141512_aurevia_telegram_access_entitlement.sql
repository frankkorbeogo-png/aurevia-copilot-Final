-- Telegram is a separate entry point: enforce the same email, suspension and licence gate as the web app.
create or replace function public.aurevia_telegram_access_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_email_confirmed_at timestamptz;
  v_banned_until timestamptz;
  v_license jsonb;
begin
  if p_user_id is null then return jsonb_build_object('allowed',false,'code','USER_NOT_FOUND'); end if;
  select email_confirmed_at,banned_until into v_email_confirmed_at,v_banned_until
    from auth.users where id=p_user_id;
  if not found then return jsonb_build_object('allowed',false,'code','USER_NOT_FOUND'); end if;
  if v_email_confirmed_at is null then return jsonb_build_object('allowed',false,'code','EMAIL_NOT_VERIFIED'); end if;
  if v_banned_until is not null and v_banned_until>now() then
    return jsonb_build_object('allowed',false,'code','ACCOUNT_SUSPENDED');
  end if;
  if public.aurevia_is_admin(p_user_id) is true then
    return jsonb_build_object('allowed',true,'status','admin');
  end if;
  v_license:=public.aurevia_license_status(p_user_id);
  if coalesce((v_license->>'ok')::boolean,false) and v_license->>'status' in ('trial','licensed') then
    return jsonb_build_object('allowed',true,'status',v_license->>'status');
  end if;
  return jsonb_build_object('allowed',false,'code',coalesce(v_license->>'code',v_license->>'status','LICENSE_REQUIRED'));
end;
$$;
revoke all on function public.aurevia_telegram_access_status(uuid) from public,anon,authenticated;
grant execute on function public.aurevia_telegram_access_status(uuid) to service_role;
