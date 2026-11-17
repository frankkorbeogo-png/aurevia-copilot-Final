-- Persist AI-generated M5 entry proposals independently from M15 scenario levels.
alter table public.aurevia_analysis_scenarios
  add column if not exists last_m5_analysis_at timestamptz,
  add column if not exists m5_ai_reason text,
  add column if not exists m5_ai_proposal jsonb;

comment on column public.aurevia_analysis_scenarios.last_m5_analysis_at is
  'Latest fully closed M5 candle analyzed by the three-AI entry confirmation pipeline.';
comment on column public.aurevia_analysis_scenarios.m5_ai_reason is
  'Human-readable reasoning or WAIT explanation returned by the M5 AI pipeline.';
comment on column public.aurevia_analysis_scenarios.m5_ai_proposal is
  'Structured M5 AI proposal and independent review; never an execution instruction.';
