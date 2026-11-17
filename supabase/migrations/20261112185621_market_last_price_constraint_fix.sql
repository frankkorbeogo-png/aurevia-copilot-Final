alter table public.aurevia_market_quotes
  drop constraint if exists aurevia_market_quotes_check;

alter table public.aurevia_market_quotes
  add constraint aurevia_market_quotes_check
  check (
    (bid is null and ask is null)
    or
    (bid is not null and ask is not null and bid > 0 and ask >= bid)
  );

alter table public.aurevia_market_quotes
  drop constraint if exists aurevia_market_quotes_price_check;

alter table public.aurevia_market_quotes
  add constraint aurevia_market_quotes_price_check
  check (price is null or price > 0);
