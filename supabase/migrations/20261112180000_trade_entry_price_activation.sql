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
