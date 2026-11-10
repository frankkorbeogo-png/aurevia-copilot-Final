create table if not exists public.trading_position_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('unique','separate')),
  instrument text not null,
  direction text not null check (direction in ('BUY','SELL')),
  order_type text not null check (order_type in ('MARKET','BUY LIMIT','BUY STOP','BUY STOP LIMIT','SELL LIMIT','SELL STOP','SELL STOP LIMIT')),
  requested_volume numeric(18,8) not null check (requested_volume > 0),
  auto_journal boolean not null default true,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.trading_positions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.trading_position_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_id uuid references public.trading_journal(id) on delete set null,
  tp_label text not null,
  entry_price numeric(20,10) not null check (entry_price > 0),
  stop_loss numeric(20,10) not null check (stop_loss > 0),
  take_profit numeric(20,10) not null check (take_profit > 0),
  trigger_price numeric(20,10), limit_price numeric(20,10),
  volume_initial numeric(18,8) not null check (volume_initial > 0),
  volume_remaining numeric(18,8) not null check (volume_remaining >= 0 and volume_remaining <= volume_initial),
  contract_size numeric(20,8), quote_to_account numeric(20,10) not null default 1 check (quote_to_account > 0),
  fees_per_lot numeric(20,8) not null default 0 check (fees_per_lot >= 0),
  gross_pnl numeric(20,8) not null default 0, fees numeric(20,8) not null default 0, net_pnl numeric(20,8) not null default 0,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED','CANCELLED')),
  opened_at timestamptz not null default now(), closed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, group_id, user_id)
);
create table if not exists public.trading_position_closes (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.trading_positions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  volume numeric(18,8) not null check (volume > 0), exit_price numeric(20,10) not null check (exit_price > 0),
  gross_pnl numeric(20,8) not null, fees numeric(20,8) not null default 0 check (fees >= 0), net_pnl numeric(20,8) not null,
  closed_at timestamptz not null default now(), created_at timestamptz not null default now()
);
alter table public.trading_journal
  add column if not exists group_id uuid references public.trading_position_groups(id) on delete set null,
  add column if not exists position_id uuid references public.trading_positions(id) on delete set null,
  add column if not exists mode text check (mode is null or mode in ('unique','separate')),
  add column if not exists volume_initial numeric(18,8), add column if not exists volume_remaining numeric(18,8),
  add column if not exists tp_label text, add column if not exists gross_pnl numeric(20,8), add column if not exists fees numeric(20,8) not null default 0;
create unique index if not exists trading_journal_unique_group_parent on public.trading_journal(user_id, group_id) where group_id is not null and position_id is null;
create unique index if not exists trading_journal_unique_position_child on public.trading_journal(user_id, position_id) where position_id is not null;
create index if not exists trading_positions_user_status_idx on public.trading_positions(user_id, status, opened_at desc);
create index if not exists trading_positions_group_idx on public.trading_positions(group_id, created_at);
create index if not exists trading_position_closes_position_idx on public.trading_position_closes(position_id, closed_at desc);
alter table public.trading_position_groups enable row level security;
alter table public.trading_positions enable row level security;
alter table public.trading_position_closes enable row level security;
drop policy if exists "Users manage own position groups" on public.trading_position_groups;
create policy "Users manage own position groups" on public.trading_position_groups for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage own positions" on public.trading_positions;
create policy "Users manage own positions" on public.trading_positions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage own position closes" on public.trading_position_closes;
create policy "Users manage own position closes" on public.trading_position_closes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.trading_position_groups to authenticated;
grant select, insert, update, delete on public.trading_positions to authenticated;
grant select, insert, update, delete on public.trading_position_closes to authenticated;
grant select, insert, update, delete on public.trading_journal to authenticated;
