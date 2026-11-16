-- Staging baseline marker: 20261116092955_staging_schema_snapshot_primary_constraints.
-- The baseline objects are already created by the canonical migrations preceding
-- this marker on production. Staging has this version recorded from its baseline
-- snapshot; keep the version present to avoid migration-history drift.
do $$ begin null; end $$;
