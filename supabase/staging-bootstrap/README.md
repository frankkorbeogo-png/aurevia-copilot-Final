# Staging bootstrap snapshots

These SQL snapshots were created only to bootstrap the isolated Supabase project aurevia-audit-staging on 2026-11-16. They are retained for audit and recovery reference.

**Never apply these files to the production project.** They are deliberately stored outside supabase/migrations so Supabase CLI migration discovery does not include them.

Production schema history predates this staging project and must be reconciled separately before any production migration push.
