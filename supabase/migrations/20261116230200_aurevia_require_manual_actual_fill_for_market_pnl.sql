-- A market position must be created with the user's real manual execution price.
-- Conditional orders may be registered before activation, but their P/L stays paused
-- until the user records the actual fill after the internal trigger.
create or replace function public.aurevia_require_manual_actual_fill_for_market()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if upper(coalesce(new.order_type,''))='MARKET'
     and (new.actual_entry_price is null or new.actual_entry_price<=0) then
    raise exception using errcode='23514', message='ACTUAL_FILL_PRICE_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists aurevia_require_manual_actual_fill_for_market
  on public.trading_position_groups;
create trigger aurevia_require_manual_actual_fill_for_market
before insert or update of order_type, actual_entry_price
on public.trading_position_groups
for each row
execute function public.aurevia_require_manual_actual_fill_for_market();

revoke all on function public.aurevia_require_manual_actual_fill_for_market() from public,anon,authenticated;
