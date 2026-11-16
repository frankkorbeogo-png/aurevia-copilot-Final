-- Harden public-schema privileges.
-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER privileges.
-- Anonymous clients do not need direct access to AUREVIA application tables.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Tables protected by RLS but intentionally without client policies are service-only.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = n.nspname
          AND p.tablename = c.relname
      )
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', item.relname);
  END LOOP;
END
$$;

-- Future public tables/functions/sequences must receive explicit client grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
