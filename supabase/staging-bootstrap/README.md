# Staging bootstrap snapshots

These SQL snapshots were created only to bootstrap the isolated Supabase project aurevia-audit-staging on 2026-11-16. They are retained for audit and recovery reference.

**Never apply these files to production.** They are stored outside supabase/migrations so Supabase CLI migration discovery does not include them.

The staging database has its own migration ledger: bootstrap snapshots and subsequent migrations were applied with generated version identifiers. It is not currently aligned with the production migration history. Do not run supabase db push against staging until its migration ledger is explicitly repaired or the staging project is rebuilt from the canonical production migration set.
