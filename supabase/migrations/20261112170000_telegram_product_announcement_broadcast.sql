alter table public.telegram_connections
  add column if not exists notify_product_announcements boolean not null default false;

alter table public.announcements
  add column if not exists telegram_broadcast_started_at timestamptz;

alter table public.announcements
  add column if not exists telegram_broadcast_completed_at timestamptz;

alter table public.announcements
  add column if not exists telegram_broadcast_result jsonb;
