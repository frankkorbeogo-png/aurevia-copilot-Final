-- A unique trade is one manual execution split into TP children.
-- Once one child is active and the user confirms the actual fill, all remaining
-- TP children belong to that same execution and must become OPEN together.
create or replace function public.aurevia_update_actual_fill_price(
  p_group_id uuid,
  p_position_id uuid,
  p_actual_entry_price numeric
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  g public.trading_position_groups%rowtype;
  p public.trading_positions%rowtype;
  v_count integer := 0;
begin
  if auth.uid() is null or public.aurevia_session_is_active() is not true then
    raise exception using errcode='42501', message='ACTIVE_SESSION_REQUIRED';
  end if;
  if p_group_id is null or p_actual_entry_price is null or p_actual_entry_price<=0 then
    raise exception 'INVALID_ACTUAL_FILL_PRICE';
  end if;
  select * into g from public.trading_position_groups
    where id=p_group_id and user_id=auth.uid() for update;
  if not found or g.status<>'OPEN' then raise exception 'OPEN_TRADE_GROUP_REQUIRED'; end if;

  if g.mode='unique' then
    if p_position_id is not null then raise exception 'UNIQUE_GROUP_POSITION_ID_NOT_ALLOWED'; end if;
    if exists(select 1 from public.trading_positions where group_id=p_group_id and user_id=auth.uid() and status in ('CLOSED','CANCELLED')) then
      raise exception 'UNIQUE_GROUP_ALREADY_PARTIALLY_CLOSED';
    end if;
    if not exists(select 1 from public.trading_positions where group_id=p_group_id and user_id=auth.uid() and status='OPEN') then
      raise exception 'UNIQUE_GROUP_NOT_ACTIVATED_YET';
    end if;
    if exists(
      select 1 from public.trading_positions
      where group_id=p_group_id and user_id=auth.uid()
        and (case when g.direction='BUY'
          then p_actual_entry_price<=stop_loss or p_actual_entry_price>=take_profit
          else p_actual_entry_price>=stop_loss or p_actual_entry_price<=take_profit end)
    ) then raise exception 'ACTUAL_FILL_PRICE_OUTSIDE_SL_TP'; end if;
    update public.trading_positions set
      entry_price=p_actual_entry_price,
      actual_entry_price=p_actual_entry_price,
      status='OPEN',
      activated_at=coalesce(activated_at,now()),
      activation_price=coalesce(activation_price,p_actual_entry_price),
      entry_armed=true,
      updated_at=now()
      where group_id=p_group_id and user_id=auth.uid() and status in ('OPEN','PENDING');
    get diagnostics v_count=row_count;
    update public.trading_journal set entry_price=p_actual_entry_price,
      actual_entry_price=p_actual_entry_price,updated_at=now()
      where group_id=p_group_id and user_id=auth.uid() and position_id is null;
    update public.trading_position_groups set actual_entry_price=p_actual_entry_price,updated_at=now()
      where id=p_group_id and user_id=auth.uid();
  else
    if p_position_id is null then raise exception 'SEPARATE_POSITION_ID_REQUIRED'; end if;
    select * into p from public.trading_positions
      where id=p_position_id and group_id=p_group_id and user_id=auth.uid() for update;
    if not found or p.status<>'OPEN' then raise exception 'OPEN_SEPARATE_POSITION_REQUIRED'; end if;
    if g.direction='BUY' and (p_actual_entry_price<=p.stop_loss or p_actual_entry_price>=p.take_profit)
       or g.direction='SELL' and (p_actual_entry_price>=p.stop_loss or p_actual_entry_price<=p.take_profit) then
      raise exception 'ACTUAL_FILL_PRICE_OUTSIDE_SL_TP';
    end if;
    update public.trading_positions set entry_price=p_actual_entry_price,
      actual_entry_price=p_actual_entry_price,updated_at=now()
      where id=p_position_id and group_id=p_group_id and user_id=auth.uid();
    get diagnostics v_count=row_count;
    update public.trading_journal set entry_price=p_actual_entry_price,
      actual_entry_price=p_actual_entry_price,updated_at=now()
      where group_id=p_group_id and position_id=p_position_id and user_id=auth.uid();
  end if;
  if v_count<1 then raise exception 'NO_POSITION_UPDATED'; end if;
  return jsonb_build_object('ok',true,'group_id',p_group_id,'position_id',p_position_id,
    'actual_entry_price',p_actual_entry_price,'positions_updated',v_count);
end;
$$;
revoke all on function public.aurevia_update_actual_fill_price(uuid,uuid,numeric) from public,anon;
grant execute on function public.aurevia_update_actual_fill_price(uuid,uuid,numeric) to authenticated;
