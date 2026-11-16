-- Align the worker close RPC with the FX snapshot payload and close expiry/activation races.
-- All changes are additive; no production schema is changed until this migration is approved and applied.
-- Remove the legacy arity so PostgREST has one unambiguous worker signature.
drop function if exists public.aurevia_record_position_close_worker(uuid,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,uuid);
alter table public.trading_position_closes
  add column if not exists fx_snapshot jsonb;

-- Server-only atomic close path for scheduled internal TP/SL monitoring.
-- This is an AUREVIA ledger update, never broker execution.
create or replace function public.aurevia_record_position_close_worker(
  p_close_id uuid,
  p_position_id uuid,
  p_volume numeric,
  p_exit_price numeric,
  p_gross_pnl numeric,
  p_fees numeric,
  p_net_pnl numeric,
  p_closed_at timestamptz,
  p_user_id uuid,
  p_fx_snapshot jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := p_user_id;
  v_position public.trading_positions%rowtype;
  v_group public.trading_position_groups%rowtype;
  v_existing public.trading_position_closes%rowtype;
  v_closed numeric;
  v_remaining numeric;
  v_gross numeric;
  v_fees numeric;
  v_net numeric;
  v_status text;
  v_group_status text;
  v_journal_net numeric;
  v_journal_gross numeric;
  v_journal_fees numeric;
  v_group_remaining numeric;
  v_all_closed boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Accès réservé au service de surveillance'; end if;
  if v_user is null then raise exception 'Utilisateur requis'; end if;
  if p_close_id is null or p_position_id is null or p_volume is null or p_volume <= 0
     or p_exit_price is null or p_exit_price <= 0 or p_gross_pnl is null
     or p_fees is null or p_fees < 0 or p_net_pnl is null or p_closed_at is null then
    raise exception 'Paramètres de clôture invalides';
  end if;
  if abs(p_net_pnl - (p_gross_pnl - p_fees)) > 0.0000001 then
    raise exception 'Résultat net incohérent avec le brut et les frais';
  end if;

  select * into v_position
  from public.trading_positions
  where id = p_position_id and user_id = v_user
  for update;
  if not found then raise exception 'Position introuvable'; end if;

  -- A retry with the same event id is harmless and cannot double-count P/L.
  select * into v_existing from public.trading_position_closes where id = p_close_id;
  if found then
    if v_existing.position_id <> p_position_id or v_existing.user_id <> v_user then
      raise exception 'Identifiant de clôture déjà utilisé';
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true,
      'volume_remaining', v_position.volume_remaining, 'status', v_position.status,
      'net_pnl', v_position.net_pnl);
  end if;

  if v_position.status <> 'OPEN' or p_volume > v_position.volume_remaining + 0.00000001 then
    raise exception 'Volume clôturé supérieur au volume restant ou position déjà clôturée';
  end if;

  insert into public.trading_position_closes
    (id, position_id, user_id, volume, exit_price, gross_pnl, fees, net_pnl, closed_at, fx_snapshot)
  values
    (p_close_id, p_position_id, v_user, p_volume, p_exit_price, p_gross_pnl, p_fees, p_net_pnl, p_closed_at, p_fx_snapshot);

  select coalesce(sum(volume),0), coalesce(sum(gross_pnl),0),
         coalesce(sum(fees),0), coalesce(sum(net_pnl),0)
    into v_closed, v_gross, v_fees, v_net
  from public.trading_position_closes
  where position_id = p_position_id and user_id = v_user;

  v_remaining := greatest(0, v_position.volume_initial - v_closed);
  v_status := case when v_remaining <= 0.00000001 then 'CLOSED' else 'OPEN' end;
  update public.trading_positions set
    volume_remaining = v_remaining, gross_pnl = v_gross, fees = v_fees,
    net_pnl = v_net, status = v_status,
    closed_at = case when v_status = 'CLOSED' then p_closed_at else null end,
    updated_at = now()
  where id = p_position_id and user_id = v_user;

  select * into v_group from public.trading_position_groups
  where id = v_position.group_id and user_id = v_user for update;
  if not found then raise exception 'Groupe de positions introuvable'; end if;

  if v_group.auto_journal then
    if v_group.mode = 'unique' then
      select coalesce(sum(net_pnl),0), coalesce(sum(gross_pnl),0),
             coalesce(sum(fees),0), coalesce(sum(volume_remaining),0),
             bool_and(status = 'CLOSED')
        into v_journal_net, v_journal_gross, v_journal_fees, v_group_remaining, v_all_closed
      from public.trading_positions where group_id = v_group.id and user_id = v_user;
      update public.trading_journal set pnl = v_journal_net, gross_pnl = v_journal_gross,
        fees = v_journal_fees, volume_remaining = v_group_remaining,
        result = case when coalesce(v_all_closed,false) then
          case when v_journal_net > 0 then 'WIN' when v_journal_net < 0 then 'LOSS' else 'BREAKEVEN' end
          else 'OPEN' end,
        closed_at = case when coalesce(v_all_closed,false) then p_closed_at else null end,
        updated_at = now()
      where user_id = v_user and group_id = v_group.id and position_id is null;
    else
      update public.trading_journal set pnl = v_net, gross_pnl = v_gross, fees = v_fees,
        volume_remaining = v_remaining,
        result = case when v_status = 'CLOSED' then
          case when v_net > 0 then 'WIN' when v_net < 0 then 'LOSS' else 'BREAKEVEN' end
          else 'OPEN' end,
        closed_at = case when v_status = 'CLOSED' then p_closed_at else null end,
        updated_at = now()
      where user_id = v_user and position_id = p_position_id;
    end if;
  end if;

  select bool_and(status = 'CLOSED') into v_all_closed
  from public.trading_positions where group_id = v_group.id and user_id = v_user;
  v_group_status := case when coalesce(v_all_closed,false) then 'CLOSED' else 'OPEN' end;
  update public.trading_position_groups set status = v_group_status, updated_at = now()
  where id = v_group.id and user_id = v_user;

  return jsonb_build_object('ok', true, 'duplicate', false,
    'volume_remaining', v_remaining, 'status', v_status,
    'net_pnl', v_net, 'group_status', v_group_status);
end;
$$;

revoke all on function public.aurevia_record_position_close_worker(uuid,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.aurevia_record_position_close_worker(uuid,uuid,numeric,numeric,numeric,numeric,numeric,timestamptz,uuid,jsonb) to service_role;


-- Pending trade activation on the entry quote. AUREVIA tracks an internal ledger only;
-- it never sends, modifies, or executes orders at a broker.
alter table public.trading_positions
  drop constraint if exists trading_positions_status_check;
alter table public.trading_positions
  add constraint trading_positions_status_check check (status in ('PENDING','OPEN','CLOSED','CANCELLED'));

alter table public.trading_positions
  add column if not exists trigger_seen boolean not null default false,
  add column if not exists activated_at timestamptz,
  add column if not exists activation_price numeric(20,10),
  add column if not exists activation_notified boolean not null default false;

create index if not exists trading_positions_pending_monitor_idx
  on public.trading_positions(status, group_id) where status in ('PENDING','OPEN');

create or replace function public.aurevia_activate_pending_position_worker(
  p_position_id uuid,
  p_user_id uuid,
  p_activation_price numeric,
  p_activated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position public.trading_positions%rowtype;
  v_group public.trading_position_groups%rowtype;
  v_updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Accès réservé au service de surveillance';
  end if;
  if p_position_id is null or p_user_id is null or p_activation_price is null
     or p_activation_price <= 0 or p_activated_at is null then
    raise exception 'Paramètres d’activation invalides';
  end if;

  select * into v_position
  from public.trading_positions
  where id = p_position_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Position introuvable'; end if;
  if v_position.status = 'OPEN' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', 'OPEN');
  end if;
  if v_position.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'status', v_position.status);
  end if;
  -- Expiry is enforced under the same row lock as activation; a delayed expiry worker cannot revive an expired order.
  if v_position.expires_at is not null and v_position.expires_at <= p_activated_at then
    return jsonb_build_object('ok', false, 'status', 'EXPIRED', 'reason', 'ORDER_EXPIRED');
  end if;

  update public.trading_positions
  set status = 'OPEN', activated_at = p_activated_at,
      activation_price = p_activation_price, updated_at = now()
  where id = p_position_id and user_id = p_user_id and status = 'PENDING';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', 'OPEN');
  end if;

  select * into v_group from public.trading_position_groups
  where id = v_position.group_id and user_id = p_user_id;
  if not found then raise exception 'Groupe de positions introuvable'; end if;

  if v_group.auto_journal then
    if v_group.mode = 'unique' then
      update public.trading_journal set result = 'OPEN', updated_at = now()
      where user_id = p_user_id and group_id = v_group.id
        and position_id is null and result = 'PENDING';
    else
      update public.trading_journal set result = 'OPEN', updated_at = now()
      where user_id = p_user_id and position_id = p_position_id and result = 'PENDING';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'status', 'OPEN');
end;
$$;

revoke all on function public.aurevia_activate_pending_position_worker(uuid,uuid,numeric,timestamptz) from public, anon, authenticated;
grant execute on function public.aurevia_activate_pending_position_worker(uuid,uuid,numeric,timestamptz) to service_role;


-- Latest executable-side quotes are written only by the persistent market stream worker.
create table if not exists public.aurevia_market_quotes (
  symbol text primary key,
  bid numeric(20,10) not null check (bid > 0),
  ask numeric(20,10) not null check (ask > 0 and ask >= bid),
  quote_at timestamptz not null,
  source text not null default 'Twelve Data WebSocket',
  updated_at timestamptz not null default now()
);
alter table public.aurevia_market_quotes enable row level security;
revoke all on public.aurevia_market_quotes from public, anon, authenticated;
grant select, insert, update, delete on public.aurevia_market_quotes to service_role;
