-- Issue a complete license batch in one PostgreSQL transaction.
-- The API generates plaintext keys server-side and submits only hashes here.
create or replace function public.aurevia_admin_license_issue_batch(
  p_actor_id uuid,
  p_plan_code text,
  p_licenses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_item jsonb;
  v_license public.aurevia_licenses%rowtype;
  v_duration integer;
  v_hash text;
  v_prefix text;
  v_issued jsonb := '[]'::jsonb;
  v_count integer;
begin
  if p_actor_id is null or public.aurevia_is_admin(p_user_id => p_actor_id) is not true then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_REQUIRED');
  end if;
  if p_plan_code is null or p_plan_code !~ '^[a-z0-9_-]{2,32}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PLAN');
  end if;
  if jsonb_typeof(p_licenses) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LICENSE_BATCH');
  end if;
  v_count := jsonb_array_length(p_licenses);
  if v_count < 1 or v_count > 50 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LICENSE_BATCH_SIZE');
  end if;

  for v_item in select value from jsonb_array_elements(p_licenses)
  loop
    v_hash := v_item->>'key_hash';
    v_prefix := v_item->>'key_prefix';
    v_duration := nullif(v_item->>'duration_days', '')::integer;
    if v_hash is null or length(v_hash) <> 64
       or v_prefix is null or length(v_prefix) > 16
       or (v_duration is not null and (v_duration < 1 or v_duration > 3650)) then
      raise exception using errcode = '22023', message = 'INVALID_LICENSE_BATCH_ITEM';
    end if;

    insert into public.aurevia_licenses(
      key_hash, key_prefix, plan_code, status, duration_days, max_active_sessions, created_by
    ) values (
      v_hash, v_prefix, p_plan_code, 'issued', v_duration, 1, p_actor_id
    ) returning * into v_license;

    insert into public.aurevia_license_events(license_id, event_type, details)
    values (
      v_license.id, 'license_issued',
      jsonb_build_object('plan_code', p_plan_code, 'duration_days', v_duration, 'created_by', p_actor_id)
    );

    v_issued := v_issued || jsonb_build_array(jsonb_build_object(
      'id', v_license.id,
      'key_prefix', v_license.key_prefix,
      'plan_code', v_license.plan_code,
      'status', v_license.status,
      'duration_days', v_license.duration_days,
      'created_at', v_license.created_at
    ));
  end loop;

  return jsonb_build_object('ok', true, 'licenses', v_issued);
end;
$$;

revoke all on function public.aurevia_admin_license_issue_batch(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.aurevia_admin_license_issue_batch(uuid, text, jsonb) to service_role;

-- Keep a single profile/preferences creation trigger while preserving all
-- existing Google metadata fallbacks from both historical handlers.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    )
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_aurevia on auth.users;
