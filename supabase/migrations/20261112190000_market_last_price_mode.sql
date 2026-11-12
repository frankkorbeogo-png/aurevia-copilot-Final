-- Switch AUREVIA internal monitoring to one observed market Last Price.
-- BID/ASK are no longer required or synthesized.
alter table public.aurevia_market_quotes
  alter column bid drop not null,
  alter column ask drop not null;

alter table public.aurevia_market_quotes
  add column if not exists price numeric(20,10);

alter table public.aurevia_market_quotes
  drop constraint if exists aurevia_market_quotes_bid_check,
  drop constraint if exists aurevia_market_quotes_ask_check;

alter table public.aurevia_market_quotes
  add constraint aurevia_market_quotes_bid_check check (bid is null or bid > 0),
  add constraint aurevia_market_quotes_ask_check check (ask is null or ask > 0);

comment on column public.aurevia_market_quotes.price is
  'Single observed market Last Price used for AUREVIA internal trigger and TP/SL monitoring; not an executable broker quote.';
