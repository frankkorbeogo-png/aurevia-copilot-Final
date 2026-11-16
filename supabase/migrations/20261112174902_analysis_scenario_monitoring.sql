-- User-controlled analysis scenarios. This is internal AUREVIA monitoring only.
create table if not exists public.aurevia_analysis_scenarios (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 instrument text not null,
 direction text not null check(direction in ('BUY','SELL')),
 entry_low numeric(20,10) not null check(entry_low>0),
 entry_high numeric(20,10) not null check(entry_high>=entry_low),
 entry numeric(20,10) not null check(entry>0),
 stop_loss numeric(20,10) not null check(stop_loss>0),
 take_profits numeric(20,10)[] not null check(cardinality(take_profits) between 1 and 3),
 summary text not null,
 source text not null check(source in ('ai','synthesis')),
 order_type text,
 status text not null default 'monitoring' check(status in ('monitoring','zone_reached','entry_confirmed','stopped','invalidated')),
 zone_notified boolean not null default false,
 entry_notified boolean not null default false,
 last_price numeric(20,10),
 last_price_at timestamptz,
 zone_reached_at timestamptz,
 entry_confirmed_at timestamptz,
 stopped_at timestamptz,
 stop_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists aurevia_analysis_scenarios_active_idx on public.aurevia_analysis_scenarios(status,created_at) where status in ('monitoring','zone_reached');
create index if not exists aurevia_analysis_scenarios_user_idx on public.aurevia_analysis_scenarios(user_id,created_at desc);
alter table public.aurevia_analysis_scenarios enable row level security;
revoke all on public.aurevia_analysis_scenarios from public,anon,authenticated;
grant select,insert,update,delete on public.aurevia_analysis_scenarios to service_role;
