-- Staging baseline marker: 20261116093116_staging_schema_snapshot_function_privileges.
-- Canonical production migrations already define the baseline objects and
-- privileges. This no-op records the staging snapshot version without replaying
-- snapshot DDL against production.
do $$ begin null; end $$;
