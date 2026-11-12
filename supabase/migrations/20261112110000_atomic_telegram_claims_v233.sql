-- Atomic worker claims prevent concurrent trade-watch invocations from sending the same event.
alter table public.aurevia_trade_alert_events
  drop constraint if exists aurevia_trade_alert_events_status_check;
alter table public.aurevia_trade_alert_events
  add constraint aurevia_trade_alert_events_status_check
  check (status in ('pending','processing','sent','cancelled'));
alter table public.aurevia_trade_alert_events
  add column if not exists locked_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

create or replace function public.aurevia_claim_trade_alert_events(p_limit integer default 25)
returns setof public.aurevia_trade_alert_events
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Accès réservé au service de surveillance';
  end if;
  return query
  with candidates as (
    select id from public.aurevia_trade_alert_events
    where status = 'pending'
       or (status = 'processing' and locked_at < now() - interval '5 minutes')
    order by created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,25),100))
  )
  update public.aurevia_trade_alert_events e
     set status = 'processing', locked_at = now(), attempt_count = attempt_count + 1
    from candidates c
   where e.id = c.id
  returning e.*;
end;
$$;

create or replace function public.aurevia_finish_trade_alert_event(p_event_id uuid, p_sent boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Accès réservé au service de surveillance';
  end if;
  update public.aurevia_trade_alert_events
     set status = case when p_sent then 'sent' else 'pending' end,
         sent_at = case when p_sent then now() else null end,
         locked_at = null
   where id = p_event_id and status = 'processing';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.aurevia_claim_trade_alert_events(integer) from public, anon, authenticated;
revoke all on function public.aurevia_finish_trade_alert_event(uuid,boolean) from public, anon, authenticated;
grant execute on function public.aurevia_claim_trade_alert_events(integer) to service_role;
grant execute on function public.aurevia_finish_trade_alert_event(uuid,boolean) to service_role;
