create index if not exists aurevia_analysis_scenarios_trade_group_id_idx on public.aurevia_analysis_scenarios(trade_group_id) where trade_group_id is not null;
