-- Prevent overlapping scheduled workers from charging three AI calls for the same closed M5 candle.
create or replace function public.aurevia_claim_m5_analysis(
  p_scenario_id uuid,
  p_closed_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claimed uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501', message='SERVICE_ROLE_REQUIRED';
  end if;
  if p_scenario_id is null or p_closed_at is null or p_closed_at>now()+interval '1 minute' then
    raise exception 'INVALID_M5_ANALYSIS_CLAIM';
  end if;
  update public.aurevia_analysis_scenarios
    set last_m5_analysis_at=p_closed_at,updated_at=now()
    where id=p_scenario_id
      and status='zone_reached'
      and (last_m5_analysis_at is null or last_m5_analysis_at<p_closed_at)
    returning id into v_claimed;
  return v_claimed is not null;
end;
$$;
revoke all on function public.aurevia_claim_m5_analysis(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.aurevia_claim_m5_analysis(uuid,timestamptz) to service_role;
