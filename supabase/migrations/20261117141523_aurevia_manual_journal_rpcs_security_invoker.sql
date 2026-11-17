-- The manual journal RPCs only operate on rows owned by auth.uid().
-- Keep the active-session check, but let the caller's RLS policies enforce ownership
-- instead of bypassing RLS with SECURITY DEFINER.
ALTER FUNCTION public.aurevia_sync_manual_journal(jsonb)
  SECURITY INVOKER;
ALTER FUNCTION public.aurevia_sync_manual_journal(jsonb)
  SET search_path = pg_catalog, public, auth;
REVOKE ALL ON FUNCTION public.aurevia_sync_manual_journal(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aurevia_sync_manual_journal(jsonb)
  TO authenticated, service_role;

ALTER FUNCTION public.aurevia_delete_manual_journal_entry(uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.aurevia_delete_manual_journal_entry(uuid)
  SET search_path = pg_catalog, public, auth;
REVOKE ALL ON FUNCTION public.aurevia_delete_manual_journal_entry(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aurevia_delete_manual_journal_entry(uuid)
  TO authenticated, service_role;
