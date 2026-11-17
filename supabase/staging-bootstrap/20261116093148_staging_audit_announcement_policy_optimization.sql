-- Staging baseline marker: 20261116093148_staging_audit_announcement_policy_optimization.
-- The optimized announcement policies are versioned separately in
-- 20261116144857_optimize_announcement_rls_and_fk_index.sql so production
-- receives the same effective policy definitions.
do $$ begin null; end $$;
