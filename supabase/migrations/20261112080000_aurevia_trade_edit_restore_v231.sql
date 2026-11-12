-- AUREVIA COPILOT V2.3.1: conserver les paramètres nécessaires à la restauration
-- et permettre la mise à jour cohérente des fiches de journal liées.
alter table public.trading_position_groups
  add column if not exists lot_step numeric(18,8) not null default 0.01
  check (lot_step > 0);

alter table public.trading_journal
  add column if not exists entry_price numeric(20,10),
  add column if not exists stop_loss numeric(20,10),
  add column if not exists take_profit numeric(20,10);
