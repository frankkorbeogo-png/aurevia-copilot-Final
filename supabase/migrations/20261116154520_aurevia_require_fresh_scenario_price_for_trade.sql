create or replace function app_private.aurevia_guard_fresh_scenario_price()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.trade_group_id is not null and old.trade_group_id is null then
    if new.last_price_at is null
       or new.last_price_at < now() - interval '2 minutes'
       or new.last_price_at > now() + interval '5 seconds' then
      raise exception 'SCENARIO_PRICE_STALE';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.aurevia_guard_fresh_scenario_price() from public, anon, authenticated, service_role;

drop trigger if exists aurevia_require_fresh_scenario_price on public.aurevia_analysis_scenarios;
create trigger aurevia_require_fresh_scenario_price
before update of trade_group_id on public.aurevia_analysis_scenarios
for each row
execute function app_private.aurevia_guard_fresh_scenario_price();
