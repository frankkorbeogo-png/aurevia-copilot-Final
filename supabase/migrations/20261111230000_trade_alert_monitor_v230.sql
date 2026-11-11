-- AUREVIA internal TP/SL alert idempotency ledger. No broker integration.
create table if not exists public.aurevia_trade_alert_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  position_id uuid not null references public.trading_positions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('TP','SL')),
  observed_price numeric(20,10) not null check (observed_price > 0),
  closed_volume numeric(18,8) not null check (closed_volume > 0),
  status text not null default 'pending' check (status in ('pending','sent','cancelled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists aurevia_trade_alert_events_user_created_idx on public.aurevia_trade_alert_events(user_id,created_at desc);
alter table public.aurevia_trade_alert_events enable row level security;
revoke all on public.aurevia_trade_alert_events from public,anon,authenticated;
grant select,insert,update,delete on public.aurevia_trade_alert_events to service_role;
