-- Remove unused direct table privileges from unauthenticated API role.
-- RLS already blocks anonymous rows; this adds least-privilege at the SQL grant layer.
-- Authenticated-user and service_role permissions are intentionally unchanged.
revoke all privileges on table
  public.announcement_reads,
  public.announcement_recipients,
  public.cme_calendar_sync,
  public.trading_position_closes,
  public.trading_position_groups,
  public.trading_positions
from anon;
