-- Require an observed price crossing before activating a pending entry.
alter table public.trading_positions
  add column if not exists last_observed_price numeric(20,10),
  add column if not exists entry_armed boolean not null default false;

comment on column public.trading_positions.last_observed_price is
  'Last market price observed by AUREVIA while the internal position is pending.';
comment on column public.trading_positions.entry_armed is
  'True only after AUREVIA has observed the price on the non-trigger side of the pending entry threshold.';
