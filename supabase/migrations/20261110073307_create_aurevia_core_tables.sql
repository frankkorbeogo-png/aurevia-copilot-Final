create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  notify_all_analyses boolean not null default true,
  notify_validated_signals boolean not null default true,
  notify_economic_announcements boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  chat_id text unique,
  username text,
  connected_at timestamptz,
  notify_all_analyses boolean not null default true,
  notify_validated_signals boolean not null default true,
  notify_economic_announcements boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'economic',
  source_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trading_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument text not null,
  direction text not null check (direction in ('BUY','SELL')),
  timeframe text,
  entry_price numeric(20,8),
  stop_loss numeric(20,8),
  take_profit numeric(20,8),
  exit_price numeric(20,8),
  result text check (result in ('WIN','LOSS','BREAKEVEN','OPEN')),
  pnl numeric(20,8),
  notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trading_journal_user_opened_idx
  on public.trading_journal (user_id, opened_at desc);
create index announcements_published_window_idx
  on public.announcements (is_published, starts_at, ends_at);

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure app_private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.announcements enable row level security;
alter table public.trading_journal enable row level security;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.user_preferences to authenticated;
grant update (preferences, notify_all_analyses, notify_validated_signals, notify_economic_announcements) on public.user_preferences to authenticated;
grant select on public.telegram_connections to authenticated;
grant update (notify_all_analyses, notify_validated_signals, notify_economic_announcements) on public.telegram_connections to authenticated;
grant select on public.announcements to authenticated;
grant select, insert, update, delete on public.trading_journal to authenticated;

create policy "Users read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users update own profile fields"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users read own preferences"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users update own preferences"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read own Telegram connection"
  on public.telegram_connections for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users update own Telegram notification choices"
  on public.telegram_connections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users read active announcements"
  on public.announcements for select to authenticated
  using (
    is_published = true
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

create policy "Users manage own trading journal"
  on public.trading_journal for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
