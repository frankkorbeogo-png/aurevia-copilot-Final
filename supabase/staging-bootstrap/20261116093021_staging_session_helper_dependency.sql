-- Staging baseline marker: 20261116093021_staging_session_helper_dependency.
-- The baseline objects are already created by the canonical migrations preceding
-- this marker on production. Staging has this version recorded from its baseline
-- snapshot; keep the version present to avoid migration-history drift.
do $$ begin null; end $$;
