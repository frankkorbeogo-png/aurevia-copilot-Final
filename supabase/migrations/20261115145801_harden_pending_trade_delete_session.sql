-- Harden pending-trade deletion:
-- * execute with caller privileges so table RLS remains effective;
-- * explicitly require the current active AUREVIA session;
-- * preserve the existing atomic pending-only deletion semantics.
create or replace function public.aurevia_delete_pending_trade(
  p_group_id uuid,
  p_position_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_group public.trading_position_groups%rowtype;
  v_positions uuid[];
  v_count integer := 0;
  v_remaining integer := 0;
  v_deleted_group boolean := false;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if not public.aurevia_session_is_active() then
    raise exception 'Session AUREVIA inactive ou révoquée';
  end if;

  select * into v_group
  from public.trading_position_groups
  where id = p_group_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Position introuvable';
  end if;

  if (v_group.mode = 'unique' and p_position_id is not null)
     or (v_group.mode = 'separate' and p_position_id is null) then
    raise exception 'Mode de suppression invalide';
  end if;

  perform 1
  from public.trading_positions
  where group_id = p_group_id
    and user_id = v_user
    and (p_position_id is null or id = p_position_id)
  for update;

  select array_agg(id) into v_positions
  from public.trading_positions
  where group_id = p_group_id
    and user_id = v_user
    and (p_position_id is null or id = p_position_id)
    and status = 'PENDING'
    and abs(volume_remaining - volume_initial) <= 0.00000001;

  if coalesce(array_length(v_positions, 1), 0) = 0 then
    raise exception 'Seuls les trades encore en attente et sans clôture peuvent être supprimés';
  end if;

  if exists (
    select 1
    from public.trading_position_closes
    where user_id = v_user and position_id = any(v_positions)
  ) then
    raise exception 'Une clôture existe déjà pour ce trade';
  end if;

  if v_group.mode = 'unique' and exists (
    select 1
    from public.trading_positions
    where group_id = p_group_id
      and user_id = v_user
      and (status <> 'PENDING' or abs(volume_remaining - volume_initial) > 0.00000001)
  ) then
    raise exception 'Tous les trades de la position unique doivent être encore en attente';
  end if;

  if v_group.auto_journal then
    delete from public.trading_journal
    where user_id = v_user
      and group_id = p_group_id
      and (
        (v_group.mode = 'unique' and position_id is null)
        or (v_group.mode = 'separate' and position_id = any(v_positions))
      );
  end if;

  delete from public.trading_positions
  where user_id = v_user
    and group_id = p_group_id
    and id = any(v_positions);
  get diagnostics v_count = row_count;

  select count(*) into v_remaining
  from public.trading_positions
  where user_id = v_user and group_id = p_group_id;

  if v_remaining = 0 then
    delete from public.trading_position_groups
    where id = p_group_id and user_id = v_user;
    v_deleted_group := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'positions_deleted', v_count,
    'group_deleted', v_deleted_group
  );
end;
$$;

revoke all on function public.aurevia_delete_pending_trade(uuid, uuid) from public;
revoke all on function public.aurevia_delete_pending_trade(uuid, uuid) from anon;
grant execute on function public.aurevia_delete_pending_trade(uuid, uuid) to authenticated, service_role;
