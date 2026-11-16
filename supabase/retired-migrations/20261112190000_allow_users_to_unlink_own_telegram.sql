-- Allow an authenticated user to unlink only their own Telegram connection.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='telegram_connections'
      and policyname='Users can delete their own Telegram connection'
  ) then
    create policy "Users can delete their own Telegram connection"
      on public.telegram_connections
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
