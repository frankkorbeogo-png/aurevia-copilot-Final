-- Align production announcement RLS policies with the validated staging policy shape.
-- Wrapping auth/session helpers in scalar SELECTs lets PostgreSQL evaluate them
-- once per statement instead of once per candidate row.
create index if not exists announcement_reads_announcement_id_idx
  on public.announcement_reads(announcement_id);

drop policy if exists "Users mark own announcements read" on public.announcement_reads;
create policy "Users mark own announcements read"
  on public.announcement_reads for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.aurevia_session_is_active())
  );

drop policy if exists "Users read own announcement reads" on public.announcement_reads;
create policy "Users read own announcement reads"
  on public.announcement_reads for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.aurevia_session_is_active())
  );

drop policy if exists "Users read own announcement recipients" on public.announcement_recipients;
create policy "Users read own announcement recipients"
  on public.announcement_recipients for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.aurevia_session_is_active())
  );

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
          and ar.user_id = (select auth.uid())
      )
    )
    and (select public.aurevia_session_is_active())
  );
