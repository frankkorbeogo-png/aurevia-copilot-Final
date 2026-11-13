-- Telegram lot confirmation for an already confirmed AUREVIA scenario.
alter table public.aurevia_analysis_scenarios
  add column if not exists lot_confirmation_code text,
  add column if not exists lot_confirmation_expires_at timestamptz,
  add column if not exists trade_group_id uuid references public.trading_position_groups(id) on delete set null,
  add column if not exists trade_created_at timestamptz;
create unique index if not exists aurevia_scenario_lot_code_unique
  on public.aurevia_analysis_scenarios(lot_confirmation_code)
  where lot_confirmation_code is not null;

create or replace function public.aurevia_create_position_from_scenario(
  p_scenario_id uuid, p_user_id uuid, p_mode text, p_volume numeric
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  s public.aurevia_analysis_scenarios%rowtype;
  prefs jsonb; broker jsonb; spec jsonb;
  v_min numeric; v_step numeric; v_max numeric; v_contract numeric; v_quote numeric; v_fees numeric;
  v_group uuid; v_position uuid; v_journal uuid;
  v_count integer; v_idx integer := 0; v_child numeric; v_remaining numeric;
  v_entry numeric; v_order text; v_leverage numeric;
  tp numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_mode not in ('unique','separate') or p_volume is null or p_volume <= 0 then raise exception 'INVALID_LOT_INPUT'; end if;
  select * into s from public.aurevia_analysis_scenarios where id=p_scenario_id and user_id=p_user_id for update;
  if not found then raise exception 'SCENARIO_NOT_FOUND'; end if;
  if s.status <> 'entry_confirmed' then raise exception 'SCENARIO_NOT_CONFIRMED'; end if;
  if s.trade_group_id is not null then return s.trade_group_id; end if;
  if s.lot_confirmation_expires_at is null or s.lot_confirmation_expires_at < now() then raise exception 'LOT_CONFIRMATION_EXPIRED'; end if;
  select preferences into prefs from public.user_preferences where user_id=p_user_id;
  broker := coalesce(prefs->'broker_settings','{}'::jsonb);
  v_leverage := nullif(broker->>'leverage','')::numeric;
  if coalesce(broker->>'brokerName','')='' or coalesce(broker->>'accountType','')='' or coalesce(broker->>'accountCurrency','')='' or v_leverage is null or v_leverage<1 then raise exception 'BROKER_ACCOUNT_SETTINGS_REQUIRED'; end if;
  spec := coalesce(broker->'instruments'->upper(s.instrument),'{}'::jsonb);
  v_min := nullif(spec->>'minLot','')::numeric;
  v_step := nullif(spec->>'lotStep','')::numeric;
  v_max := nullif(spec->>'maxLot','')::numeric;
  v_contract := nullif(spec->>'contractSize','')::numeric;
  v_quote := nullif(spec->>'quoteToAccount','')::numeric;
  v_fees := coalesce(nullif(spec->>'feesPerLot','')::numeric,0);
  if v_min is null or v_step is null or v_contract is null or v_quote is null then raise exception 'BROKER_INSTRUMENT_SETTINGS_REQUIRED'; end if;
  if v_min<=0 or v_step<=0 or v_contract<=0 or v_quote<=0 or v_fees<0 then raise exception 'BROKER_INSTRUMENT_SETTINGS_INVALID'; end if;
  if p_volume < v_min or abs((p_volume/v_step)-round(p_volume/v_step)) > 0.00000001 then raise exception 'LOT_STEP_INVALID'; end if;
  v_count := cardinality(s.take_profits);
  if p_mode='unique' then
    if v_max is not null and p_volume>v_max then raise exception 'LOT_MAX_EXCEEDED'; end if;
    v_child := floor((p_volume/v_count)/v_step)*v_step;
    if v_child < v_min then raise exception 'LOT_TOO_SMALL_FOR_TP_SPLIT'; end if;
  else
    if v_max is not null and p_volume>v_max then raise exception 'LOT_MAX_EXCEEDED'; end if;
  end if;
  v_entry := coalesce(s.last_price,s.entry);
  if v_entry<=0 then raise exception 'ENTRY_PRICE_UNAVAILABLE'; end if;
  -- The M15 entry is already confirmed; this record is a manually executed market position.
  v_order := 'MARKET';
  insert into public.trading_position_groups(user_id,mode,instrument,direction,order_type,requested_volume,lot_step,auto_journal,status)
  values(p_user_id,p_mode,s.instrument,s.direction,v_order,p_volume,v_step,true,'OPEN') returning id into v_group;
  v_remaining := p_volume;
  foreach tp in array s.take_profits loop
    v_idx := v_idx+1;
    if p_mode='unique' then
      v_child := case when v_idx=v_count then v_remaining else floor((p_volume/v_count)/v_step)*v_step end;
      v_remaining := v_remaining-v_child;
    else v_child := p_volume;
    end if;
    insert into public.trading_positions(group_id,user_id,tp_label,entry_price,stop_loss,take_profit,volume_initial,volume_remaining,contract_size,quote_to_account,fees_per_lot,status,opened_at)
    values(v_group,p_user_id,'TP'||v_idx,v_entry,s.stop_loss,tp,v_child,v_child,v_contract,v_quote,v_fees,'OPEN',now()) returning id into v_position;
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
end; $$;
revoke all on function public.aurevia_create_position_from_scenario(uuid,uuid,text,numeric) from public, anon, authenticated;
grant execute on function public.aurevia_create_position_from_scenario(uuid,uuid,text,numeric) to service_role;
