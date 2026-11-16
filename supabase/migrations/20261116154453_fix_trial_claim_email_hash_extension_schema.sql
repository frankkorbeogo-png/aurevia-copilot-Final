-- Preserve the extension schema resolution for trial email fingerprinting.
-- This mirrors the staging hotfix and is idempotent when the function already
-- has the correct search_path from the preceding trial-claim migration.
alter function public.aurevia_license_status(uuid)
  set search_path = pg_catalog, public, extensions, pg_temp;
