-- Centre d’annonces : historique publié et suivi de lecture individuel.
drop policy if exists "Users read active announcements" on public.announcements;
drop policy if exists "Users read published announcements" on public.announcements;
create policy "Users read published announcements"
on public.announcements for select to authenticated
using (is_published = true);

create table if not exists public.announcement_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.announcement_reads enable row level security;

drop policy if exists "Users read own announcement reads" on public.announcement_reads;
create policy "Users read own announcement reads"
on public.announcement_reads for select to authenticated
using (auth.uid() = user_id and aurevia_session_is_active());

drop policy if exists "Users mark own announcements read" on public.announcement_reads;
create policy "Users mark own announcements read"
on public.announcement_reads for insert to authenticated
with check (auth.uid() = user_id and aurevia_session_is_active());
