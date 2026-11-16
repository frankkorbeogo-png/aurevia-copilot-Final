alter table public.trading_position_closes
  add column if not exists fx_snapshot jsonb;

comment on column public.trading_position_closes.fx_snapshot is
  'FX conversion snapshot used for this close: from, to, rate, fetchedAt, source. Null when quote and account currencies are identical or point/tick value is already in account currency.';
