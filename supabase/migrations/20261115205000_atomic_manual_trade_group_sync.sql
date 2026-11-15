-- AUREVIA: synchronisation atomique des trades manuels et du journal lié.
-- Le client prépare le payload, mais toutes les écritures cloud sont faites dans
-- une seule transaction PostgreSQL. Les états de suivi et les P/L existants
-- ne sont jamais écrasés par une synchronisation de paramètres.
create or replace function public.aurevia_sync_trade_group(
  p_group jsonb,
  p_positions jsonb,
  p_journal jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_mode text;
  v_auto_journal boolean;
  v_group_count integer := 0;
  v_position_count integer := 0;
  v_journal_count integer := 0;
  v_row jsonb;
  v_journal jsonb;
  v_position_id uuid;
  v_journal_id uuid;
  v_position_ids uuid[] := array[]::uuid[];
  v_journal_position_ids uuid[] := array[]::uuid[];
  v_mappings jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.aurevia_session_is_active() then
    raise exception 'AUREVIA_SESSION_REQUIRED';
  end if;
  if p_group is null or jsonb_typeof(p_group) <> 'object' then
    raise exception 'INVALID_TRADE_GROUP_PAYLOAD';
  end if;
  if p_positions is null or jsonb_typeof(p_positions) <> 'array' then
    raise exception 'INVALID_TRADE_GROUP_POSITIONS';
  end if;
  if jsonb_array_length(p_positions) < 1 then
    raise exception 'EMPTY_TRADE_GROUP';
  end if;
  if jsonb_typeof(coalesce(p_journal,'[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_TRADE_JOURNAL_PAYLOAD';
  end if;

  v_group_id := nullif(p_group->>'id','')::uuid;
  v_mode := p_group->>'mode';
  v_auto_journal := coalesce((p_group->>'auto_journal')::boolean,false);
  if v_group_id is null or v_mode is null or v_mode not in ('unique','separate') then
    raise exception 'INVALID_TRADE_GROUP';
  end if;

  -- Serialise retries and concurrent edits of the same group.
  perform pg_advisory_xact_lock(hashtextextended(v_group_id::text, 0));

  insert into public.trading_position_groups(
    id,user_id,mode,instrument,direction,order_type,requested_volume,lot_step,
    auto_journal,status,contract_spec,broker_snapshot,created_at,updated_at
  ) values (
    v_group_id,v_user_id,v_mode,p_group->>'instrument',p_group->>'direction',
    coalesce(p_group->>'order_type','MARKET'),
    (p_group->>'requested_volume')::numeric,
    coalesce(nullif(p_group->>'lot_step','')::numeric,0.01),
    v_auto_journal,coalesce(p_group->>'status','OPEN'),
    p_group->'contract_spec',p_group->'broker_snapshot',
    coalesce(nullif(p_group->>'created_at','')::timestamptz,now()),now()
  )
  on conflict(id) do update set
    mode=excluded.mode,
    instrument=excluded.instrument,
    direction=excluded.direction,
    order_type=excluded.order_type,
    requested_volume=excluded.requested_volume,
    lot_step=excluded.lot_step,
    auto_journal=excluded.auto_journal,
    contract_spec=excluded.contract_spec,
    broker_snapshot=excluded.broker_snapshot,
    updated_at=now()
  where public.trading_position_groups.user_id=v_user_id;
  get diagnostics v_group_count = row_count;

  if v_group_count <> 1 then
    raise exception 'TRADE_GROUP_NOT_OWNED';
  end if;

  for v_row in select value from jsonb_array_elements(p_positions)
  loop
    v_position_id := nullif(v_row->>'id','')::uuid;
    if v_position_id is null or nullif(v_row->>'group_id','')::uuid is distinct from v_group_id then
      raise exception 'INVALID_TRADE_POSITION';
    end if;
    if v_position_id = any(v_position_ids) then
      raise exception 'DUPLICATE_TRADE_POSITION';
    end if;
    v_position_ids := array_append(v_position_ids,v_position_id);

    insert into public.trading_positions(
      id,group_id,user_id,tp_label,entry_price,stop_loss,take_profit,
      trigger_price,limit_price,expires_at,volume_initial,volume_remaining,
      contract_size,quote_to_account,fees_per_lot,contract_spec,status,
      trigger_seen,activated_at,activation_price,opened_at,updated_at
    ) values (
      v_position_id,v_group_id,v_user_id,coalesce(v_row->>'tp_label','TP'),
      (v_row->>'entry_price')::numeric,(v_row->>'stop_loss')::numeric,
      (v_row->>'take_profit')::numeric,
      nullif(v_row->>'trigger_price','')::numeric,
      nullif(v_row->>'limit_price','')::numeric,
      nullif(v_row->>'expires_at','')::timestamptz,
      (v_row->>'volume_initial')::numeric,(v_row->>'volume_remaining')::numeric,
      nullif(v_row->>'contract_size','')::numeric,
      coalesce(nullif(v_row->>'quote_to_account','')::numeric,1),
      coalesce(nullif(v_row->>'fees_per_lot','')::numeric,0),
      v_row->'contract_spec',coalesce(v_row->>'status','OPEN'),
      coalesce((v_row->>'trigger_seen')::boolean,false),
      nullif(v_row->>'activated_at','')::timestamptz,
      nullif(v_row->>'activation_price','')::numeric,
      coalesce(nullif(v_row->>'opened_at','')::timestamptz,now()),now()
    )
    on conflict(id) do update set
      tp_label=excluded.tp_label,
      entry_price=excluded.entry_price,
      stop_loss=excluded.stop_loss,
      take_profit=excluded.take_profit,
      trigger_price=excluded.trigger_price,
      limit_price=excluded.limit_price,
      expires_at=excluded.expires_at,
      volume_initial=excluded.volume_initial,
      contract_size=excluded.contract_size,
      quote_to_account=excluded.quote_to_account,
      fees_per_lot=excluded.fees_per_lot,
      contract_spec=excluded.contract_spec,
      updated_at=now()
    where public.trading_positions.user_id=v_user_id
      and public.trading_positions.group_id=v_group_id;
    get diagnostics v_position_count = row_count;

    if v_position_count <> 1 then
      raise exception 'TRADE_POSITION_NOT_OWNED';
    end if;
  end loop;

  if not v_auto_journal and jsonb_array_length(coalesce(p_journal,'[]'::jsonb)) <> 0 then
    raise exception 'JOURNAL_NOT_ENABLED_FOR_GROUP';
  end if;

  if v_auto_journal then
    if jsonb_array_length(coalesce(p_journal,'[]'::jsonb)) <>
       case when v_mode='unique' then 1 else cardinality(v_position_ids) end then
      raise exception 'INVALID_TRADE_JOURNAL_MAPPING';
    end if;

    for v_journal in select value from jsonb_array_elements(coalesce(p_journal,'[]'::jsonb))
    loop
      if nullif(v_journal->>'group_id','')::uuid is distinct from v_group_id
         or v_journal->>'mode' is distinct from v_mode
         or v_journal->>'instrument' is distinct from p_group->>'instrument'
         or v_journal->>'direction' is distinct from p_group->>'direction' then
        raise exception 'INVALID_TRADE_JOURNAL_ROW';
      end if;

      if v_mode='unique' then
        if v_journal->>'position_id' is not null then
          raise exception 'INVALID_UNIQUE_JOURNAL_MAPPING';
        end if;
        insert into public.trading_journal(
          user_id,instrument,direction,result,pnl,notes,group_id,position_id,mode,
          volume_initial,volume_remaining,tp_label,gross_pnl,fees,
          entry_price,stop_loss,take_profit,opened_at,created_at,updated_at
        ) values (
          v_user_id,v_journal->>'instrument',v_journal->>'direction','OPEN',0,
          v_journal->>'notes',v_group_id,null,'unique',
          (v_journal->>'volume_initial')::numeric,
          (v_journal->>'volume_remaining')::numeric,v_journal->>'tp_label',0,0,
          nullif(v_journal->>'entry_price','')::numeric,
          nullif(v_journal->>'stop_loss','')::numeric,
          nullif(v_journal->>'take_profit','')::numeric,
          coalesce(nullif(v_journal->>'created_at','')::timestamptz,now()),
          coalesce(nullif(v_journal->>'created_at','')::timestamptz,now()),now()
        )
        on conflict(user_id,group_id) where group_id is not null and position_id is null
        do update set
          instrument=excluded.instrument,direction=excluded.direction,mode='unique',
          notes=excluded.notes,volume_initial=excluded.volume_initial,
          entry_price=excluded.entry_price,stop_loss=excluded.stop_loss,
          take_profit=excluded.take_profit,updated_at=now()
        returning id into v_journal_id;
        update public.trading_positions set journal_id=v_journal_id,updated_at=now()
        where group_id=v_group_id and user_id=v_user_id;
        v_mappings := v_mappings || jsonb_build_array(jsonb_build_object('id',v_journal_id,'positionId',null));
      else
        v_position_id := nullif(v_journal->>'position_id','')::uuid;
        if v_position_id is null or not (v_position_id=any(v_position_ids))
           or v_position_id=any(v_journal_position_ids) then
          raise exception 'INVALID_SEPARATE_JOURNAL_MAPPING';
        end if;
        v_journal_position_ids := array_append(v_journal_position_ids,v_position_id);
        insert into public.trading_journal(
          user_id,instrument,direction,result,pnl,notes,group_id,position_id,mode,
          volume_initial,volume_remaining,tp_label,gross_pnl,fees,
          entry_price,stop_loss,take_profit,opened_at,created_at,updated_at
        ) values (
          v_user_id,v_journal->>'instrument',v_journal->>'direction','OPEN',0,
          v_journal->>'notes',v_group_id,v_position_id,'separate',
          (v_journal->>'volume_initial')::numeric,
          (v_journal->>'volume_remaining')::numeric,v_journal->>'tp_label',0,0,
          nullif(v_journal->>'entry_price','')::numeric,
          nullif(v_journal->>'stop_loss','')::numeric,
          nullif(v_journal->>'take_profit','')::numeric,
          coalesce(nullif(v_journal->>'created_at','')::timestamptz,now()),
          coalesce(nullif(v_journal->>'created_at','')::timestamptz,now()),now()
        )
        on conflict(user_id,position_id) where position_id is not null
        do update set
          instrument=excluded.instrument,direction=excluded.direction,mode='separate',
          notes=excluded.notes,volume_initial=excluded.volume_initial,
          tp_label=excluded.tp_label,entry_price=excluded.entry_price,
          stop_loss=excluded.stop_loss,take_profit=excluded.take_profit,updated_at=now()
        returning id into v_journal_id;
        update public.trading_positions set journal_id=v_journal_id,updated_at=now()
        where id=v_position_id and group_id=v_group_id and user_id=v_user_id;
        v_mappings := v_mappings || jsonb_build_array(jsonb_build_object('id',v_journal_id,'positionId',v_position_id));
      end if;
      v_journal_count := v_journal_count + 1;
    end loop;
    if v_mode='separate' and cardinality(v_journal_position_ids) <> cardinality(v_position_ids) then
      raise exception 'INCOMPLETE_SEPARATE_JOURNAL_MAPPING';
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'group_id',v_group_id,'positions_synced',cardinality(v_position_ids),
    'journal_synced',v_journal_count,'journal_mappings',v_mappings
  );
end;
$$;

revoke all on function public.aurevia_sync_trade_group(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.aurevia_sync_trade_group(jsonb,jsonb,jsonb) to authenticated;
