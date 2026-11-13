-- Persist Groq's proposed scenario, estimated probability and human-readable reasoning.
alter table public.aurevia_analysis_scenarios
  add column if not exists estimated_win_rate numeric(5,2),
  add column if not exists probability_status text not null default 'NOT_PROVIDED',
  add column if not exists probability_rationale text not null default '',
  add column if not exists confirmation_score integer,
  add column if not exists reasoning text not null default '';
alter table public.aurevia_analysis_scenarios
  drop constraint if exists aurevia_analysis_scenarios_estimated_win_rate_check;
alter table public.aurevia_analysis_scenarios
  add constraint aurevia_analysis_scenarios_estimated_win_rate_check
  check (estimated_win_rate is null or estimated_win_rate between 5 and 95);
alter table public.aurevia_analysis_scenarios
  drop constraint if exists aurevia_analysis_scenarios_confirmation_score_check;
alter table public.aurevia_analysis_scenarios
  add constraint aurevia_analysis_scenarios_confirmation_score_check
  check (confirmation_score is null or confirmation_score between 0 and 100);
