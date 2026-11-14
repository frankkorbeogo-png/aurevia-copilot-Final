-- Store the analysis context used when a monitored scenario is approved.
alter table public.aurevia_analysis_scenarios
  add column if not exists timeframe_analysis jsonb not null default '{}'::jsonb;

comment on column public.aurevia_analysis_scenarios.timeframe_analysis is
  'Compact H4/H1/M30/M15/M5 analysis snapshot used by the scenario monitor; no broker data or execution.';
