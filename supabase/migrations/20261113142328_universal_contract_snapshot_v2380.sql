-- V2.3.80: broker/instrument specifications are captured at position entry.
-- The same snapshot is used by the browser and the server-side TP/SL watcher.
alter table public.trading_position_groups
  add column if not exists contract_spec jsonb,
  add column if not exists broker_snapshot jsonb;

alter table public.trading_positions
  add column if not exists contract_spec jsonb;

create or replace function public.aurevia_create_position_from_scenario(
  p_scenario_id uuid,
  p_user_id uuid,
  p_mode text,
  p_volume numeric,
  p_contract_spec jsonb,
  p_broker_snapshot jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  s public.aurevia_analysis_scenarios%rowtype;
  v_min numeric; v_step numeric; v_max numeric;
  v_contract numeric; v_quote numeric; v_fees numeric;
  v_point_size numeric; v_point_value numeric; v_tick_size numeric; v_tick_value numeric;
  v_margin numeric; v_calc text; v_currency text; v_broker text;
  v_group uuid; v_position uuid; v_journal uuid;
  v_count integer; v_idx integer := 0; v_child numeric; v_remaining numeric;
  v_entry numeric; tp numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_mode not in ('unique','separate') or p_volume is null or p_volume <= 0 then raise exception 'INVALID_LOT_INPUT'; end if;
  if coalesce(jsonb_typeof(p_contract_spec),'') <> 'object' or coalesce(jsonb_typeof(p_broker_snapshot),'') <> 'object' then raise exception 'CONTRACT_SPEC_REQUIRED'; end if;

  v_broker := nullif(btrim(p_broker_snapshot->>'brokerName'),'');
  v_currency := upper(nullif(btrim(p_broker_snapshot->>'accountCurrency'),''));
  if v_broker is null or v_currency is null or v_currency !~ '^[A-Z]{3,8}$' then raise exception 'BROKER_ACCOUNT_SETTINGS_REQUIRED'; end if;
  v_calc := lower(coalesce(p_contract_spec->>'calculationType',''));
  v_min := nullif(p_contract_spec->>'minLot','')::numeric;
  v_step := nullif(p_contract_spec->>'lotStep','')::numeric;
  v_max := nullif(p_contract_spec->>'maxLot','')::numeric;
  v_contract := nullif(p_contract_spec->>'contractSize','')::numeric;
  v_quote := nullif(p_contract_spec->>'quoteToAccount','')::numeric;
  v_point_size := nullif(p_contract_spec->>'pointSize','')::numeric;
  v_point_value := nullif(p_contract_spec->>'pointValue','')::numeric;
  v_tick_size := nullif(p_contract_spec->>'tickSize','')::numeric;
  v_tick_value := nullif(p_contract_spec->>'tickValue','')::numeric;
  v_fees := coalesce(nullif(p_contract_spec->>'feesPerLot','')::numeric,0);
  v_margin := nullif(p_contract_spec->>'marginPerLot','')::numeric;
  if v_calc not in ('contract','point','tick') then raise exception 'CALCULATION_TYPE_INVALID'; end if;
  if v_min is null or v_min<=0 or v_step is null or v_step<=0 or v_fees<0 or (v_max is not null and v_max<v_min) then raise exception 'LOT_SPEC_INVALID'; end if;
  if v_calc='contract' and (v_contract is null or v_contract<=0 or v_quote is null or v_quote<=0) then raise exception 'CONTRACT_SIZE_OR_CONVERSION_REQUIRED'; end if;
  if v_calc='point' and (v_point_size is null or v_point_size<=0 or v_point_value is null or v_point_value<=0) then raise exception 'POINT_SPEC_REQUIRED'; end if;
  if v_calc='tick' and (v_tick_size is null or v_tick_size<=0 or v_tick_value is null or v_tick_value<=0) then raise exception 'TICK_SPEC_REQUIRED'; end if;
  if v_margin is not null and v_margin<0 then raise exception 'MARGIN_SPEC_INVALID'; end if;
  if p_volume < v_min or (v_max is not null and p_volume>v_max) or abs((p_volume/v_step)-round(p_volume/v_step)) > 0.00000001 then raise exception 'LOT_STEP_INVALID'; end if;

  select * into s from public.aurevia_analysis_scenarios where id=p_scenario_id and user_id=p_user_id for update;
  if not found then raise exception 'SCENARIO_NOT_FOUND'; end if;
  if s.status <> 'entry_confirmed' then raise exception 'SCENARIO_NOT_CONFIRMED'; end if;
  if s.trade_group_id is not null then return s.trade_group_id; end if;
  if s.lot_confirmation_expires_at is null or s.lot_confirmation_expires_at < now() then raise exception 'LOT_CONFIRMATION_EXPIRED'; end if;

  v_count := cardinality(s.take_profits);
  if v_count is null or v_count<1 then raise exception 'SCENARIO_TAKE_PROFITS_REQUIRED'; end if;
  if p_mode='unique' then
    v_child := floor((p_volume/v_count)/v_step)*v_step;
    if v_child < v_min then raise exception 'LOT_TOO_SMALL_FOR_TP_SPLIT'; end if;
  end if;
  v_entry := coalesce(s.last_price,s.entry);
  if v_entry is null or v_entry<=0 then raise exception 'ENTRY_PRICE_UNAVAILABLE'; end if;

  insert into public.trading_position_groups(user_id,mode,instrument,direction,order_type,requested_volume,lot_step,auto_journal,status,contract_spec,broker_snapshot)
  values(p_user_id,p_mode,s.instrument,s.direction,'MARKET',p_volume,v_step,true,'OPEN',p_contract_spec,p_broker_snapshot)
  returning id into v_group;

  v_remaining := p_volume;
  foreach tp in array s.take_profits loop
    v_idx := v_idx+1;
    if p_mode='unique' then
      v_child := case when v_idx=v_count then v_remaining else floor((p_volume/v_count)/v_step)*v_step end;
      v_remaining := v_remaining-v_child;
    else v_child := p_volume;
    end if;
    insert into public.trading_positions(group_id,user_id,tp_label,entry_price,stop_loss,take_profit,volume_initial,volume_remaining,contract_size,quote_to_account,fees_per_lot,contract_spec,status,opened_at)
    values(v_group,p_user_id,'TP'||v_idx,v_entry,s.stop_loss,tp,v_child,v_child,case when v_calc='contract' then v_contract else null end,case when v_calc='contract' then v_quote else 1 end,v_fees,p_contract_spec,'OPEN',now()) returning id into v_position;
    if p_mode='separate' then
      insert into public.trading_journal(user_id,instrument,direction,result,pnl,notes,group_id,position_id,mode,volume_initial,volume_remaining,tp_label,gross_pnl,fees,entry_price,stop_loss,take_profit)
      values(p_user_id,s.instrument,s.direction,'OPEN',0,'Trade Telegram AUREVIA · TP'||v_idx,v_group,v_position,'separate',v_child,v_child,'TP'||v_idx,0,0,v_entry,s.stop_loss,tp) returning id into v_journal;
      update public.trading_positions set journal_id=v_journal where id=v_position;
    end if;
  end loop;

  if p_mode='unique' then
    insert into public.trading_journal(user_id,instrument,direction,result,pnl,notes,group_id,mode,volume_initial,volume_remaining,gross_pnl,fees,entry_price,stop_loss,take_profit)
    values(p_user_id,s.instrument,s.direction,'OPEN',0,'Position unique Telegram AUREVIA · clôtures partielles',v_group,'unique',p_volume,p_volume,0,0,v_entry,s.stop_loss,s.take_profits[1]) returning id into v_journal;
    update public.trading_positions set journal_id=v_journal where group_id=v_group;
  end if;

  update public.aurevia_analysis_scenarios set trade_group_id=v_group,trade_created_at=now(),lot_confirmation_code=null,lot_confirmation_expires_at=null,updated_at=now() where id=s.id;
  return v_group;
end;
$$;

revoke all on function public.aurevia_create_position_from_scenario(uuid,uuid,text,numeric,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.aurevia_create_position_from_scenario(uuid,uuid,text,numeric,jsonb,jsonb) to service_role;
