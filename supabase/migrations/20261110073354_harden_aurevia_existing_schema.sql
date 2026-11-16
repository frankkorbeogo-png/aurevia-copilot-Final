begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create table if not exists app_private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by text
);
alter table app_private.admin_users enable row level security;
revoke all on app_private.admin_users from public, anon, authenticated;
grant select, insert, update, delete on app_private.admin_users to service_role;

-- Remove broad default table grants. RLS remains the row-level boundary.
revoke all on public.profiles, public.user_preferences,
  public.telegram_connections, public.announcements, public.trading_journal
from anon;

revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, display_name, avatar_url) on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

revoke all on public.user_preferences from authenticated;
grant select, insert, update on public.user_preferences to authenticated;

revoke all on public.telegram_connections from authenticated;
grant select on public.telegram_connections to authenticated;
grant update (notify_all_analyses, notify_validated_signals, notify_economic_announcements)
  on public.telegram_connections to authenticated;

revoke all on public.announcements from authenticated;
grant select on public.announcements to authenticated;

revoke all on public.trading_journal from authenticated;
grant select, insert, update, delete on public.trading_journal to authenticated;

drop policy if exists "Users insert own preferences" on public.user_preferences;
create policy "Users insert own preferences" on public.user_preferences
for insert to authenticated with check ((select auth.uid()) = user_id);

-- Keep telegram identity/chat binding server-managed. Users may only change notification flags.
drop policy if exists "Users update own Telegram notification choices" on public.telegram_connections;
create policy "Users update own Telegram notification choices" on public.telegram_connections
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Ensure journal ownership is checked on both read and write.
drop policy if exists "Users manage own trading journal" on public.trading_journal;
create policy "Users manage own trading journal" on public.trading_journal
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Reassert announcement publication window; only authenticated users can read current items.
drop policy if exists "Users read active announcements" on public.announcements;
create policy "Users read active announcements" on public.announcements
for select to authenticated
using (is_published = true and starts_at <= now() and (ends_at is null or ends_at > now()));

commit;
