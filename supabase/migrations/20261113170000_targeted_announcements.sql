-- Audience ciblée des annonces AUREVIA : une annonce sans destinataires est globale.
create table if not exists public.announcement_recipients (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcement_recipients_user_idx
  on public.announcement_recipients(user_id, announcement_id);

alter table public.announcement_recipients enable row level security;

drop policy if exists "Users read own announcement recipients" on public.announcement_recipients;
create policy "Users read own announcement recipients"
  on public.announcement_recipients for select to authenticated
  using (auth.uid() = user_id and aurevia_session_is_active());

-- Les annonces sans audience définie restent générales ; celles ciblées ne sont
-- visibles que par les comptes inscrits dans announcement_recipients.
drop policy if exists "Users read published announcements" on public.announcements;
create policy "Users read published announcements"
  on public.announcements for select to authenticated
  using (
    is_published = true
    and (starts_at is null or starts_at <= now())
    and (
      not exists (
        select 1 from public.announcement_recipients ar
        where ar.announcement_id = announcements.id
      )
      or exists (
        select 1 from public.announcement_recipients ar
        where ar.announcement_id = announcements.id
          and ar.user_id = auth.uid()
      )
    )
    and aurevia_session_is_active()
  );
