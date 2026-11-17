-- The legacy confirmation_score column held the initial M15 scenario score.
-- Backfill it once into the new, explicitly named scenario_score column.
update public.aurevia_analysis_scenarios
set scenario_score = confirmation_score
where scenario_score is null
  and confirmation_score is not null;
