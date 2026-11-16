-- AUREVIA: opérations de retrait du suivi et du journal en transactions uniques.
-- Les fiches journal restent conservées lors du retrait du suivi (FK SET NULL).
create or replace function public.aurevia_delete_closed_trade_position(
  p_group_id uuid,
  p_position_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_group public.trading_position_groups%rowtype;
  v_position public.trading_positions%rowtype;
  v_remaining integer;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.aurevia_session_is_active() then raise exception 'AUREVIA_SESSION_REQUIRED'; end if;
  if p_group_id is null or p_position_id is null then raise exception 'INVALID_TRADE_REFERENCE'; end if;

  select * into v_group from public.trading_position_groups
  where id=p_group_id and user_id=v_user for update;
  if not found then raise exception 'TRADE_GROUP_NOT_FOUND'; end if;

  select * into v_position from public.trading_positions
  where id=p_position_id and group_id=p_group_id and user_id=v_user for update;
  if not found then raise exception 'TRADE_POSITION_NOT_FOUND'; end if;
  if v_position.status<>'CLOSED' or v_position.volume_remaining>0.00000001 then
    raise exception 'TRADE_NOT_FULLY_CLOSED';
  end if;
  if not exists(select 1 from public.trading_position_closes
    where position_id=p_position_id and user_id=v_user) then
    raise exception 'TRADE_CLOSE_RECORD_REQUIRED';
  end if;

  select count(*) into v_remaining from public.trading_positions
  where group_id=p_group_id and user_id=v_user;
  if v_remaining=1 then
    delete from public.trading_position_groups where id=p_group_id and user_id=v_user and status='CLOSED';
    if not found then raise exception 'TRADE_GROUP_STATE_CHANGED'; end if;
    return jsonb_build_object('ok',true,'group_deleted',true,'position_deleted',true,'journal_preserved',true);
  end if;

  delete from public.trading_positions
  where id=p_position_id and group_id=p_group_id and user_id=v_user;
  if not found then raise exception 'TRADE_POSITION_STATE_CHANGED'; end if;
  return jsonb_build_object('ok',true,'group_deleted',false,'position_deleted',true,'journal_preserved',true);
end;
$$;

create or replace function public.aurevia_delete_open_trade_group(
  p_group_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_group public.trading_position_groups%rowtype;
  v_count integer;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.aurevia_session_is_active() then raise exception 'AUREVIA_SESSION_REQUIRED'; end if;
  if p_group_id is null then raise exception 'INVALID_TRADE_GROUP'; end if;

  select * into v_group from public.trading_position_groups
  where id=p_group_id and user_id=v_user for update;
  if not found then raise exception 'TRADE_GROUP_NOT_FOUND'; end if;
  if v_group.mode<>'unique' or v_group.status<>'OPEN' then
    raise exception 'OPEN_UNIQUE_GROUP_REQUIRED';
  end if;

  select count(*) into v_count from public.trading_positions
  where group_id=p_group_id and user_id=v_user;
  if v_count=0 then raise exception 'TRADE_POSITIONS_NOT_FOUND'; end if;

  if exists(select 1 from public.trading_positions p
    where p.group_id=p_group_id and p.user_id=v_user
      and (p.status not in ('OPEN','PENDING') or p.volume_remaining<>p.volume_initial)) then
    raise exception 'TRADE_GROUP_ALREADY_MODIFIED';
  end if;
  if exists(select 1 from public.trading_position_closes c
    where c.user_id=v_user and c.position_id in (
      select p.id from public.trading_positions p where p.group_id=p_group_id and p.user_id=v_user
    )) then raise exception 'TRADE_GROUP_HAS_CLOSES'; end if;

  delete from public.trading_position_groups where id=p_group_id and user_id=v_user and status='OPEN';
  if not found then raise exception 'TRADE_GROUP_STATE_CHANGED'; end if;
  return jsonb_build_object('ok',true,'positions_deleted',v_count,'journal_preserved',true);
end;
$$;

create or replace function public.aurevia_delete_closed_trade_group(
  p_group_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_group public.trading_position_groups%rowtype;
  v_count integer;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.aurevia_session_is_active() then raise exception 'AUREVIA_SESSION_REQUIRED'; end if;
  if p_group_id is null then raise exception 'INVALID_TRADE_GROUP'; end if;

  select * into v_group from public.trading_position_groups
  where id=p_group_id and user_id=v_user for update;
  if not found then raise exception 'TRADE_GROUP_NOT_FOUND'; end if;
  if v_group.status<>'CLOSED' then raise exception 'TRADE_GROUP_NOT_CLOSED'; end if;

  select count(*) into v_count from public.trading_positions
  where group_id=p_group_id and user_id=v_user;
  if v_count=0 then raise exception 'TRADE_POSITIONS_NOT_FOUND'; end if;

  if exists(select 1 from public.trading_positions p
    where p.group_id=p_group_id and p.user_id=v_user
      and (p.status<>'CLOSED' or p.volume_remaining>0.00000001)) then
    raise exception 'TRADE_GROUP_NOT_FULLY_CLOSED';
  end if;
  if exists(select 1 from public.trading_positions p
    where p.group_id=p_group_id and p.user_id=v_user
      and not exists(select 1 from public.trading_position_closes c
        where c.position_id=p.id and c.user_id=v_user)) then
    raise exception 'TRADE_CLOSE_RECORD_REQUIRED';
  end if;

  delete from public.trading_position_groups where id=p_group_id and user_id=v_user and status='CLOSED';
  if not found then raise exception 'TRADE_GROUP_STATE_CHANGED'; end if;
  return jsonb_build_object('ok',true,'positions_deleted',v_count,'journal_preserved',true);
end;
$$;

create or replace function public.aurevia_delete_linked_journal_entry(
  p_journal_id uuid,
  p_group_id uuid default null,
  p_position_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.aurevia_session_is_active() then raise exception 'AUREVIA_SESSION_REQUIRED'; end if;
  if p_journal_id is null and p_group_id is null then raise exception 'INVALID_JOURNAL_REFERENCE'; end if;

  if p_journal_id is not null then
    delete from public.trading_journal where id=p_journal_id and user_id=v_user;
    get diagnostics v_deleted=row_count;
  end if;
  if v_deleted=0 and p_group_id is not null then
    delete from public.trading_journal
    where user_id=v_user and group_id=p_group_id
      and ((p_position_id is null and position_id is null) or position_id=p_position_id);
    get diagnostics v_deleted=row_count;
  end if;
  if v_deleted=0 then raise exception 'JOURNAL_ENTRY_NOT_FOUND'; end if;
  return jsonb_build_object('ok',true,'deleted',v_deleted);
end;
$$;

revoke all on function public.aurevia_delete_closed_trade_position(uuid,uuid) from public,anon;
revoke all on function public.aurevia_delete_open_trade_group(uuid) from public,anon;
revoke all on function public.aurevia_delete_closed_trade_group(uuid) from public,anon;
revoke all on function public.aurevia_delete_linked_journal_entry(uuid,uuid,uuid) from public,anon;
grant execute on function public.aurevia_delete_closed_trade_position(uuid,uuid) to authenticated;
grant execute on function public.aurevia_delete_open_trade_group(uuid) to authenticated;
grant execute on function public.aurevia_delete_closed_trade_group(uuid) to authenticated;
grant execute on function public.aurevia_delete_linked_journal_entry(uuid,uuid,uuid) to authenticated;
