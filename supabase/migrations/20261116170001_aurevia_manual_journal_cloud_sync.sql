-- Manual journal entries remain isolated from position-linked entries.
alter table public.trading_journal drop constraint if exists trading_journal_mode_check;
alter table public.trading_journal add constraint trading_journal_mode_check check(mode is null or mode=any(array['unique'::text,'separate'::text,'manual'::text]));
create or replace function public.aurevia_sync_manual_journal(p_entries jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_entry jsonb; v_id uuid; v_instrument text; v_direction text; v_pnl numeric; v_date timestamptz; v_note text; v_result text;
begin
 if auth.uid() is null or public.aurevia_session_is_active() is not true then raise exception using errcode='42501',message='ACTIVE_SESSION_REQUIRED'; end if;
 if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)>500 then raise exception using errcode='22023',message='INVALID_MANUAL_JOURNAL_BATCH'; end if;
 for v_entry in select value from jsonb_array_elements(p_entries) loop
  v_id:=(v_entry->>'id')::uuid; v_instrument:=nullif(btrim(v_entry->>'instrument'),''); v_direction:=upper(v_entry->>'direction'); v_pnl:=(v_entry->>'result')::numeric; v_date:=((v_entry->>'date')::date)::timestamp at time zone 'UTC'; v_note:=left(coalesce(v_entry->>'note',''),4000);
  if v_instrument is null or v_direction not in ('BUY','SELL') or v_pnl is null then raise exception using errcode='22023',message='INVALID_MANUAL_JOURNAL_ENTRY'; end if;
  v_result:=case when v_pnl>0 then 'WIN' when v_pnl<0 then 'LOSS' else 'BREAKEVEN' end;
  insert into public.trading_journal(id,user_id,instrument,direction,result,pnl,notes,opened_at,closed_at,mode,fees) values(v_id,auth.uid(),v_instrument,v_direction,v_result,v_pnl,v_note,v_date,v_date,'manual',0)
  on conflict(id) do update set instrument=excluded.instrument,direction=excluded.direction,result=excluded.result,pnl=excluded.pnl,notes=excluded.notes,opened_at=excluded.opened_at,closed_at=excluded.closed_at,updated_at=now()
  where trading_journal.user_id=auth.uid() and trading_journal.group_id is null and trading_journal.position_id is null and trading_journal.mode='manual';
 end loop; return jsonb_build_object('ok',true);
end; $$;
create or replace function public.aurevia_delete_manual_journal_entry(p_entry_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_deleted integer;
begin
 if auth.uid() is null or public.aurevia_session_is_active() is not true then raise exception using errcode='42501',message='ACTIVE_SESSION_REQUIRED'; end if;
 delete from public.trading_journal where id=p_entry_id and user_id=auth.uid() and group_id is null and position_id is null and mode='manual'; get diagnostics v_deleted=row_count; return jsonb_build_object('ok',true,'deleted',v_deleted);
end; $$;
revoke all on function public.aurevia_sync_manual_journal(jsonb) from public,anon; revoke all on function public.aurevia_delete_manual_journal_entry(uuid) from public,anon; grant execute on function public.aurevia_sync_manual_journal(jsonb) to authenticated; grant execute on function public.aurevia_delete_manual_journal_entry(uuid) to authenticated;
