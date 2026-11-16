-- Staging baseline marker: 20261116092956_staging_schema_snapshot_foreign_keys.
-- The baseline objects are already created by the canonical migrations preceding
-- this marker on production. Staging has this version recorded from its baseline
-- snapshot; keep the version present to avoid migration-history drift.
do $$ begin null; end $$;
